using Microsoft.AspNetCore.Http;
using System.IdentityModel.Tokens.Jwt;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Microsoft.IdentityModel.Tokens;
using System.Security.Claims;
using Microsoft.Extensions.Logging;
using System;

namespace Frogmarks.Auth
{
    // More like accessTokenMiddleware
    public class JwtMiddleware
    {
        private readonly RequestDelegate _next;
        private readonly string _secretKey;
        private readonly ILogger<JwtMiddleware> _logger;

        public JwtMiddleware(RequestDelegate next, string secretKey, ILogger<JwtMiddleware> logger)
        {
            _next = next;
            _secretKey = secretKey;
            _logger = logger;
        }

        public async Task Invoke(HttpContext context)
        {
            var token = context.Request.Cookies["accessToken"];
            if (token != null)
            {
                AttachUserToContext(context, token);
            }
            else
            {
                _logger.LogInformation("No access token found in cookies.");
            }

            await _next(context);
        }

        private void AttachUserToContext(HttpContext context, string token)
        {
            try
            {
                var tokenHandler = new JwtSecurityTokenHandler();
                var key = Encoding.ASCII.GetBytes(_secretKey);
                var principal = tokenHandler.ValidateToken(token, new TokenValidationParameters
                {
                    ValidateIssuerSigningKey = true,
                    IssuerSigningKey = new SymmetricSecurityKey(key),
                    ValidateIssuer = false,
                    ValidateAudience = false,
                    ClockSkew = TimeSpan.Zero
                }, out SecurityToken validatedToken);

                var jwtToken = (JwtSecurityToken)validatedToken;
                var userId = jwtToken.Claims.First(x => x.Type == ClaimTypes.NameIdentifier).Value;

                // Attach user to context on successful JWT validation
                context.Items["User"] = userId;
                context.User = principal;
            }
            catch (SecurityTokenExpiredException ex)
            {
                _logger.LogWarning("Token has expired: {Message}", ex.Message);
            }
            catch (SecurityTokenException ex)
            {
                _logger.LogWarning("Token validation failed: {Message}", ex.Message);
            }
            catch (Exception ex)
            {
                _logger.LogError("An error occurred while validating the token: {Message}", ex.Message);
            }
        }
    }
}