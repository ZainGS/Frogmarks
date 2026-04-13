namespace Frogmarks.Models.Dtos.Illustration
{
    public class IllustrationStateDto
    {
        public int Version { get; set; } = 2;
        public string? SceneGraph { get; set; }
        public AnimationStateDto? Animation { get; set; }
        public List<LayerStateDto> Layers { get; set; } = new();
        public DitherConfigDto? DitherConfig { get; set; }
    }

    public class AnimationStateDto
    {
        public bool Enabled { get; set; }
        public int FrameCount { get; set; } = 24;
        public int Fps { get; set; } = 12;
        public string LoopMode { get; set; } = "loop";
        public int PlayRangeStart { get; set; } = 1;
        public int PlayRangeEnd { get; set; } = 24;
        public OnionSkinDto? OnionSkin { get; set; }
    }

    public class OnionSkinDto
    {
        public bool Enabled { get; set; }
        public int FramesBefore { get; set; } = 2;
        public int FramesAfter { get; set; } = 1;
        public float Opacity { get; set; } = 0.3f;
        public float[] TintBefore { get; set; } = { 1.0f, 0.2f, 0.2f };
        public float[] TintAfter { get; set; } = { 0.2f, 0.5f, 1.0f };
    }

    public class LayerStateDto
    {
        public string LayerId { get; set; } = "";
        public string Name { get; set; } = "";
        public int Order { get; set; }
        public bool Visible { get; set; } = true;
        public bool Locked { get; set; }
        public string BlendMode { get; set; } = "normal";
        public double Opacity { get; set; } = 1.0;
        public bool Clipped { get; set; }
        public bool LockTransparency { get; set; }
        public bool Animated { get; set; }
        public List<CelStateDto> Cels { get; set; } = new();
        // Populated on load response only:
        public string? PixelDataUrl { get; set; }
        public DitherConfigDto? DitherConfig { get; set; }
    }

    public class CelStateDto
    {
        public string CelId { get; set; } = "";
        public int Frame { get; set; }
        public int Duration { get; set; } = 1;
        public bool IsKey { get; set; } = true;
        public string CelType { get; set; } = "key";
        // Populated on load response only:
        public string? PixelDataUrl { get; set; }
        public int? Width { get; set; }
        public int? Height { get; set; }
    }

    public class DitherConfigDto
    {
        public bool Enabled { get; set; }
        public string Algorithm { get; set; } = "halftone_dot";
        public int ColorLevels { get; set; } = 2;
        public int BayerLevel { get; set; } = 2;
        public double HalftoneAngle { get; set; } = 45;
        public double HalftoneFrequency { get; set; } = 40;
        public double Strength { get; set; } = 1.0;
        public double PatternScale { get; set; } = 0.25;
        public bool PerChannel { get; set; }
        public string ColorMode { get; set; } = "duotone";
        public double[] ForegroundColor { get; set; } = new[] { 0.0, 0.0, 0.0, 1.0 };
        public double[] BackgroundColor { get; set; } = new[] { 1.0, 1.0, 1.0, 0.0 };
        public bool InvertPattern { get; set; }
        public double TintOpacity { get; set; } = 1.0;
    }
}
