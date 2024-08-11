using Frogmarks.Models;
using Frogmarks.Utilities;

namespace Frogmarks.Services
{
    public interface ITeamUserService
    {
        Task<ResultModel<IEnumerable<TeamUser>>> GetAllTeamUsers();
        Task<ResultModel<TeamUser>> GetTeamUserById(long id);
        Task<ResultModel<TeamUser>> CreateTeamUser(TeamUser board);
        Task<ResultModel<TeamUser>> UpdateTeamUser(TeamUser Board);
        Task<ResultModel<TeamUser>> DeleteTeamUser(long id);
        Task<ResultModel<IEnumerable<TeamUser>>> SearchTeamUsers(string filterQuery, string sortBy, string sortDirection, int pageIndex, int pageSize);
    }
}