using Frogmarks.Models.Board;

namespace Frogmarks.Models.Team
{
    public class TeamProject
    {
        public long Id { get; set; } // Assuming there is an Id property in the base class or adding one if not
        public string Name { get; set; } = string.Empty;
        // public List<string> Tags { get; set; } = new List<string>();
        public virtual List<ApplicationUser> Users { get; set; } = new List<ApplicationUser>();
        public virtual List<Board.Board> Boards { get; set; } = new List<Board.Board>();
        public bool IsPublic { get; set; }
    }
}
