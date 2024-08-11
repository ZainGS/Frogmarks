using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;

namespace Frogmarks.Auth
{
    public class TokenGenerator
    {
        private readonly string _secretKey;
        private readonly IConfiguration _configuration;

        public TokenGenerator(IOptions<JwtSettings> tokenSettings, IConfiguration configuration)
        {
            _secretKey = tokenSettings.Value.Secret;
            _configuration = configuration;
        }

        /// <summary>
        /// Method to generate a JWT token. This uses a secret key for signing the JWT.
        /// </summary>
        /// <param name="userId"></param>
        /// <param name="userName"></param>
        /// <param name="expiry"></param>
        /// <returns></returns>
        public string GenerateAuthToken(string userId, string userName, DateTime expiry)
        {
            var securityKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_configuration["JwtSettings:SecretKey"]));
            var credentials = new SigningCredentials(securityKey, SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
                new Claim(JwtRegisteredClaimNames.Sub, userId),
                new Claim(ClaimTypes.NameIdentifier, userId), // Add this claim for compatibility
                new Claim(JwtRegisteredClaimNames.UniqueName, userName),
                new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
            };

            var token = new JwtSecurityToken(
                issuer: _configuration["JwtSettings:Issuer"],
                audience: _configuration["JwtSettings:Audience"],
                claims: claims,
                expires: expiry,
                signingCredentials: credentials);

            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        public string GenerateRefreshToken()
        {
            byte[] tokenData = new byte[32];
            RandomNumberGenerator.Fill(tokenData);
            return Convert.ToBase64String(tokenData);
        }

        public string GenerateEmailSignInToken()
        {
            byte[] tokenData = new byte[32];
            RandomNumberGenerator.Fill(tokenData);
            var tokenString = Convert.ToBase64String(tokenData);

            return MakeUrlSafe(tokenString);
        }

        public static string MakeUrlSafe(string input)
        {
            return input.Replace("+", "-")  // (space in URL encoding)
                        .Replace("/", "_")  // (path delimiter)
                        .Replace("=", "")   // (padding character in Base64)
                        .Replace("%", "."); // (percent-encoded characters)
        }
    }
}