namespace Frogmarks.Models.Dtos.Illustration
{
    public class IllustrationViewDto
    {
        public string BundleUrl { get; set; } = "";
        public string Name { get; set; } = "";
        public DateTime? PublishedAt { get; set; }
        public int PublishedVersion { get; set; }
    }
}
