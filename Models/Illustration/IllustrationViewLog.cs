using Frogmarks.Models.Board;
using Frogmarks.Models.Team;
using System.ComponentModel.DataAnnotations.Schema;

namespace Frogmarks.Models.Illustration
{
    public class IllustrationViewLog : BaseEntity
    {
        public long IllustrationId { get; set; }
        public virtual Illustration Illustration { get; set; }
        public long TeamUserId { get; set; }
        public virtual TeamUser TeamUser { get; set; }
        public string ApplicationUserId { get; set; }
        public virtual ApplicationUser ApplicationUser { get; set; }
        public DateTime LastViewed { get; set; }
    }
}
