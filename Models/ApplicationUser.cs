using Frogmarks.Models.Team;
using Microsoft.AspNetCore.Identity;

namespace Frogmarks.Models
{
    /// <summary>
    /// ApplicationUser is the Global version of TeamUser.
    /// A TeamUser exists solely in the context of a Team, whereas an ApplicationUser
    /// may exist within the entire scope of the Frogmarks ecosystem.
    /// </summary>
    public class ApplicationUser : IdentityUser
    {
        public string FirstName { get; set; } = string.Empty;
        public string LastName { get; set; } = string.Empty;
        // public List<Role> Roles { get; set; } = new List<Role>();
        public string? AzureUserIdentifier { get; set; } = null;

        public virtual List<TeamUser> TeamUserScopes { get; set; } = new List<TeamUser>();
        public string? RefreshToken { get; set; }
        public DateTime? RefreshTokenExpiryTime { get; set; }
    }
}