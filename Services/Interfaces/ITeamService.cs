using Frogmarks.Models.Board;
using Frogmarks.Models.Team;
using Frogmarks.Utilities;

namespace Frogmarks.Services
{
    public interface ITeamService
    {
        Task<ResultModel<IEnumerable<Team>>> GetAllTeams();
        Task<ResultModel<Team>> GetTeamById(long id);
        Task<ResultModel<IEnumerable<Team>>> GetTeamsByApplicationUserId(string userId);
        Task<ResultModel<Team>> CreateTeam(Team board);
        Task<ResultModel<Team>> UpdateTeam(Team Board);
        Task<ResultModel<Team>> DeleteTeam(long id);
        Task<ResultModel<IEnumerable<Team>>> SearchTeams(string filterQuery, string sortBy, string sortDirection, int pageIndex, int pageSize);
    }
}