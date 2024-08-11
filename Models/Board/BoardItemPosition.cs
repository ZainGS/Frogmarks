using Frogmarks.Models.Logging;
using System.ComponentModel.DataAnnotations.Schema;

namespace Frogmarks.Models.Board
{
    public class BoardItemPosition
    {      
        public long Id { get; set; }
        public long BoardItemId { get; set; }
        [ForeignKey("BoardItemId")]
        public virtual BoardItem? BoardItem { get; set; }

        public int X { get; set; } = 0;
        public int Y { get; set; } = 0;
        public int Width { get; set; } = 1;
        public int Height { get; set; } = 1;
        public int Rotation { get; set; } = 0;
    }
}
