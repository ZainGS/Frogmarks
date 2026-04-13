using Frogmarks.Models.Board;
using Frogmarks.Models.Illustration;
using Frogmarks.Models.Team;

namespace Frogmarks.Models.Dtos.Illustration
{
    public class IllustrationDto : AuditLog
    {
        public Guid UUID { get; set; }
        public string Name { get; set; } = "Untitled";
        public string? Description { get; set; } = string.Empty;
        public string? ThumbnailUrl { get; set; } = string.Empty;
        public bool IsCustomThumbnail { get; set; } = false;

        public List<IllustrationCollaboratorDto>? Collaborators { get; set; } = new();
        // public List<BoardItem>? BoardItems { get; set; } = new List<BoardItem>();
        public long? TeamId { get; set; }
        public TeamDto? Team { get; set; }
        // public List<Team.Team>? Teams { get; set; } = new List<Team.Team>();
        public bool IsDraft { get; set; } = true;
        public bool IsFavorite { get; set; } = false;

        public long? PreferencesId { get; set; }
        public IllustrationUserPreferences? Preferences { get; set; }

        public long? ProjectId { get; set; }
        public TeamProject? Project { get; set; }

        public long? PermissionsId { get; set; }
        public IllustrationPermissions? Permissions { get; set; }

        public DateTime? LastViewed { get; set; }
        public List<string>? CachedThumbnailIllustrationIds { get; set; }
        public string? SceneGraphData { get; set; } // Stored as JSON string
        public bool IsArchived { get; set; } = false;
        public double Width { get; set; }
        public double Height { get; set; }
    }
}
