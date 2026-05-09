namespace Frogmarks.Models.Dtos.Illustration
{
    public class StorageQuotaDto
    {
        public long UsedBytes { get; set; }
        public long QuotaBytes { get; set; }
        public bool IsPro { get; set; }
    }

    public class IllustrationStateDto
    {
        public int Version { get; set; } = 2;
        public long SavedAt { get; set; }           // epoch ms — used for OPFS vs backend freshness
        public string? SceneGraph { get; set; }
        public AnimationStateDto? Animation { get; set; }
        public List<LayerStateDto> Layers { get; set; } = new();
        public DitherConfigDto? DitherConfig { get; set; }
        public DocumentSizeDto? DocumentSize { get; set; }
        public string? BgColor { get; set; }
        public string? DotColor { get; set; }
        public PaperGrainDto? PaperGrain { get; set; }
        public Scene3dGlobalSettingsDto? Scene3dGlobalSettings { get; set; }
        public string? Scene3dNodesGzip { get; set; }           // gzip+base64 — legacy (pre-per-mesh) reads only
        public string? TextureLibrary3dGzip { get; set; }       // gzip+base64 — legacy reads only

        // Per-mesh blob storage (v3 save path)
        public List<string>? MeshIds { get; set; }              // all current mesh IDs; used on load to know which blobs exist
        // Load response only — not persisted
        public Dictionary<string, string>? MeshSasUrls { get; set; }   // meshId → read SAS URL
        public string? TexLibSasUrl { get; set; }               // read SAS URL for texture-library.gz
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
        public DitherConfigDto? DitherConfig { get; set; }
        public FrameLinkAnimationDto? FrameLinkAnimation { get; set; }
        // Populated on load response only:
        public string? PixelDataUrl { get; set; }
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
        public double DuotoneBias { get; set; }
        public double TintOpacity { get; set; } = 1.0;
    }

    public class FrameLinkAnimationDto
    {
        public bool Enabled { get; set; }
        public string Type { get; set; } = "";
        public double Amplitude { get; set; }
        public double Frequency { get; set; }
        public double Speed { get; set; }
        public double Direction { get; set; }
        public double Phase { get; set; }
        public string LoopMode { get; set; } = "loop";
        public double RippleCenterX { get; set; }
        public double RippleCenterY { get; set; }
        public int NoiseOctaves { get; set; }
        public double NoiseLacunarity { get; set; }
        public double NoisePersistence { get; set; }
        public int ShakeSeed { get; set; }
        public bool DisplaceX { get; set; }
        public bool DisplaceY { get; set; }
    }

    public class DocumentSizeDto
    {
        public double W { get; set; }
        public double H { get; set; }
    }

    public class PaperGrainDto
    {
        public string Type { get; set; } = "none";
        public double Scale { get; set; } = 1.0;
        public double Strength { get; set; } = 0.3;
    }

    public class Scene3dGlobalSettingsDto
    {
        public string? CameraMode { get; set; }
        public string? IllustrationProjection { get; set; }
        public double? Fov { get; set; }
        public bool? ShadowsEnabled { get; set; }
        public int? ShadowMapSize { get; set; }
        public double? ShadowExtent { get; set; }
        public double? ShadowBias { get; set; }
        public double? LightDirX { get; set; }
        public double? LightDirY { get; set; }
        public double? LightDirZ { get; set; }
        public double? LightIntensity { get; set; }
        public double? AmbientR { get; set; }
        public double? AmbientG { get; set; }
        public double? AmbientB { get; set; }
        public double? AmbientIntensity { get; set; }
        public double? Ps1Jitter { get; set; }
        public double? Ps1Snap { get; set; }
        public double? Ps1Affine { get; set; }
        public int? Ps1ColorDepth { get; set; }
        public bool? FrustumCulling { get; set; }
        public bool? AnimSyncWithTimeline { get; set; }
        public int? AnimStartFrame { get; set; }
        public int? AnimEndFrame { get; set; }
        public double? AnimFps { get; set; }
        public bool? AnimLoop { get; set; }
    }
}
