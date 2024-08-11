using Frogmarks.Services;
using Frogmarks.Services.Interfaces;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Frogmarks.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class EmailController : BaseController
    {
        private readonly IEmailService _emailService;
        public EmailController(IEmailService emailService, IErrorService errorService) : base(errorService)
        {
            _emailService = emailService;
        }

        // POST api/email/sendsignin
        [HttpPost("sendsignin")]
        [AllowAnonymous]
        public async Task<IActionResult> SendSignInEmail([FromBody] string email)
        {
            if (email == null || string.IsNullOrWhiteSpace(email))
            {
                return BadRequest("Invalid email request.");
            }

            try
            {
                var result = await _emailService.SendSignInEmail(email);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        // POST api/email/validate
        [HttpPost("validate")]
        [AllowAnonymous]
        public async Task<IActionResult> ValidateEmailToken([FromBody] string token)
        {
            if (string.IsNullOrEmpty(token))
            {
                return BadRequest("Token is null or empty.");
            }

            try
            {
                var result = await _emailService.ValidateEmailToken(token);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }
    }
}
