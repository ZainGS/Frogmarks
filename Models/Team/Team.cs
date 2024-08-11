
namespace Frogmarks.Models.Team
{
    public class Team: AuditLog
    {
        public string Name { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public virtual List<TeamProject>? TeamProjects { get; set; }
        public virtual List<Board.Board>? Boards { get; set; }
        public virtual List<TeamUser>? Users { get; set; }
    }
}
