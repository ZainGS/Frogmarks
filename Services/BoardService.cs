using AutoMapper;
using Duende.IdentityServer.Extensions;
using Frogmarks.Data;
using Frogmarks.Models.Board;
using Frogmarks.Models.Team;
using Frogmarks.SignalR.Hubs;
using Frogmarks.SignalR.Optimizers;
using Frogmarks.Utilities;
using Frogmarks.WebSockets;
using Microsoft.EntityFrameworkCore;
using System.Collections.Generic;
using System.ComponentModel;
using System.Linq;
using System.Security.Claims;
using System.Threading.Tasks;
using static Microsoft.EntityFrameworkCore.DbLoggerCategory;

namespace Frogmarks.Services
{
    public class BoardService : IBoardService
    {
        private readonly IApplicationDbContext _context;
        private readonly IMapper _mapper;
        private readonly BatchService _batchService;
        private readonly IHttpContextAccessor _httpContextAccessor;

        public BoardService(IApplicationDbContext context, IMapper mapper, BatchService batchService, IHttpContextAccessor httpContextAccessor)
        {
            _context = context;
            _mapper = mapper;
            _batchService = batchService;
            _httpContextAccessor = httpContextAccessor;
        }

        public async Task<ResultModel<IEnumerable<Board>>> GetAllBoards()
        {
            try
            {
                var boards = await _context.Boards.ToListAsync();
                return new ResultModel<IEnumerable<Board>>(ResultType.Success, resultObject: boards);
            }
            catch (Exception ex)
            {
                // Log the exception if needed
                throw;
            }
        }

        public async Task<ResultModel<Board>> GetBoardById(long id)
        {
            try
            {
                var board = await _context.Boards.FindAsync(id);
                if (board == null)
                {
                    return new ResultModel<Board>(ResultType.NotFound, "Board not found");
                }

                var userId = GetCurrentUserId();
                if (!userId.IsNullOrEmpty())
                {
                    // Fetch the TeamUser entries corresponding to the ApplicationUserId
                    var teamUserIds = await _context.TeamUsers
                        .Where(tu => tu.ApplicationUserId == userId)
                        .Select(tu => tu.Id)
                        .ToListAsync();

                    foreach (var teamUserId in teamUserIds)
                    {
                        var boardViewLog = await _context.BoardViewLogs
                            .FirstOrDefaultAsync(bvl => bvl.BoardId == board.Id && bvl.TeamUserId == teamUserId);

                        if (boardViewLog == null)
                        {
                            boardViewLog = new BoardViewLog
                            {
                                BoardId = board.Id,
                                TeamUserId = teamUserId,
                                LastViewed = DateTime.UtcNow
                            };
                            _context.BoardViewLogs.Add(boardViewLog);
                        }
                        else
                        {
                            boardViewLog.LastViewed = DateTime.UtcNow;
                            _context.BoardViewLogs.Update(boardViewLog);
                        }
                    }

                    await _context.SaveChangesAsync();
                }

                return new ResultModel<Board>(ResultType.Success, resultObject: board);
            }
            catch (Exception ex)
            {
                // Log the exception if needed
                throw;
            }
        }

        private string? GetCurrentUserId()
        {
            return _httpContextAccessor.HttpContext?.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        }

        public async Task<ResultModel<Board>> CreateBoard(BoardDto boardDto)
        {
            try
            {
                var newBoard = _mapper.Map<Board>(boardDto);
                newBoard.UUID = Guid.NewGuid();

                // Add the new board to the context
                _context.Boards.Add(newBoard);
                await _context.SaveChangesAsync();

                return new ResultModel<Board>(ResultType.Success, resultObject: newBoard);
            }
            catch (Exception ex)
            {
                // Log the exception if needed
                return new ResultModel<Board>(ResultType.Failure, ex.Message);
            }
        }

        public async Task<ResultModel<Board>> UpdateBoard(BoardDto boardDto)
        {
            try
            {
                var existingBoard = await _context.Boards.FindAsync(boardDto.Id);
                if (existingBoard == null)
                {
                    return new ResultModel<Board>(ResultType.NotFound, "Board not found");
                }

                // Map the changes from boardDto to the existingBoard
                _mapper.Map(boardDto, existingBoard);

                // Mark the existing board as modified & update
                _context.Boards.Update(existingBoard);
                await _context.SaveChangesAsync();

                // Alert Batch Service of updated board item
                _batchService.Batch(BatchTypes.Board, boardDto.Id);

                return new ResultModel<Board>(ResultType.Success, resultObject: existingBoard);
            }
            catch (Exception ex)
            {
                // Log the exception if needed
                throw;
            }
        }

