using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using Frogmarks.Models.Dtos;
using Frogmarks.Models.Team;
using Frogmarks.Services;
using Frogmarks.Services.Interfaces;
using Frogmarks.Utilities;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using System.Security.Claims;

namespace Frogmarks.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]   // was anonymous (security audit 2026-10-04, Phase 1.3)
    public class TeamController : BaseController
    {
        private readonly ITeamService _teamService;
        private readonly IResourceAccessService _access;

        public TeamController(ITeamService teamService, IResourceAccessService access, IErrorService errorService) : base(errorService)
        {
            _teamService = teamService;
            _access = access;
        }

        // GET: api/Team
        [HttpGet]
        public async Task<IActionResult> GetAllTeams()
        {
            try
            {
                var result = await _teamService.GetAllTeams();
                var mine = await _access.GetMyTeamIdsAsync();   // only your teams (was every team)
                return Ok(new ResultModel<IEnumerable<TeamDto>>(result.ResultType, resultObject: (result.ResultObject ?? Enumerable.Empty<TeamDto>()).Where(t => mine.Contains(t.Id)).ToList()));
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        // GET: api/Team/5
        [HttpGet("{id}")]
        public async Task<IActionResult> GetTeamById(long id)
        {
            try
            {
                if (!await _access.IsMemberOfTeamAsync(id)) return NotFound();
                var result = await _teamService.GetTeamById(id);
                if (result.ResultType == ResultType.NotFound)
                {
                    return NotFound(result);
                }
                return Ok(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        // POST: api/Team
        [HttpPost]
        public async Task<IActionResult> CreateTeam([FromBody] Team team)
        {
            try
            {
                var result = await _teamService.CreateTeam(team);
                if (result.ResultType == ResultType.Failure)
                {
                    return BadRequest(result);
                }
                return CreatedAtAction(nameof(GetTeamById), new { id = result.ResultObject.Id }, result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        // PUT: api/Team/5
        [HttpPut("{id}")]
        public async Task<IActionResult> UpdateTeam(long id, [FromBody] Team team)
        {
            try
            {
                if (id != team.Id)
                {
                    return BadRequest("ID mismatch");
                }
                if (!await _access.IsMemberOfTeamAsync(id)) return NotFound();   // members only (audit Phase 1.3)

                var result = await _teamService.UpdateTeam(team);
                if (result.ResultType == ResultType.NotFound)
                {
                    return NotFound(result);
                }
                if (result.ResultType == ResultType.Failure)
                {
                    return BadRequest(result);
                }
                return Ok(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        // DELETE: api/Team/5
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteTeam(long id)
        {
            try
            {
                if (!await _access.IsMemberOfTeamAsync(id)) return NotFound();   // members only (audit Phase 1.3)
                var result = await _teamService.DeleteTeam(id);
                if (result.ResultType == ResultType.NotFound)
                {
                    return NotFound(result);
                }
                return Ok(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        // GET: api/Team/Search
        [HttpGet("search")]
        public async Task<IActionResult> SearchTeams(
            [FromQuery] string filterQuery,
            [FromQuery] string sortBy = "name",
            [FromQuery] string sortDirection = "asc",
            [FromQuery] int pageIndex = 0,
            [FromQuery] int pageSize = 10)
        {
            try
            {
                var result = await _teamService.SearchTeams(filterQuery, sortBy, sortDirection, pageIndex, pageSize);
                var mine = await _access.GetMyTeamIdsAsync();   // only your teams
                return Ok(new ResultModel<IEnumerable<TeamDto>>(result.ResultType, resultObject: (result.ResultObject ?? Enumerable.Empty<TeamDto>()).Where(t => mine.Contains(t.Id)).ToList()));
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        [HttpGet("User/{userId}")]
        public async Task<IActionResult> GetTeamsByApplicationUserId(string userId)
        {
            // Only your own teams (this also creates a default team for the id when it has none)
            if (userId != User.FindFirstValue(ClaimTypes.NameIdentifier)) return Forbid();
            try
            {
                var result = await _teamService.GetTeamsByApplicationUserId(userId);
                if (result.ResultType == ResultType.NotFound)
                {
                    return NotFound(result);
                }
                return Ok(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }
    }
}