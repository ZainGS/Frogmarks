namespace Frogmarks.Models.Dtos.Base
{
    public class DuplicateRequestDto
    {
        public string? Name { get; set; }
        public long? TeamId { get; set; }
        public bool CopyThumbnail { get; set; } = false;
    }
}