        public async Task<ResultModel<Board>> FavoritedBoard(BoardDto boardDto)
        {
            try
            {
                var existingBoard = await _context.Boards.FindAsync(boardDto.Id);
                if (existingBoard == null)
                {
                    return new ResultModel<Board>(ResultType.NotFound, "Board not found");
                }

                // Map the changes from boardDto to the existingBoard
                _mapper.Map(boardDto, existingBoard);

                var userId = GetCurrentUserId();
                var teamUser = await _context.TeamUsers.SingleOrDefaultAsync(tu => tu.ApplicationUserId == userId);

                if (boardDto.IsFavorite)
                {
                    if (teamUser != null && !teamUser.FavoriteBoards.Contains(existingBoard))
                    {
                        teamUser.FavoriteBoards.Add(existingBoard);
                    }
                }
                else
                {
                    teamUser?.FavoriteBoards.Remove(existingBoard);
                }

                await _context.SaveChangesAsync();

                return new ResultModel<Board>(ResultType.Success, resultObject: existingBoard);
            }
            catch (Exception ex)
            {
                // Log the exception if needed
                return new ResultModel<Board>(ResultType.Failure, ex.Message);
            }
        }

        public async Task<ResultModel<Board>> DeleteBoard(long id)
        {
            try
            {
                var board = await _context.Boards.FindAsync(id);
                if (board == null)
                {
                    return new ResultModel<Board>(ResultType.NotFound, "Board not found");
                }

                _context.Boards.Remove(board);
                await _context.SaveChangesAsync();
                return new ResultModel<Board>(ResultType.Success, resultObject: board);
            }
            catch (Exception ex)
            {
                // Log the exception if needed
                throw;
            }
        }

        public async Task<ResultModel<IEnumerable<BoardDto>>> SearchBoards(string name, long teamId, bool favorites, string sortBy, string sortDirection, int pageIndex, int pageSize)
        {
            try
            {
                var userId = GetCurrentUserId();

                if (userId.IsNullOrEmpty())
                {
                    return new ResultModel<IEnumerable<BoardDto>>(ResultType.Unauthorized, "User not found");
                }

                // Base query for boards
                var query = _context.Boards.AsQueryable();

                if(teamId > 0)
                {
                    query.Where(board => board.TeamId == teamId);
                }

                if (favorites)
                {
                    query = query.Where(board => _context.TeamUsers
                        .Where(tu => tu.ApplicationUserId == userId)
                        .SelectMany(tu => tu.FavoriteBoards)
                        .Select(fb => fb.Id)
                        .Contains(board.Id));
                }

                // Filtering
                if (!string.IsNullOrEmpty(name))
                {
                    query = query.Where(b => b.Name.Contains(name));
                }

                // Sorting by sortBy and sortDirection
                switch (sortBy.ToLower())
                {
                    case "alphabetical":
                        query = sortDirection.ToLower() == "desc" ? query.OrderByDescending(b => b.Name) : query.OrderBy(b => b.Name);
                        break;
                    case "datecreated":
                        query = sortDirection.ToLower() == "desc" ? query.OrderByDescending(b => b.Created) : query.OrderBy(b => b.Created);
                        break;
                    case "lastviewed":
                        query = sortDirection.ToLower() == "desc" ? query.OrderByDescending(b => b.Created) : query.OrderBy(b => b.Created);
                        break;
                    default:
                        query = sortDirection.ToLower() == "desc" ? query.OrderByDescending(b => b.Created) : query.OrderBy(b => b.Created);
                        break;
                }

                // Pagination
                //var result = await query.Skip(pageIndex * pageSize).Take(pageSize)
                var result = await query
                    .Select(b => new BoardDto
                    {
                        Id = b.Id,
                        UUID = b.UUID,
                        Name = b.Name,
                        Description = b.Description,
                        ThumbnailUrl = b.ThumbnailUrl,
                        StartViewLeftTop = b.StartViewLeftTop,
                        StartViewLeftBottom = b.StartViewLeftBottom,
                        StartViewRightTop = b.StartViewRightTop,
                        StartViewRightBottom = b.StartViewRightBottom,
                        BackgroundColor = b.BackgroundColor,
                        Collaborators = b.Collaborators,
                        BoardItems = b.BoardItems,
                        TeamId = b.TeamId,
                        PreferencesId = b.PreferencesId,
                        Preferences = b.Preferences,
                        ProjectId = b.ProjectId,
                        Project = b.Project,
                        PermissionsId = b.PermissionsId,
                        Permissions = b.Permissions,
                        IsFavorite = _context.TeamUsers.Any(tu => tu.FavoriteBoards.Any(favboard => favboard.Id == b.Id)),
                        Created = b.Created,
                        DateModified= b.DateModified,
                    }).ToListAsync();

                return new ResultModel<IEnumerable<BoardDto>>(ResultType.Success, resultObject: result);
            }
            catch (Exception ex)
            {
                // Log the exception if needed
                throw;
            }
        }

