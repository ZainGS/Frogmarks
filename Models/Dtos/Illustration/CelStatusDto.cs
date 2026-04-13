namespace Frogmarks.Models.Dtos.Illustration
{
    public class CelStatusRequestDto
    {
        public List<string> CelIds { get; set; } = new();
    }

    public class CelStatusItemDto
    {
        public bool Exists { get; set; }
        public string? Hash { get; set; }
    }
}
