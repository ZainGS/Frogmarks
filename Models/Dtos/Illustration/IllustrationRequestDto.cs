namespace Frogmarks.Models.Dtos.Illustration
{
    public class IllustrationRequestDto
    {
        public long IllustrationId { get; set; }
        public string CanvasData { get; set; } = string.Empty; // JSON string of the raster layers(?)
    }
}
