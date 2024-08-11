using Duende.IdentityServer.Services;
using Frogmarks.Auth;
using Frogmarks.Models;
using Frogmarks.Models.Auth;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;

namespace Frogmarks.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly UserManager<ApplicationUser> _userManager;
        private readonly SignInManager<ApplicationUser> _signInManager;
        private readonly TokenGenerator _tokenGenerator;
        private readonly IConfiguration _configuration;

        public AuthController(UserManager<ApplicationUser> userManager, SignInManager<ApplicationUser> signInManager, TokenGenerator tokenGenerator, IConfiguration configuration)
        {
            _userManager = userManager;
            _signInManager = signInManager;
            _tokenGenerator = tokenGenerator;
            _configuration = configuration;
        }

        [HttpPost("login")]
        public async Task<IActionResult> Login([FromBody] LoginRequest request)
        {
            var user = await _userManager.FindByEmailAsync(request.Email);
            if (user != null && await _userManager.CheckPasswordAsync(user, request.Password))
            {
                var accessToken = _tokenGenerator.GenerateAuthToken(user.Id, user.UserName, DateTime.UtcNow.AddMinutes(15));
                var refreshToken = _tokenGenerator.GenerateRefreshToken();

                // Store the refresh token in the database or a secure location
                // (e.g., in a database associated with the user)
                // For example:
                user.RefreshToken = refreshToken;
                user.RefreshTokenExpiryTime = DateTime.UtcNow.AddDays(7);
                await _userManager.UpdateAsync(user);

                var accessTokenCookieOptions = new CookieOptions
                {
                    HttpOnly = true,
                    //Secure = true, // Set to true in production to use HTTPS
                    SameSite = SameSiteMode.None,
                    Expires = DateTime.UtcNow.AddMinutes(15)
                };

                var refreshTokenCookieOptions = new CookieOptions
                {
                    HttpOnly = true,
                    //Secure = true, // Set to true in production to use HTTPS
                    SameSite = SameSiteMode.None,
                    Expires = DateTime.UtcNow.AddDays(7)
                };

                Response.Cookies.Append("accessToken", accessToken, accessTokenCookieOptions);
                Response.Cookies.Append("refreshToken", refreshToken, refreshTokenCookieOptions);

                return Ok(new { message = "Login successful" });
            }

            return Unauthorized();
        }

        [HttpPost("refresh-token")]
        public async Task<IActionResult> RefreshToken()
        {
            var refreshToken = Request.Cookies["refreshToken"];
            if (refreshToken == null)
            {
                return Unauthorized();
            }

            var user = await _userManager.Users.SingleOrDefaultAsync(u => u.RefreshToken == refreshToken && u.RefreshTokenExpiryTime > DateTime.UtcNow);
            if (user == null)
            {
                return Unauthorized();
            }

            var uid = user.Id;
            var newAccessToken = _tokenGenerator.GenerateAuthToken(user.Id, user.UserName, DateTime.UtcNow.AddMinutes(15));
            var newRefreshToken = _tokenGenerator.GenerateRefreshToken();

            user.RefreshToken = newRefreshToken;
            user.RefreshTokenExpiryTime = DateTime.UtcNow.AddDays(7);
            await _userManager.UpdateAsync(user);

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

            Response.Cookies.Append("accessToken", newAccessToken, accessTokenCookieOptions);
            Response.Cookies.Append("refreshToken", newRefreshToken, refreshTokenCookieOptions);

            return Ok(new { message = "Token refreshed successfully", userId = uid });
        }

        // For Swagger Token
        [HttpGet("generate-token")]
        public IActionResult GenerateToken()
        {
            var token = GenerateJwtToken("exampleuser");
            return Ok(new { Token = token });
        }

        private string GenerateJwtToken(string username)
        {
            var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_configuration["JwtSettings:SecretKey"]));
            var credentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
            new Claim(JwtRegisteredClaimNames.Sub, username),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

            var token = new JwtSecurityToken(
                issuer: _configuration["JwtSettings:Issuer"],
                audience: _configuration["JwtSettings:Audience"],
                claims: claims,
                expires: DateTime.Now.AddMinutes(120),
                signingCredentials: credentials);

            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        [HttpGet("user-id")]
        public IActionResult GetUserId()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            if (userId == null)
            {
                return Unauthorized();
            }
            return Ok(new { userId });
        }

    }
}
