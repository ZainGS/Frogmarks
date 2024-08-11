using System;

namespace Frogmarks.Models.Board
{
    public class BoardViewLog: BaseEntity
    {
        public long BoardId { get; set; }
        public virtual Board Board { get; set; }
        public long TeamUserId { get; set; }
        public virtual TeamUser TeamUser { get; set; }
        public string ApplicationUserId { get; set; }
        public virtual ApplicationUser ApplicationUser { get; set; }

        public DateTime LastViewed { get; set; }

        
    }
}