using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Frogmarks.Utilities;
using Frogmarks.Services.Interfaces;
using Frogmarks.Auth;

namespace Frogmarks.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    [ValidateModel]
    //[Authorize(AuthenticationSchemes = JwtBearerDefaults.AuthenticationScheme)]
    public class BaseController : ControllerBase
    {
        private readonly IErrorService _errorService;
        
        protected BaseController(IErrorService errorsService)
        {
            _errorService = errorsService;
        }

        protected IActionResult GenerateResponseActionResult<T>(ResultModel<T> result) where T : class
        {
            switch (result.ResultType)
            {
                case ResultType.Success:
                    return result.ResultObject != null ? Ok(result.ResultObject) : Ok(result);
                case ResultType.NotFound:
                    return NotFound(result);
                case ResultType.Unauthorized: 
                    return Unauthorized(result);
                case ResultType.AlreadyExist:
                    return Conflict(result);
                default:
                    return BadRequest(result);

            }
        }

        protected IActionResult HandleErrorActionResult(Exception ex)
        {
            _errorService.LogError(ex);
            return StatusCode(500, "The server encountered an error");
        }
    }
}
