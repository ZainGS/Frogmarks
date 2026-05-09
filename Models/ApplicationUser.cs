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

        public bool IsPro { get; set; } = false;
        public long BlobStorageBytes { get; set; } = 0;

        public long StorageQuotaBytes => IsPro
            ? StorageQuotas.ProBytes
            : StorageQuotas.FreeBytes;
    }

    public static class StorageQuotas
    {
        public const long FreeBytes = 1L * 1024 * 1024 * 1024;  // 1 GB
        public const long ProBytes  = 20L * 1024 * 1024 * 1024; // 20 GB
    }
}