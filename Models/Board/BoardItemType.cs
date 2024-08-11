namespace Frogmarks.Models.Board
{
    public class BoardItemType
    {
        public long Id { get; set; }
        public string Name { get; set; } = string.Empty; // Might need to be replaced with a new class like BoardItemShape or BoardObject
        public bool HasFont { get; set; } = false;
        public bool HasFontSize { get; set; } = false;
        public bool HasFontStyle { get; set; } = false;
        public bool HasTextAlignment { get; set; } = false;
        public bool HasBorderOptions { get; set; } = false; //border style, opacity, color
        public bool HasFillColor { get; set; } = false;
        public bool HasLink { get; set; } = false;
        public bool HasTextColor { get; set; } = false;
        public bool HasHighlightColor { get; set; } = false;
        public bool HasLock { get; set; } = false;
    }
}
