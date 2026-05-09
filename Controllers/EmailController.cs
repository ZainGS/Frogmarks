using Frogmarks.Services;
using Frogmarks.Services.Interfaces;
using Frogmarks.Utilities;
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

        // POST api/email/send-reauth-code
        [HttpPost("send-reauth-code")]
        [AllowAnonymous]
        public async Task<IActionResult> SendReauthCode([FromBody] string email)
        {
            if (string.IsNullOrWhiteSpace(email))
                return BadRequest("Email is required.");
            try
            {
                var result = await _emailService.SendReauthCode(email);
                if (result.ResultType != ResultType.Success)
                    return BadRequest(result.ExtendedMessage);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }

        // POST api/email/verify-reauth-code
        [HttpPost("verify-reauth-code")]
        [AllowAnonymous]
        public async Task<IActionResult> VerifyReauthCode([FromBody] VerifyReauthCodeRequest request)
        {
            if (string.IsNullOrWhiteSpace(request?.Email) || string.IsNullOrWhiteSpace(request.Code))
                return BadRequest("Email and code are required.");
            try
            {
                var result = await _emailService.VerifyReauthCode(request.Email, request.Code);
                if (result.ResultType != ResultType.Success)
                    return BadRequest(result.ExtendedMessage);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return HandleErrorActionResult(ex);
            }
        }
    }

    public record VerifyReauthCodeRequest(string Email, string Code);
}
