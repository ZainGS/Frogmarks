using System.Security.Claims;
using Frogmarks.Data;
using Frogmarks.Models.Board;
using Frogmarks.Models.Illustration;
using Microsoft.EntityFrameworkCore;

namespace Frogmarks.Services
{
    /// <summary>
    /// Who may open / edit / delete / publish a board or illustration (security audit 2026-10-04, Phase 1.2): its
    /// creator, members of its team, or its collaborators. Every board / illustration service method that takes an id
    /// asks here first; list / search queries are filtered through <see cref="AccessibleBoards"/> /
    /// <see cref="AccessibleIllustrations"/>. Published illustrations' public view endpoints don't go through this
    /// (they check IsPublic themselves).
    /// </summary>
    public interface IResourceAccessService
    {
        string? CurrentUserId { get; }
        Task<List<long>> GetMyTeamIdsAsync();
        Task<bool> IsMemberOfTeamAsync(long teamId);
        Task<IQueryable<Board>> AccessibleBoards(IQueryable<Board> source);
        Task<IQueryable<Illustration>> AccessibleIllustrations(IQueryable<Illustration> source);
        Task<bool> CanAccessBoardAsync(long boardId);
        Task<bool> CanAccessBoardAsync(Guid boardUid);
        Task<bool> CanAccessIllustrationAsync(long illustrationId);
        Task<bool> CanAccessIllustrationAsync(Guid illustrationUid);
    }

    public class ResourceAccessService : IResourceAccessService
    {
        private readonly ApplicationDbContext _context;
        private readonly IHttpContextAccessor _httpContextAccessor;
        private List<long>? _myTeamIds;   // per request (scoped service)

        public ResourceAccessService(ApplicationDbContext context, IHttpContextAccessor httpContextAccessor)
        {
            _context = context;
            _httpContextAccessor = httpContextAccessor;
        }

        public string? CurrentUserId => _httpContextAccessor.HttpContext?.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        public async Task<List<long>> GetMyTeamIdsAsync()
        {
            if (_myTeamIds != null) return _myTeamIds;
            var uid = CurrentUserId;
            _myTeamIds = uid == null
                ? new List<long>()
                : await _context.TeamUsers.AsNoTracking().Where(tu => tu.ApplicationUserId == uid).Select(tu => tu.TeamId).Distinct().ToListAsync();
            return _myTeamIds;
        }

        public async Task<bool> IsMemberOfTeamAsync(long teamId) => (await GetMyTeamIdsAsync()).Contains(teamId);

        public async Task<IQueryable<Board>> AccessibleBoards(IQueryable<Board> source)
        {
            var uid = CurrentUserId;
            if (uid == null) return source.Where(_ => false);
            var teamIds = await GetMyTeamIdsAsync();
            return source.Where(b => b.CreatedById == uid
                || (b.TeamId != null && teamIds.Contains(b.TeamId.Value))
                || b.Collaborators!.Any(c => c.TeamUser!.ApplicationUserId == uid));
        }

        public async Task<IQueryable<Illustration>> AccessibleIllustrations(IQueryable<Illustration> source)
        {
            var uid = CurrentUserId;
            if (uid == null) return source.Where(_ => false);
            var teamIds = await GetMyTeamIdsAsync();
            return source.Where(i => i.CreatedById == uid
                || (i.TeamId != null && teamIds.Contains(i.TeamId.Value))
                || i.Collaborators!.Any(c => c.TeamUser!.ApplicationUserId == uid));
        }

        public async Task<bool> CanAccessBoardAsync(long boardId) =>
            await (await AccessibleBoards(_context.Boards.AsNoTracking())).AnyAsync(b => b.Id == boardId);

        public async Task<bool> CanAccessBoardAsync(Guid boardUid) =>
            await (await AccessibleBoards(_context.Boards.AsNoTracking())).AnyAsync(b => b.UUID == boardUid);

        public async Task<bool> CanAccessIllustrationAsync(long illustrationId) =>
            await (await AccessibleIllustrations(_context.Illustrations.AsNoTracking())).AnyAsync(i => i.Id == illustrationId);

        public async Task<bool> CanAccessIllustrationAsync(Guid illustrationUid) =>
            await (await AccessibleIllustrations(_context.Illustrations.AsNoTracking())).AnyAsync(i => i.UUID == illustrationUid);
    }
}
