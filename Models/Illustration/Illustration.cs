using Frogmarks.Models.Board;
using Frogmarks.Models.Team;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Frogmarks.Models.Illustration
{
    public class Illustration : AuditLog
    {
        public Guid UUID { get; set; }
        public string Name { get; set; } = "Untitled";
        public string? Description { get; set; } = string.Empty;
        public string? ThumbnailUrl { get; set; } = string.Empty;
        public bool IsCustomThumbnail { get; set; } = false;

        public virtual List<IllustrationCollaborator>? Collaborators { get; set; } = new List<IllustrationCollaborator>();
        // public virtual List<BoardItem>? BoardItems { get; set; } = new List<BoardItem>();
        public long? TeamId { get; set; }
        public virtual Models.Team.Team? Team { get; set; }
        public bool isDraft { get; set; } = true;

        public long? PreferencesId { get; set; }
        [ForeignKey("PreferencesId")]
        public virtual IllustrationUserPreferences? Preferences { get; set; }

        public long? ProjectId { get; set; }
        [ForeignKey("ProjectId")]
        public virtual TeamProject? Project { get; set; }

        public long? PermissionsId { get; set; }
        [ForeignKey("PermissionsId")]
        public virtual IllustrationPermissions? Permissions { get; set; }

        public string? CanvasData { get; set; } // Stored as JSON string (v1 legacy)
        public bool IsArchived { get; set; } = false;
        public double Width { get; set; }
        public double Height { get; set; }

        // V2 scene architecture
        public int SceneVersion { get; set; } = 1;
        public long SavedAt { get; set; } = 0;         // epoch ms — for OPFS freshness comparison
        public bool AnimationEnabled { get; set; } = false;
        public int FrameCount { get; set; } = 24;
        public int Fps { get; set; } = 12;

        [MaxLength(20)]
        public string LoopMode { get; set; } = "loop";
        public int PlayRangeStart { get; set; } = 1;
        public int PlayRangeEnd { get; set; } = 24;
        public string? OnionSkinConfig { get; set; } // JSON blob

        // Extended V2 state — canvas settings, 3D scene, dither, document size
        public string? ExtendedStateJson { get; set; }  // JSON blob

        // Sync mode: 0=CloudSync (default), 1=NoCloud, 2=LocalOnly
        public int SyncMode { get; set; } = 0;

        // Publishing
        public bool IsPublic { get; set; } = false;
        public string? PublishedBundleBlobName { get; set; }
        public string? PublishedTitle { get; set; }
        public string? PublishedThumbnailBlobName { get; set; }
        public DateTime? PublishedAt { get; set; }
        public int PublishedVersion { get; set; } = 0;

        public virtual List<IllustrationLayer> Layers { get; set; } = new();
    }
}
