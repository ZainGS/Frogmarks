using Frogmarks.Models.Logging;
using System.ComponentModel.DataAnnotations.Schema;

namespace Frogmarks.Models.Board
{
    public class BoardItem
    {
        public long Id { get; set; }
        public long PositionDataId { get; set; }
        public virtual BoardItemPosition? PositionData { get; set; }
       
        public long TypeId { get; set; }
        public virtual BoardItemType Type { get; set; }
        
        public long OptionsId { get; set; }
        public virtual BoardItemOptions? Options { get; set; }
    }
}
