using Frogmarks.Models;
using Frogmarks.Services;
using Microsoft.AspNetCore.Mvc;
using System;
using System.ComponentModel.DataAnnotations;
using System.Threading.Tasks;
using Frogmarks.Models.Auth;

namespace Frogmarks.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class UserController : ControllerBase
    {
        private readonly IUserService _userService;

        public UserController(IUserService userService)
        {
            _userService = userService;
        }

        // GET: api/user/email
        [HttpGet("email")]
        public async Task<IActionResult> GetUserByEmail([FromQuery][EmailAddress] string email)
        {
            if (string.IsNullOrEmpty(email))
            {
                return BadRequest("Email is required.");
            }

            try
            {
                var user = await _userService.GetUserByEmailAsync(email);
                if (user == null)
                {
                    return NotFound("User not found.");
                }

                return Ok(user);
            }
            catch (Exception ex)
            {
                // Log the exception (ex)
                return StatusCode(500, "Internal server error. Please try again later.");
            }
        }

        // POST: api/user
        [HttpPost]
        public async Task<IActionResult> CreateUser([FromBody] CreateUserRequest request)
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            try
            {
                var user = new ApplicationUser
                {
                    UserName = request.UserName,
                    Email = request.Email,
                    // Add other properties as needed
                };

                var createdUser = await _userService.CreateUserAsync(user, request.Password);
                if (createdUser == null)
                {
                    return BadRequest("Failed to create user.");
                }

                return Ok(createdUser);
            }
            catch (Exception ex)
            {
                // Log the exception (ex)
                return StatusCode(500, "Internal server error. Please try again later.");
            }
        }
    }
}