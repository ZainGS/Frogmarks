using Frogmarks.Models.Board;
using Frogmarks.Models.Dtos;
using Frogmarks.Models.Team;
using Frogmarks.Utilities;

namespace Frogmarks.Services
{
    public interface ITeamService
    {
        Task<ResultModel<IEnumerable<TeamDto>>> GetAllTeams();
        Task<ResultModel<TeamDto>> GetTeamById(long id);
        Task<ResultModel<IEnumerable<TeamDto>>> GetTeamsByApplicationUserId(string userId);
        Task<ResultModel<TeamDto>> CreateTeam(Team board);
        Task<ResultModel<TeamDto>> UpdateTeam(Team Board);
        Task<ResultModel<TeamDto>> DeleteTeam(long id);
        Task<ResultModel<IEnumerable<TeamDto>>> SearchTeams(string filterQuery, string sortBy, string sortDirection, int pageIndex, int pageSize);
    }
}