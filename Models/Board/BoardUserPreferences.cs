using Frogmarks.Models.Enums;

namespace Frogmarks.Models.Board
{
    public class BoardUserPreferences
    {
        public long Id { get; set; }
        public long BoardId { get; set; }

        // View
        public bool SnapToGrid { get; set; } = true;
        public bool ShowCollaboratorCursors { get; set; } = true;
        public bool ShowCommentsOnBoard { get; set; } = true;
        public bool ShowScrollBars { get; set; } = true;
        public bool ShowObjectDimensions { get; set; } = false;

        // Preferences
        public PeripheralType PeripheralType { get; set; } = PeripheralType.Autodetect;
        public bool AlignObjects { get; set; } = true;
        public bool ReduceMotion { get; set; } = false;
        public bool FollowAllThreads { get; set; } = true;
    }
}
