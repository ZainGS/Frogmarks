using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Frogmarks.Models.Illustration
{
    public class IllustrationCel
    {
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public long Id { get; set; }

        public long LayerDbId { get; set; }
        public virtual IllustrationLayer? Layer { get; set; }

        [MaxLength(50)]
        public string CelId { get; set; } = "";

        public int Frame { get; set; }
        public int Duration { get; set; } = 1;
        public bool IsKey { get; set; } = true;

        [MaxLength(20)]
        public string CelType { get; set; } = "key";

        [MaxLength(500)]
        public string? PixelDataUrl { get; set; }
        public int? PixelWidth { get; set; }
        public int? PixelHeight { get; set; }

        [MaxLength(10)]
        public string? PixelFormat { get; set; } = "webp";

        [MaxLength(64)]
        public string? ContentHash { get; set; }
        public long BlobSizeBytes { get; set; } = 0;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    }
}
