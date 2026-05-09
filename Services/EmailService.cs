using AutoMapper;
using Frogmarks.Auth;
using Frogmarks.Data;
using Frogmarks.Models.Auth;
using Frogmarks.Models.Board;
using Frogmarks.Models.Email;
using Frogmarks.SignalR.Optimizers;
using Frogmarks.Utilities;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using static Duende.IdentityServer.Models.IdentityResources;
using System.Net.Mail;
using System.Net;
using Microsoft.Extensions.Options;
using Azure.Communication.Email;
using Azure;
using Frogmarks.Models;
using Microsoft.AspNetCore.Identity;
using Microsoft.Extensions.Logging;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication;
using System.Security.Claims;
using Duende.IdentityServer.Services;
using Duende.IdentityServer.Extensions;

namespace Frogmarks.Services
{
    public class EmailService : IEmailService
    {
        private readonly ApplicationDbContext _context;
        private readonly UserManager<ApplicationUser> _userManager;
        private readonly IUserService _userService;
        private readonly IMapper _mapper;
        private readonly AzureCommunicationServicesSettings _acsSettings;
        private readonly IHttpContextAccessor _httpContextAccessor;
        private readonly TokenGenerator _tokenGenerator;
        private readonly ILogger<EmailService> _logger;

        public EmailService(ApplicationDbContext context, 
            IMapper mapper, 
            IOptions<AzureCommunicationServicesSettings> acsSettings, 
            UserManager<ApplicationUser> userManager, 
            IUserService userService,
            IHttpContextAccessor httpContextAccessor,
            TokenGenerator tokenGenerator,
            ILogger<EmailService> logger)
        {
            _context = context;
            _mapper = mapper;
            _userManager = userManager;
            _userService = userService;
            _acsSettings = acsSettings.Value;
            _httpContextAccessor = httpContextAccessor;
            _tokenGenerator = tokenGenerator;
            _logger = logger;
        }

        public async Task<ResultModel<string>> SendSignInEmail(string email)
        {
            try
            {
                if (email.IsNullOrEmpty())
                {
                    return new ResultModel<string>(ResultType.NotFound, "Email request is not valid.");
                }

                // Check if existing live token for email
                var existingEmailToken = await _context.EmailTokens.AsNoTracking().FirstOrDefaultAsync(token => token.Email.ToLower() == email.ToLower());

                EmailToken newEmailToken = new EmailToken();
                var newTokenString = _tokenGenerator.GenerateEmailSignInToken();
                
                newEmailToken = new EmailToken()
                {
                    Id = (existingEmailToken != null) ? (existingEmailToken.Id) : 0,
                    Email = email,
                    Token = newTokenString,
                    Expiration = DateTime.UtcNow.AddMinutes(15)
                };

                // Save the Email Token
                _context.EmailTokens.Update(newEmailToken);
                await _context.SaveChangesAsync();

                // Send the Email
                //string signInLink = $"https://frogmarks.com/signin?token={token}";
                string signInLink = $"https://localhost:44452/signin?token={newTokenString}";

                // Setup SMTP Client (ex: Azure Communication Service)
                var emailClient = new EmailClient(_acsSettings.ConnectionString);
                var emailContent = new EmailContent("Sign In to Frogmarks")
                {
                    PlainText = $"Here's your unique sign-in link to Frogmarks\n\nTo access your account, simply click on the link below.\n{signInLink}",
                    Html = $"<p>Here's your unique sign-in link to Frogmarks<br/><br/>To access your account, simply click on the link below.</p><a href='{signInLink}'>Login to my account</a>"
                };

                var emailMessage = new EmailMessage("donotreply@frogmarks.com", email, emailContent);

                // Use WaitUntil.Started for non-blocking or WaitUntil.Completed for blocking operation
                EmailSendOperation emailSendOperation = await emailClient.SendAsync(WaitUntil.Started, emailMessage);

                return new ResultModel<string>(ResultType.Success, resultObject: email);
            }
            catch (RequestFailedException rfEx)
            {
                // Log the ACS request failure
                // _logger.LogError(rfEx, "Azure Communication Services error occurred while sending email.");
                return new ResultModel<string>(ResultType.Failure, "Failed to send email due to ACS error.");
            }
            catch (Exception ex)
            {
                // Log the exception
                // _logger.LogError(ex, "An error occurred while sending email.");
                return new ResultModel<string>(ResultType.Failure, "An error occurred while sending email.");
            }
        }

