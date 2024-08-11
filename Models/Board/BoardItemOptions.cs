using Frogmarks.Models.Enums;
using Frogmarks.Models.Logging;

namespace Frogmarks.Models.Board
{
    public class BoardItemOptions
    {
        public long Id { get; set; }
        public int? FontId { get; set; }
        public int? FontSize { get; set; } = 16;
        // public List<int>? FontStyleIds { get; set; } = new List<int>();
        public int? BorderThickness { get; set; } = 2;
        public double? BorderOpacity { get; set; } = 1;
        public string? BorderColor { get; set; } = "000000";
        public HorizontalAlignment HorizontalAlignment { get; set; } = HorizontalAlignment.Center;
        public VerticalAlignment VerticalAlignment { get; set; } = VerticalAlignment.Middle;
    }
}
