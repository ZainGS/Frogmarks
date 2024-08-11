using Frogmarks.Models.Board;
using Frogmarks.Models.Team;
using System.ComponentModel.DataAnnotations.Schema;

namespace Frogmarks.Models
{
    public class TeamUser
    {
        /// <summary>
        /// You can think of this as a Team-Scoped User.
        /// </summary>
        public long Id { get; set; }
        public long TeamId { get; set; }
        public virtual Models.Team.Team Team { get; set; }
        public virtual List<TeamRole> TeamRoles { get; set; } = new List<TeamRole>();
        public virtual List<Models.Board.Board> FavoriteBoards { get; set; } = new List<Models.Board.Board>();

        public string ApplicationUserId { get; set; }
        [ForeignKey("ApplicationUserId")]
        public virtual ApplicationUser ApplicationUser { get; set; }
    }
}