        public async Task<ResultModel<string>> ValidateEmailToken(string token)
        {
            try
            {
                var emailToken = await _context.EmailTokens.SingleOrDefaultAsync(et => et.Token == token && et.Expiration > DateTime.UtcNow);
                if (emailToken == null)
                {
                    _logger.LogWarning("Invalid or expired email token: {Token}", token);
                    return new ResultModel<string>(ResultType.Failure, "Invalid or expired token.", "false");
                }

                var user = await _userManager.FindByEmailAsync(emailToken.Email);
                if (user == null)
                {
                    user = new ApplicationUser
                    {
                        Email = emailToken.Email,
                        UserName = emailToken.Email,
                        // Set other properties as needed...
                    };

                    var result = await _userManager.CreateAsync(user);
                    if (!result.Succeeded)
                    {
                        _logger.LogError("Failed to create user for email: {Email}. Errors: {Errors}", emailToken.Email, result.Errors);
                        return new ResultModel<string>(ResultType.Failure, "An error occurred while creating the user.", "false");
                    }
                }

                var accessToken = _tokenGenerator.GenerateAuthToken(user.Id, user?.UserName, DateTime.UtcNow.AddMinutes(15));
                var refreshToken = _tokenGenerator.GenerateRefreshToken();

                user.RefreshToken = refreshToken;
                user.RefreshTokenExpiryTime = DateTime.UtcNow.AddDays(7);
                var updateResult = await _userManager.UpdateAsync(user);

                if (!updateResult.Succeeded)
                {
                    _logger.LogError("Failed to update user with refresh token for email: {Email}. Errors: {Errors}", emailToken.Email, updateResult.Errors);
                    return new ResultModel<string>(ResultType.Failure, "An error occurred while updating the user.", "false");
                }

                var accessTokenCookieOptions = new CookieOptions
                {
                    HttpOnly = true,
                    Secure = true, // Set to true in production to use HTTPS
                    SameSite = SameSiteMode.None,
                    Expires = DateTime.UtcNow.AddMinutes(15)
                };

                var refreshTokenCookieOptions = new CookieOptions
                {
                    HttpOnly = true,
                    Secure = true, // Set to true in production to use HTTPS
                    SameSite = SameSiteMode.None,
                    Expires = DateTime.UtcNow.AddDays(7)
                };

                _httpContextAccessor.HttpContext.Response.Cookies.Append("accessToken", accessToken, accessTokenCookieOptions);
                _httpContextAccessor.HttpContext.Response.Cookies.Append("refreshToken", refreshToken, refreshTokenCookieOptions);

                _logger.LogInformation("User logged in with email: {Email}", emailToken.Email);
                return new ResultModel<string>(ResultType.Success, resultObject: "true");
            }
            catch (Exception ex)
            {
                _logger.LogError("An error occurred while validating the email token: {Message}", ex.Message);
                return new ResultModel<string>(ResultType.Failure, "An internal error occurred.", "false");
            }
        }

        public async Task<ResultModel<string>> SendReauthCode(string email)
        {
            try
            {
                if (string.IsNullOrWhiteSpace(email))
                    return new ResultModel<string>(ResultType.Failure, "Email is required.");

                var code = Random.Shared.Next(100_000, 1_000_000).ToString();
                var stored = $"reauth:{code}";

                var existing = await _context.EmailTokens.FirstOrDefaultAsync(t => t.Email!.ToLower() == email.ToLower());
                if (existing != null)
                {
                    existing.Token = stored;
                    existing.Expiration = DateTime.UtcNow.AddMinutes(15);
                }
                else
                {
                    _context.EmailTokens.Add(new EmailToken { Email = email, Token = stored, Expiration = DateTime.UtcNow.AddMinutes(15) });
                }
                await _context.SaveChangesAsync();

                var emailClient = new EmailClient(_acsSettings.ConnectionString);
                var content = new EmailContent("Your Frogmarks login code")
                {
                    PlainText = $"Your Frogmarks login code is: {code}\n\nThis code expires in 15 minutes. Do not share it with anyone.",
                    Html = $@"<p style=""font-family:sans-serif"">Your Frogmarks login code is:</p>
                              <p style=""font-family:monospace;font-size:32px;font-weight:bold;letter-spacing:6px"">{code}</p>
                              <p style=""font-family:sans-serif;color:#888"">This code expires in 15 minutes. Do not share it with anyone.</p>"
                };
                var message = new EmailMessage("donotreply@frogmarks.com", email, content);
                await emailClient.SendAsync(WaitUntil.Started, message);

                return new ResultModel<string>(ResultType.Success, resultObject: email);
            }
            catch (RequestFailedException)
            {
                return new ResultModel<string>(ResultType.Failure, "Failed to send email.");
            }
            catch (Exception ex)
            {
                _logger.LogError("SendReauthCode error: {Message}", ex.Message);
                return new ResultModel<string>(ResultType.Failure, "An error occurred.");
            }
        }

        public async Task<ResultModel<string>> VerifyReauthCode(string email, string code)
        {
            try
            {
                var stored = $"reauth:{code}";
                var emailToken = await _context.EmailTokens.SingleOrDefaultAsync(t =>
                    t.Email!.ToLower() == email.ToLower() &&
                    t.Token == stored &&
                    t.Expiration > DateTime.UtcNow);

                if (emailToken == null)
                    return new ResultModel<string>(ResultType.Failure, "Invalid or expired code.");

                var user = await _userManager.FindByEmailAsync(email);
                if (user == null)
                    return new ResultModel<string>(ResultType.NotFound, "Account not found.");

                // Invalidate the used code immediately
                _context.EmailTokens.Remove(emailToken);

                var accessToken = _tokenGenerator.GenerateAuthToken(user.Id, user.UserName, DateTime.UtcNow.AddMinutes(15));
                var refreshToken = _tokenGenerator.GenerateRefreshToken();

                user.RefreshToken = refreshToken;
                user.RefreshTokenExpiryTime = DateTime.UtcNow.AddDays(7);
                await _userManager.UpdateAsync(user);
                await _context.SaveChangesAsync();

                var accessOpts = new CookieOptions { HttpOnly = true, Secure = true, SameSite = SameSiteMode.None, Expires = DateTime.UtcNow.AddMinutes(15) };
                var refreshOpts = new CookieOptions { HttpOnly = true, Secure = true, SameSite = SameSiteMode.None, Expires = DateTime.UtcNow.AddDays(7) };
                _httpContextAccessor.HttpContext!.Response.Cookies.Append("accessToken", accessToken, accessOpts);
                _httpContextAccessor.HttpContext!.Response.Cookies.Append("refreshToken", refreshToken, refreshOpts);

                _logger.LogInformation("Reauth code verified for {Email}", email);
                return new ResultModel<string>(ResultType.Success, resultObject: user.Id);
            }
            catch (Exception ex)
            {
                _logger.LogError("VerifyReauthCode error: {Message}", ex.Message);
                return new ResultModel<string>(ResultType.Failure, "An error occurred.");
            }
        }

    }
}