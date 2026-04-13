namespace Frogmarks.Models.Base
{
    public class Permissions
    {
        public long Id { get; set; }
        public bool CanNonCollaboratorsView { get; set; } = true;
        public bool CanNonCollaboratorsEdit { get; set; } = false;
    }
}
