using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace Frogmarks.Models.Illustration
{
    public class IllustrationLayer
    {
        [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
        public long Id { get; set; }

        public long IllustrationId { get; set; }
        public virtual Illustration? Illustration { get; set; }

        [MaxLength(50)]
        public string LayerId { get; set; } = "";

        [MaxLength(200)]
        public string? Name { get; set; }

        public int SortOrder { get; set; } = 0;
        public bool Visible { get; set; } = true;
        public bool Locked { get; set; } = false;

        [MaxLength(30)]
        public string BlendMode { get; set; } = "normal";

        public double Opacity { get; set; } = 1.0;
        public bool Clipped { get; set; } = false;
        public bool LockTransparency { get; set; } = false;
        public bool Animated { get; set; } = false;

        // For non-animated layers: single pixel data reference
        [MaxLength(500)]
        public string? PixelDataUrl { get; set; }
        public int? PixelWidth { get; set; }
        public int? PixelHeight { get; set; }

        [MaxLength(10)]
        public string? PixelFormat { get; set; } = "webp";

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        public virtual List<IllustrationCel> Cels { get; set; } = new();
    }
}
