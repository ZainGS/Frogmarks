using AutoMapper;
using Frogmarks.Models;
using Frogmarks.Models.Dtos;
using Frogmarks.Services;
using Frogmarks.Services.Interfaces;
using Frogmarks.Utilities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Frogmarks.Controllers
{
    // Security audit 2026-10-04, Phase 1.3: this controller was anonymous and returned raw TeamUser entities (whose
    // lazy-loaded ApplicationUser carries the password hash and refresh token). Now: login required, only rows in teams
    // you belong to, and responses are TeamUserDto { Id, TeamId, ApplicationUserId }. (The client does not call it.)
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class TeamUserController : BaseController
    {
        private readonly ITeamUserService _teamUserService;
        private readonly IResourceAccessService _access;
        private readonly IMapper _mapper;

        public TeamUserController(ITeamUserService teamUserService, IResourceAccessService access, IMapper mapper, IErrorService errorService) : base(errorService)
        {
            _teamUserService = teamUserService;
            _access = access;
            _mapper = mapper;
        }

        private async Task<IActionResult> MineOnly(ResultModel<IEnumerable<TeamUser>> result)
        {
            var mine = await _access.GetMyTeamIdsAsync();
            var rows = (result.ResultObject ?? Enumerable.Empty<TeamUser>()).Where(tu => mine.Contains(tu.TeamId));
            return Ok(new ResultModel<IEnumerable<TeamUserDto>>(result.ResultType, resultObject: _mapper.Map<List<TeamUserDto>>(rows.ToList())));
        }

        private IActionResult Dto(ResultModel<TeamUser> result) =>
            Ok(new ResultModel<TeamUserDto>(result.ResultType, resultObject: result.ResultObject == null ? null : _mapper.Map<TeamUserDto>(result.ResultObject)));

        // GET: api/TeamUser
        [HttpGet]
        public async Task<IActionResult> GetAllTeamUsers()
        {
            try
            {
                return await MineOnly(await _teamUserService.GetAllTeamUsers());
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        // GET: api/TeamUser/5
        [HttpGet("{id}")]
        public async Task<IActionResult> GetTeamUserById(long id)
        {
            try
            {
                var result = await _teamUserService.GetTeamUserById(id);
                if (result.ResultType == ResultType.NotFound || result.ResultObject == null
                    || !await _access.IsMemberOfTeamAsync(result.ResultObject.TeamId))
                {
                    return NotFound();
                }
                return Dto(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        // POST: api/TeamUser
        [HttpPost]
        public async Task<IActionResult> CreateTeamUser([FromBody] TeamUser teamUser)
        {
            try
            {
                // Only members of a team can add people to it
                if (!await _access.IsMemberOfTeamAsync(teamUser.TeamId)) return Forbid();
                var result = await _teamUserService.CreateTeamUser(teamUser);
                if (result.ResultType == ResultType.Failure)
                {
                    return BadRequest(result.ExtendedMessage);
                }
                return CreatedAtAction(nameof(GetTeamUserById), new { id = result.ResultObject.Id }, _mapper.Map<TeamUserDto>(result.ResultObject));
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        // PUT: api/TeamUser/5
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateTeamUser(string id, [FromBody] TeamUser teamUser)
        {
            try
            {
                if (id != teamUser.Id.ToString())
                {
                    return BadRequest("ID mismatch");
                }
                var existing = await _teamUserService.GetTeamUserById(teamUser.Id);
                if (existing.ResultObject == null || !await _access.IsMemberOfTeamAsync(existing.ResultObject.TeamId)
                    || !await _access.IsMemberOfTeamAsync(teamUser.TeamId))
                {
                    return NotFound();
                }

                var result = await _teamUserService.UpdateTeamUser(teamUser);
                if (result.ResultType == ResultType.NotFound)
                {
                    return NotFound();
                }
                if (result.ResultType == ResultType.Failure)
                {
                    return BadRequest(result.ExtendedMessage);
                }
                return Dto(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        // DELETE: api/TeamUser/5
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteTeamUser(long id)
        {
            try
            {
                var existing = await _teamUserService.GetTeamUserById(id);
                if (existing.ResultObject == null || !await _access.IsMemberOfTeamAsync(existing.ResultObject.TeamId))
                {
                    return NotFound();
                }
                var result = await _teamUserService.DeleteTeamUser(id);
                if (result.ResultType == ResultType.NotFound)
                {
                    return NotFound();
                }
                return Dto(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        // GET: api/TeamUser/Search
        [HttpGet("search")]
        public async Task<IActionResult> SearchTeamUsers(
            [FromQuery] string filterQuery,
            [FromQuery] string sortBy = "name",
            [FromQuery] string sortDirection = "asc",
            [FromQuery] int pageIndex = 0,
            [FromQuery] int pageSize = 10)
        {
            try
            {
                return await MineOnly(await _teamUserService.SearchTeamUsers(filterQuery, sortBy, sortDirection, pageIndex, pageSize));
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }
    }
}
