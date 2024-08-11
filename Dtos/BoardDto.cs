using Frogmarks.Models.Logging;
using Frogmarks.Models.Team;
using System.ComponentModel.DataAnnotations.Schema;

namespace Frogmarks.Models.Board
{
    /// <summary>
    /// A Board is the primary object that BoardCollaborators will modify; multiple BoardCollaborators will add BoardItems to the Board 
    /// for planning, flowcharting, digital workshopping, UI/UX design, etc. Multiple organizationIt  is possible that an organization is structured such that multiple Teams 
    /// must be able to collaborate. While
    /// </summary>
    public class BoardDto: AuditLog
    {
        public Guid UUID { get; set; }
        public string Name { get; set; } = "Untitled";
        public string? Description { get; set; } = string.Empty;
        public string? ThumbnailUrl { get; set; } = string.Empty;
        public int StartViewLeftTop { get; set; } = 0;
        public int StartViewLeftBottom { get; set; } = 0;
        public int StartViewRightTop { get; set; } = 0;
        public int StartViewRightBottom { get; set; } = 0;
        public string BackgroundColor { get; set; } = "fff";

        public List<BoardCollaborator>? Collaborators { get; set; } = new List<BoardCollaborator>();
        public List<BoardItem>? BoardItems { get; set; } = new List<BoardItem>();
        public long? TeamId { get; set; }
        public Models.Team.Team? Team { get; set; }
        // public List<Team.Team>? Teams { get; set; } = new List<Team.Team>();
        public bool IsDraft { get; set; } = true;
        public bool IsFavorite { get; set; } = false;

        public long? PreferencesId { get; set; }
        public BoardUserPreferences? Preferences { get; set; }

        public long? ProjectId { get; set; }
        public TeamProject? Project { get; set; }

        public long? PermissionsId { get; set; }
        public BoardPermissions? Permissions { get; set; }

        public DateTime? LastViewed { get; set; }
    }
}