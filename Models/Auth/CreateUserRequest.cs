using System.ComponentModel.DataAnnotations;

namespace Frogmarks.Models.Auth
{
    public class CreateUserRequest
    {
        [Required]
        [EmailAddress]
        public string Email { get; set; } = string.Empty;

        public string? UserName { get; set; }

        public string? Password { get; set; }
    }
}
