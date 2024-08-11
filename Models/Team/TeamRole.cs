using System.ComponentModel.DataAnnotations.Schema;

namespace Frogmarks.Models.Team
{
    public class TeamRole
    {
        public long Id { get; set; }
        public string Name { get; set; } = string.Empty;

        public long TeamId { get; set; }
        [ForeignKey("TeamId")]
        public virtual Team? Team { get; set; }

        public long PermissionsId { get; set; }
        public virtual TeamPermissions? Permissions { get; set; }
    }
}