        public async Task<ResultModel<IEnumerable<BoardDto>>> GetBoardsSortedByLastViewed(long teamId, string sortDirection, int pageIndex, int pageSize)
        {
            try
            {
                var userId = GetCurrentUserId();

                if (string.IsNullOrEmpty(userId))
                {
                    return new ResultModel<IEnumerable<BoardDto>>(ResultType.Unauthorized, "User not found");
                }

                var boardViewLogs = _context.BoardViewLogs
                    .Where(bvl => bvl.ApplicationUserId == userId)
                    .Select(bvl => new { bvl.BoardId, bvl.LastViewed });

                IQueryable<BoardWithLastViewed> query;

                if (teamId != 0)
                {
                    query = from board in _context.Boards
                            join bvl in boardViewLogs on board.Id equals bvl.BoardId into bvlGroup
                            from bvl in bvlGroup.DefaultIfEmpty()
                            where board.Team != null && board.Team.Id == teamId
                            select new BoardWithLastViewed
                            {
                                Board = board,
                                LastViewed = bvl.LastViewed
                            };
                }
                else
                {
                    query = from board in _context.Boards
                            join bvl in boardViewLogs on board.Id equals bvl.BoardId into bvlGroup
                            from bvl in bvlGroup.DefaultIfEmpty()
                            select new BoardWithLastViewed
                            {
                                Board = board,
                                LastViewed = bvl.LastViewed
                            };
                }

                IQueryable<Board> sortedQuery;
                if (sortDirection == "asc")
                {
                    sortedQuery = query.OrderBy(b => b.LastViewed).Select(b => b.Board);
                }
                else
                {
                    sortedQuery = query.OrderByDescending(b => b.LastViewed).Select(b => b.Board);
                }

                var result = await sortedQuery.Skip(pageIndex * pageSize).Take(pageSize)
                    .Select(b => new BoardDto
                    {
                        UUID = b.UUID,
                        Name = b.Name,
                        Description = b.Description,
                        ThumbnailUrl = b.ThumbnailUrl,
                        StartViewLeftTop = b.StartViewLeftTop,
                        StartViewLeftBottom = b.StartViewLeftBottom,
                        StartViewRightTop = b.StartViewRightTop,
                        StartViewRightBottom = b.StartViewRightBottom,
                        BackgroundColor = b.BackgroundColor,
                        Collaborators = b.Collaborators,
                        BoardItems = b.BoardItems,
                        Team = b.Team, // Adjusted to single Team object
                        PreferencesId = b.PreferencesId,
                        Preferences = b.Preferences,
                        ProjectId = b.ProjectId,
                        Project = b.Project,
                        PermissionsId = b.PermissionsId,
                        Permissions = b.Permissions,
                        LastViewed = _context.BoardViewLogs.Where(log => log.ApplicationUserId == userId && log.BoardId == b.Id).Select(x => x.LastViewed).SingleOrDefault()
                    }).ToListAsync();

                return new ResultModel<IEnumerable<BoardDto>>(ResultType.Success, resultObject: result);
            }
            catch (Exception ex)
            {
                // Log the exception if needed
                return new ResultModel<IEnumerable<BoardDto>>(ResultType.Failure, ex.Message);
            }
        }
    }

    public class BoardWithLastViewed
    {
        public Board Board { get; set; }
        public DateTime? LastViewed { get; set; }
    }
}