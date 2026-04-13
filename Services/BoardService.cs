using AutoMapper;
using Duende.IdentityServer.Extensions;
using Frogmarks.Data;
using Frogmarks.Models;
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
using Frogmarks.Models.Dtos;
using Frogmarks.Models.Dtos.Board;
using Frogmarks.Services.Interfaces;

namespace Frogmarks.Services
{
    public class BoardService : IBoardService
    {
        private readonly IApplicationDbContext _context;
        private readonly IMapper _mapper;
        private readonly BatchService _batchService;
        private readonly IHttpContextAccessor _httpContextAccessor;
        private readonly IBlobStorageProvider _blobStorage;
        private readonly string _containerName = "board-thumbnails-dev"; // Blob Storage container, TODO: Use environment variable to determine.

        public BoardService(IApplicationDbContext context, IMapper mapper, BatchService batchService, IHttpContextAccessor httpContextAccessor, IBlobStorageProvider blobStorage)
        {
            _context = context;
            _mapper = mapper;
            _batchService = batchService;
            _httpContextAccessor = httpContextAccessor;
            _blobStorage = blobStorage;
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

        public async Task<ResultModel<BoardDto>> GetBoardById(long id)
        {
            try
            {
                var board = await _context.Boards
                    .AsNoTracking()
                    .FirstOrDefaultAsync(x => x.Id == id);

                if (board == null)
                {
                    return new ResultModel<BoardDto>(ResultType.NotFound, "Board not found");
                }

                var userId = GetCurrentUserId();
                if (!string.IsNullOrEmpty(userId))
                {
                    // Fetch TeamUserIds in one query (add AsNoTracking for speed)
                    var teamUserIds = await _context.TeamUsers
                        .AsNoTracking()
                        .Where(tu => tu.ApplicationUserId == userId)
                        .Select(tu => tu.Id)
                        .ToListAsync();

                    if (teamUserIds.Count > 0)
                    {
                        // Fetch all existing logs in 1 query
                        var existingLogs = await _context.BoardViewLogs
                            .Where(bvl => bvl.BoardId == board.Id && teamUserIds.Contains(bvl.TeamUserId))
                            .ToDictionaryAsync(bvl => bvl.TeamUserId);

                        var now = DateTime.UtcNow;

                        foreach (var teamUserId in teamUserIds)
                        {
                            if (existingLogs.TryGetValue(teamUserId, out var log))
                            {
                                log.LastViewed = now;
                                _context.BoardViewLogs.Update(log);
                            }
                            else
                            {
                                _context.BoardViewLogs.Add(new BoardViewLog
                                {
                                    BoardId = board.Id,
                                    TeamUserId = teamUserId,
                                    LastViewed = now
                                });
                            }
                        }

                        await _context.SaveChangesAsync();
                    }
                }

                return new ResultModel<BoardDto>(ResultType.Success, resultObject: _mapper.Map<BoardDto>(board));
            }
            catch (Exception ex)
            {
                // Optional: log the error here
                throw;
            }
        }

        public async Task<ResultModel<BoardDto>> GetBoardByUid(Guid uid)
        {
            try
            {
                //var board = await _context.Boards.AsNoTracking().FirstOrDefaultAsync(b => b.UUID == uid);

                var board = await _context.Boards.AsNoTracking()
                    .Include(b => b.Collaborators)
                        .ThenInclude(c => c.TeamUser)
                    .Include(b => b.Collaborators)
                        .ThenInclude(c => c.BoardRoles)
                    .FirstOrDefaultAsync(b => b.UUID == uid);

                if (board == null)
                {
                    return new ResultModel<BoardDto>(ResultType.NotFound, "Board not found");
                }

                var userId = GetCurrentUserId();
                if (!userId.IsNullOrEmpty())
                {
                    // Fetch the TeamUser entries corresponding to the ApplicationUserId
                    var teamUserIds = await _context.TeamUsers.AsNoTracking()
                        .Where(tu => tu.ApplicationUserId == userId)
                        .Select(tu => tu.Id)
                        .ToListAsync();

                    var existingLogs = await _context.BoardViewLogs
                        .Where(bvl => bvl.BoardId == board.Id && teamUserIds.Contains(bvl.TeamUserId))
                        .ToDictionaryAsync(bvl => bvl.TeamUserId);

                    var now = DateTime.UtcNow;

                    foreach (var teamUserId in teamUserIds)
                    {
                        if (existingLogs.TryGetValue(teamUserId, out var log))
                        {
                            log.LastViewed = now;
                            _context.BoardViewLogs.Update(log);
                        }
                        else
                        {
                            _context.BoardViewLogs.Add(new BoardViewLog
                            {
                                ApplicationUserId = userId,
                                BoardId = board.Id,
                                TeamUserId = teamUserId,
                                LastViewed = now
                            });
                        }
                    }

                    await _context.SaveChangesAsync();
                }

                return new ResultModel<BoardDto>(ResultType.Success, resultObject: _mapper.Map<BoardDto>(board));
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

        public async Task<ResultModel<string>> SaveBoardSceneGraph(long boardId, string sceneGraphData)
        {
            var board = await _context.Boards.FirstOrDefaultAsync(b => b.Id == boardId);
            if (board == null) return new ResultModel<string>(ResultType.NotFound, "Board not found.");

            board.SceneGraphData = sceneGraphData;
            board.DateModified = DateTime.UtcNow;

            await _context.SaveChangesAsync();
            return new ResultModel<string>(ResultType.Success, "Board saved.");
        }

        public async Task<ResultModel<string>> LoadBoardSceneGraph(long boardId)
        {
            var board = await _context.Boards
                .Where(b => b.Id == boardId)
                .Select(b => b.SceneGraphData)
                .FirstOrDefaultAsync();

            if (board == null) return new ResultModel<string>(ResultType.NotFound, "Board not found.");

            return new ResultModel<string>(ResultType.Success, board);
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

                //
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
                //

                // TODO: Replace the above with: (Query both in one join statement?)
                /* var teamUser = await _context.TeamUsers
                    .Include(t => t.FavoriteBoards)
                    .SingleOrDefaultAsync(tu => tu.ApplicationUserId == userId);
                 */

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

        public async Task<ResultModel<IEnumerable<BoardDto>>> SearchBoards(
            string name, long teamId, bool favorites, string sortBy, string sortDirection,
            int pageIndex, int pageSize, HashSet<long> cachedThumbnailBoardIds, bool isArchived)
        {
            try
            {
                var userId = GetCurrentUserId();
                if (string.IsNullOrEmpty(userId))
                {
                    return new ResultModel<IEnumerable<BoardDto>>(ResultType.Unauthorized, "User not found");
                }

                var query = _context.Boards
                    .AsNoTracking()
                    .Where(b => teamId <= 0 || b.TeamId == teamId);

                query = query.Where(b => b.IsArchived == isArchived);

                if (favorites)
                {
                    query = query.Where(b =>
                        _context.TeamUsers
                            .Where(tu => tu.ApplicationUserId == userId)
                            .SelectMany(tu => tu.FavoriteBoards)
                            .Select(fb => fb.Id)
                            .Contains(b.Id));
                }

                if (!string.IsNullOrEmpty(name))
                {
                    query = query.Where(b => b.Name.StartsWith(name));
                }

                query = sortBy.ToLower() switch
                {
                    "alphabetical" => sortDirection.ToLower() == "desc"
                        ? query.OrderByDescending(b => b.Name)
                        : query.OrderBy(b => b.Name),
                    _ => sortDirection.ToLower() == "desc"
                        ? query.OrderByDescending(b => b.Created)
                        : query.OrderBy(b => b.Created)
                };

                // Step 1: Fetch minimal board data
                var boardDtos = await query
                    .Skip(pageIndex * pageSize)
                    .Take(pageSize)
                    .Select(b => new BoardDto
                    {
                        Id = b.Id,
                        UUID = b.UUID,
                        Name = b.Name,
                        IsArchived = b.IsArchived,
                        Created = b.Created,
                        DateModified = b.DateModified,
                        IsCustomThumbnail = b.IsCustomThumbnail
                    })
                    .ToListAsync();

                // Step 2: Append thumbnails only for non-cached boards
                var uncachedBoards = boardDtos
                    .Where(dto => !cachedThumbnailBoardIds.Contains(dto.Id))
                    .ToList();

                var thumbnailTasks = uncachedBoards.ToDictionary(
                    dto => dto.Id,
                    dto => GetThumbnailSasUrl(new Board { Id = dto.Id, UUID = dto.UUID }) // or refactor to take ID if needed
                );

                var thumbnailResults = await Task.WhenAll(thumbnailTasks.Values);
                var thumbnailLookup = thumbnailTasks.Keys.Zip(thumbnailResults, (id, url) => new { id, url })
                                                         .ToDictionary(x => x.id, x => x.url);

                foreach (var dto in boardDtos)
                {
                    dto.ThumbnailUrl = thumbnailLookup.TryGetValue(dto.Id, out var url) ? url : string.Empty;
                }

                // Step 3: Append favorites if applicable
                if (favorites)
                {
                    var favoriteIds = await _context.TeamUsers
                        .Where(tu => tu.ApplicationUserId == userId)
                        .SelectMany(tu => tu.FavoriteBoards)
                        .Select(fb => fb.Id)
                        .ToListAsync();

                    var favoriteSet = new HashSet<long>(favoriteIds);
                    foreach (var dto in boardDtos)
                    {
                        dto.IsFavorite = favoriteSet.Contains(dto.Id);
                    }
                }

                return new ResultModel<IEnumerable<BoardDto>>(ResultType.Success, "Success", boardDtos);
            }
            catch (Exception ex)
            {
                return new ResultModel<IEnumerable<BoardDto>>(ResultType.Failure, ex.Message);
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
                        IsCustomThumbnail = b.IsCustomThumbnail,
                        StartViewLeftTop = b.StartViewLeftTop,
                        StartViewLeftBottom = b.StartViewLeftBottom,
                        StartViewRightTop = b.StartViewRightTop,
                        StartViewRightBottom = b.StartViewRightBottom,
                        BackgroundColor = b.BackgroundColor,
                        Collaborators = b.Collaborators.Select(c => new BoardCollaboratorDto
                        {
                            Id = c.Id,
                            TeamUserId = c.TeamUserId,
                            TeamUser = new TeamUserDto
                            {
                                Id = c.TeamUser.Id,
                                TeamId = c.TeamUser.TeamId,
                                ApplicationUserId = c.TeamUser.ApplicationUserId
                            },
                            BoardRoles = c.BoardRoles.Select(r => new BoardRole
                            {
                                Id = r.Id,
                                RoleName = r.RoleName
                            }).ToList()
                        }).ToList(),
                        BoardItems = b.BoardItems,
                        Team = b.Team == null ? null : new TeamDto
                        {
                            Name = b.Team.Name,
                            Description = b.Team.Description
                        },
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

        public async Task<ResultModel<string>> UploadThumbnail(string boardUid, IFormFile thumbnail, bool? isCustom = null)
        {
            try
            {
                if (thumbnail == null || thumbnail.Length == 0)
                    return new ResultModel<string>(ResultType.Failure, "Invalid file upload.");

                var blobName = $"{boardUid}.png";
                using (var stream = thumbnail.OpenReadStream())
                {
                    await _blobStorage.UploadAsync(_containerName, blobName, stream, overwrite: true);
                }

                if (isCustom.HasValue && Guid.TryParse(boardUid, out var uuid))
                {
                    var board = await _context.Boards.FirstOrDefaultAsync(b => b.UUID == uuid);
                    if (board != null)
                    {
                        board.IsCustomThumbnail = isCustom.Value;
                        board.DateModified = DateTime.UtcNow;
                        await _context.SaveChangesAsync();
                    }
                }

                var url = await _blobStorage.GetReadUrlAsync(_containerName, blobName);
                return new ResultModel<string>(ResultType.Success, url);
            }
            catch (Exception ex)
            {
                return new ResultModel<string>(ResultType.Failure, ex.Message);
            }
        }

        // This method won't work since the storage account is private.
        // If you want the frontend to access the image, generate a SAS (Shared Access Signature) URL.
        // See public string GetThumbnailSasUrl(string boardUid) below this method...
        //public async Task<ResultModel<Stream>> GetThumbnail(string boardUid)
        //{
        //    try
        //    {
        //        var containerClient = _blobServiceClient.GetBlobContainerClient(this._containerName);
        //        var blobClient = containerClient.GetBlobClient($"{boardUid}.png");

        //        if (!(await blobClient.ExistsAsync()))
        //        {
        //            return new ResultModel<Stream>(ResultType.NotFound, "Thumbnail not found.");
        //        }

        //        var downloadInfo = await blobClient.DownloadAsync();
        //        return new ResultModel<Stream>(ResultType.Success, "Success", downloadInfo.Value.Content);
        //    }
        //    catch (Exception ex)
        //    {
        //        return new ResultModel<Stream>(ResultType.Failure, ex.Message);
        //    }
        //}

        public async Task<string> GetThumbnailSasUrl(Board board)
        {
            try
            {
                return await _blobStorage.GetReadUrlAsync(_containerName, $"{board.UUID}.png");
            }
            catch
            {
                return "";
            }
        }

        public async Task<ResultModel<BoardDto>> DuplicateBoard(
            long sourceBoardId,
            string? nameOverride,
            long? targetTeamId,
            bool copyThumbnail)
        {
            var source = await _context.Boards
                .FirstOrDefaultAsync(b => b.Id == sourceBoardId);

            if (source == null)
                return new ResultModel<BoardDto>(ResultType.NotFound, "Source board not found.");

            var newBoard = new Board
            {
                UUID = Guid.NewGuid(),
                Name = string.IsNullOrWhiteSpace(nameOverride) ? $"Copy of {source.Name}" : nameOverride,
                Description = source.Description,
                TeamId = targetTeamId ?? source.TeamId,
                // copy scene + look & preferences
                SceneGraphData = source.SceneGraphData,
                BackgroundColor = source.BackgroundColor,
                StartViewLeftTop = source.StartViewLeftTop,
                StartViewLeftBottom = source.StartViewLeftBottom,
                StartViewRightTop = source.StartViewRightTop,
                StartViewRightBottom = source.StartViewRightBottom,
                PreferencesId = source.PreferencesId, // or deep copy Preferences entity if needed
                PermissionsId = source.PermissionsId, // ditto if you want a separate permissions row
                Created = DateTime.UtcNow,
                DateModified = DateTime.UtcNow,
                IsArchived = false,
                IsCustomThumbnail = source.IsCustomThumbnail
            };

            _context.Boards.Add(newBoard);
            await _context.SaveChangesAsync();

            if (copyThumbnail)
            {
                try
                {
                    var srcBlobName = $"{source.UUID}.png";
                    var dstBlobName = $"{newBoard.UUID}.png";

                    if (await _blobStorage.ExistsAsync(_containerName, srcBlobName))
                    {
                        var data = await _blobStorage.DownloadAsync(_containerName, srcBlobName);
                        using var ms = new MemoryStream(data);
                        await _blobStorage.UploadAsync(_containerName, dstBlobName, ms, overwrite: true);
                    }
                }
                catch
                {
                    // swallow or log; thumbnail can be regenerated later by frontend
                }
            }

            var dto = _mapper.Map<BoardDto>(newBoard);
            dto.ThumbnailUrl = await GetThumbnailSasUrl(newBoard);
            return new ResultModel<BoardDto>(ResultType.Success, resultObject: dto);
        }

        public async Task<ResultModel<BoardDto>> RenameBoard(long boardId, string newName)
        {
            var board = await _context.Boards.FindAsync(boardId);
            if (board == null)
                return new ResultModel<BoardDto>(ResultType.NotFound, "Board not found");

            if (string.IsNullOrWhiteSpace(newName))
                return new ResultModel<BoardDto>(ResultType.Failure, "New name cannot be empty.");

            board.Name = newName.Trim();
            board.DateModified = DateTime.UtcNow;

            await _context.SaveChangesAsync();

            var dto = _mapper.Map<BoardDto>(board);
            return new ResultModel<BoardDto>(ResultType.Success, resultObject: dto);
        }
    }

    public class BoardWithLastViewed
    {
        public Board Board { get; set; }
        public DateTime? LastViewed { get; set; }
    }
}