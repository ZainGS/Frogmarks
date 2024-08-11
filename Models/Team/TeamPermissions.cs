using System.ComponentModel.DataAnnotations.Schema;

namespace Frogmarks.Models.Team
{
    public class TeamPermissions
    {
        public long Id { get; set; }

        public long TeamRoleId { get; set; }

        [ForeignKey("TeamRoleId")]
        public virtual TeamRole? TeamRole { get; set; }

        public bool CanAddMembers { get; set; } = false;
        public bool CanDeleteMembers { get; set; } = false;
        public bool CanCreateBoards { get; set; } = false;
        public bool CanEditBoards { get; set; } = false;
        public bool CanDeleteBoards { get; set; } = false;
        public bool CanCreateProjects { get; set; } = false;
        public bool CanEditProjects { get; set; } = false;
        public bool CanDeleteProjects { get; set; } = false;
        public bool CanChangePermissions { get; set; } = false;
    }
}
