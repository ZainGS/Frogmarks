namespace Frogmarks.Models.DTOs
{
    public class BoardRequestDto
    {
        public long BoardId { get; set; }
        public string SceneGraphData { get; set; } = string.Empty; // JSON string of the scene graph
    }
}
