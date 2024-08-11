using Frogmarks.Models;
using Frogmarks.Services;
using Frogmarks.Services.Interfaces;
using Frogmarks.Utilities;
using Microsoft.AspNetCore.Mvc;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace Frogmarks.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class TeamUserController : BaseController
    {
        private readonly ITeamUserService _teamUserService;

        public TeamUserController(ITeamUserService teamUserService, IErrorService errorService) : base(errorService)
        {
            _teamUserService = teamUserService;
        }

        // GET: api/TeamUser
        [HttpGet]
        public async Task<IActionResult> GetAllTeamUsers()
        {
            try
            {
                var result = await _teamUserService.GetAllTeamUsers();
                return Ok(result);
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

        // POST: api/TeamUser
        [HttpPost]
        public async Task<IActionResult> CreateTeamUser([FromBody] TeamUser teamUser)
        {
            try
            {
                var result = await _teamUserService.CreateTeamUser(teamUser);
                if (result.ResultType == ResultType.Failure)
                {
                    return BadRequest(result);
                }
                return CreatedAtAction(nameof(GetTeamUserById), new { id = result.ResultObject.Id }, result);
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

                var result = await _teamUserService.UpdateTeamUser(teamUser);
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

        // DELETE: api/TeamUser/5
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteTeamUser(long id)
        {
            try
            {
                var result = await _teamUserService.DeleteTeamUser(id);
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
                var result = await _teamUserService.SearchTeamUsers(filterQuery, sortBy, sortDirection, pageIndex, pageSize);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }
    }
}