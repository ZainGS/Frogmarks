/** Brush tip — either parametric (circle/ellipse) or an image stamp */
export type BrushTip =
  | { type: 'parametric'; hardness: number; roundness: number; angle: number }
  | { type: 'image'; imageData: string; imageSize: number };

/** A single point on a dynamics pressure curve (0-1 on both axes) */
export interface CurvePoint {
  x: number;
  y: number;
}

/** Dynamics curves & jitter */
export interface BrushDynamics {
  sizePressureCurve: CurvePoint[];
  opacityPressureCurve: CurvePoint[];
  flowPressureCurve: CurvePoint[];
  rotationPressureCurve?: CurvePoint[];
  scatterPressureCurve?: CurvePoint[];
  sizeVelocityCurve?: CurvePoint[];
  sizeRandomJitter?: number;
  rotationRandomJitter?: number;
  scatterDistance?: number;
}

/** Optional grain / texture overlay */
export interface BrushTexture {
  imageData: string;
  scale: number;
  strength: number;
  mode: 'multiply' | 'subtract';
  fixedToCanvas: boolean;
}

/** Blending settings per-stroke */
export interface BrushBlending {
  mode: 'normal' | 'multiply' | 'screen' | 'overlay';
  opacity: number;  // 0-1
  flow: number;     // 0-1
  colorMixing?: number;
  colorStretch?: number;
}

/** Stabilization / smoothing */
export interface BrushStabilization {
  method: StabilizationMethod;
  level: number; // 0-10
  pullStringLength?: number; // 10-60px (only for pull-string)
}

/** Brush bleed — spreads wet paint into surrounding pixels */
export interface BrushBleed {
  enabled: boolean;
  perDab: boolean;   // true = ping-pong bleed every dab; false = diffusion only at end-of-stroke
  radius: number;    // 1–32 px — how far wet paint spreads
  strength: number;  // 0–1
}

/** Brush smudge — picks up existing canvas color and mixes it into the stroke */
export interface BrushSmudge {
  enabled: boolean;
  strength: number;     // 0–1 (scaled by stylus pressure per-dab)
  sampleRadius: number; // currently unused by engine, reserved for future multi-px sampling
}

/** Full brush preset (matches Salsa engine schema) */
export interface BrushPreset {
  id: string;
  name: string;
  category: BrushCategory;
  icon?: string;

  tip: BrushTip;
  spacing: number; // 0.01-2.0

  dynamics: BrushDynamics;
  texture?: BrushTexture;
  blending: BrushBlending;
  stabilization: BrushStabilization;

  bleed?: BrushBleed;
  smudge?: BrushSmudge;

  antiAliasing: boolean;
  minSize: number; // px
  maxSize: number; // px
  version: number; // always 1
}

/** Raster layer entry type */
export type RasterLayerType = 'layer' | 'folder' | '3d-scene' | 'reference';

/** Raster layer descriptor */
export interface RasterLayer {
  id: string;
  name: string;
  type: RasterLayerType;      // defaults to 'layer'
  parentId: string | null;    // null = root level
  visible: boolean;
  locked: boolean;
  blendMode: LayerBlendMode;
  opacity: number;           // 0-1
  clipped: boolean;
  lockTransparency: boolean;
  collapsed?: boolean;        // only meaningful for folders
}

// ── Enums ──────────────────────────────────────────────────────

/** GPU compositor blend modes (matches Salsa RasterCompositor enum) */
export enum LayerBlendMode {
  Normal     = 0,
  Multiply   = 1,
  Screen     = 2,
  Overlay    = 3,
  SoftLight  = 4,
  HardLight  = 5,
  ColorDodge = 6,
  ColorBurn  = 7,
  Darken     = 8,
  Lighten    = 9,
  Add        = 10,
  Difference = 11,
}

/** UI-friendly metadata for each blend mode */
export interface BlendModeInfo {
  value: LayerBlendMode;
  label: string;
  category: string;
  tooltip: string;
}

/** Grouped blend-mode options for dropdown rendering */
export const BLEND_MODE_OPTIONS: BlendModeInfo[] = [
  { value: LayerBlendMode.Normal,     label: 'Normal',       category: 'Normal',   tooltip: 'Standard alpha compositing' },
  { value: LayerBlendMode.Multiply,   label: 'Multiply',     category: 'Darken',   tooltip: 'Darkens; great for shadows' },
  { value: LayerBlendMode.ColorBurn,  label: 'Color Burn',   category: 'Darken',   tooltip: 'Deep shadow burn' },
  { value: LayerBlendMode.Darken,     label: 'Darken',       category: 'Darken',   tooltip: 'Keeps darkest pixels' },
  { value: LayerBlendMode.Screen,     label: 'Screen',       category: 'Lighten',  tooltip: 'Lightens; great for glows' },
  { value: LayerBlendMode.ColorDodge, label: 'Color Dodge',  category: 'Lighten',  tooltip: 'Bright highlight pop' },
  { value: LayerBlendMode.Lighten,    label: 'Lighten',      category: 'Lighten',  tooltip: 'Keeps lightest pixels' },
  { value: LayerBlendMode.Add,        label: 'Add (Glow)',   category: 'Lighten',  tooltip: 'Additive blending for fire/light effects' },
  { value: LayerBlendMode.Overlay,    label: 'Overlay',      category: 'Contrast', tooltip: 'Increases contrast' },
  { value: LayerBlendMode.SoftLight,  label: 'Soft Light',   category: 'Contrast', tooltip: 'Subtle contrast shift' },
  { value: LayerBlendMode.HardLight,  label: 'Hard Light',   category: 'Contrast', tooltip: 'Strong contrast shift' },
  { value: LayerBlendMode.Difference, label: 'Difference',   category: 'Utility',  tooltip: 'Inverts based on brightness difference' },
];

/** Distinct category names in display order */
export const BLEND_MODE_CATEGORIES = ['Normal', 'Darken', 'Lighten', 'Contrast', 'Utility'];

export type BrushCategory = string;

export type StabilizationMethod = 'none' | 'moving-average' | 'predictive' | 'catmull-rom' | 'pull-string';

export type EraserStyle = 'fade' | 'clear';

export type EraserHardness = 'soft' | 'hard';

// ═══════════════════════════════════════════════════════════════
//  Canvas Grain (Paper Texture) Types
// ═══════════════════════════════════════════════════════════════

/** Grain types supported by the Salsa CanvasGrainManager */
export type CanvasGrainType =
  | 'none'
  | 'cold-press'
  | 'hot-press'
  | 'canvas-linen'
  | 'rough'
  | 'watercolor'
  | 'newsprint';

/** Settings passed to paintEngine.setCanvasGrain() */
export interface CanvasGrainSettings {
  type: CanvasGrainType;
  scale: number;     // texture tile scale (0.1–5.0)
  strength: number;  // grain intensity (0–1)
}

/** UI-friendly metadata for each grain type */
export interface CanvasGrainOption {
  value: CanvasGrainType;
  label: string;
  tooltip: string;
}

/** Grain type options for dropdown rendering */
export const CANVAS_GRAIN_OPTIONS: CanvasGrainOption[] = [
  { value: 'none',         label: 'None',          tooltip: 'No paper texture' },
  { value: 'cold-press',   label: 'Cold Press',    tooltip: 'Medium-rough watercolor paper' },
  { value: 'hot-press',    label: 'Hot Press',     tooltip: 'Smooth watercolor paper' },
  { value: 'canvas-linen', label: 'Canvas Linen',  tooltip: 'Woven canvas texture' },
  { value: 'rough',        label: 'Rough',         tooltip: 'Heavy tooth drawing paper' },
  { value: 'watercolor',   label: 'Watercolor',    tooltip: 'Classic watercolor paper grain' },
  { value: 'newsprint',    label: 'Newsprint',     tooltip: 'Dot-screen halftone paper' },
];

// ═══════════════════════════════════════════════════════════════
//  Phase 3 — Selection & Transform Types
// ═══════════════════════════════════════════════════════════════

/** Active selection tool mode */
export type SelectionTool = 'rect' | 'ellipse' | 'lasso' | 'magic-wand';

/** Magic wand selection mode */
export type WandSelectionMode = 'new' | 'add' | 'subtract';

/** Magic wand options */
export interface MagicWandOptions {
  tolerance: number;
  contiguous: boolean;
  mode: WandSelectionMode;
  referenceLayerId?: string;
}

/** Bounding rectangle in texel space */
export interface SelectionBounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Current transform state for a floating selection */
export interface TransformState {
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
}

/** Full selection info returned by ShapeManager.getRasterSelectionInfo() */
export interface SelectionInfo {
  hasSelection: boolean;
  bounds: SelectionBounds | null;
  isTransforming: boolean;
  transform: TransformState | null;
}

// ═══════════════════════════════════════════════════════════════
//  Phase 4 — Arrowheads & Raster Text Types
// ═══════════════════════════════════════════════════════════════

/** Arrowhead style for line endpoints */
export type ArrowheadStyle = 'none' | 'triangle' | 'closedCircle' | 'openCircle';

/** All available arrowhead styles (for dropdown rendering) */
export const ARROWHEAD_STYLES: ArrowheadStyle[] = ['none', 'triangle', 'closedCircle', 'openCircle'];

/** Arrowhead option for dropdown UI */
export interface ArrowheadOption {
  value: ArrowheadStyle;
  label: string;
}

export const ARROWHEAD_OPTIONS: ArrowheadOption[] = [
  { value: 'none',         label: 'None' },
  { value: 'triangle',     label: 'Triangle' },
  { value: 'closedCircle', label: 'Closed Circle' },
  { value: 'openCircle',   label: 'Open Circle' },
];

/** State of the raster text tool (from ShapeManager.getRasterTextState) */
export interface RasterTextState {
  isActive: boolean;
  text: string;
  destX: number;
  destY: number;
  font: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  align: 'left' | 'center' | 'right';
  color: [number, number, number, number]; // RGBA 0-1
  maxWidth: number;
  lineHeight: number;
  caretIndex: number;
}

// ═══════════════════════════════════════════════════════════════
//  DITHER EFFECT
// ═══════════════════════════════════════════════════════════════

export type DitherAlgorithm =
  | 'bayer'
  | 'halftone_dot'
  | 'halftone_line'
  | 'halftone_diamond'
  | 'blue_noise'
  | 'noise';

export type DitherColorMode = 'quantize' | 'duotone';

export interface DitherConfig {
  enabled: boolean;
  algorithm: DitherAlgorithm;
  colorLevels: number;
  bayerLevel: number;
  halftoneAngle: number;
  halftoneFrequency: number;
  strength: number;
  patternScale: number;
  perChannel: boolean;
  // Color controls
  colorMode: DitherColorMode;
  foregroundColor: [number, number, number, number];
  backgroundColor: [number, number, number, number];
  invertPattern: boolean;
  duotoneBias: number;
  tintOpacity: number;
}

export const DEFAULT_DITHER_CONFIG: DitherConfig = {
  enabled: false,
  algorithm: 'halftone_dot',
  colorLevels: 2,
  bayerLevel: 2,
  halftoneAngle: 45,
  halftoneFrequency: 40,
  strength: 1.0,
  patternScale: 0.25,
  perChannel: false,
  colorMode: 'duotone',
  foregroundColor: [0, 0, 0, 1],
  backgroundColor: [1, 1, 1, 0],
  invertPattern: false,
  duotoneBias: 0.5,
  tintOpacity: 1.0,
};

export interface DitherAlgorithmOption {
  value: DitherAlgorithm;
  label: string;
}

export const DITHER_ALGORITHM_OPTIONS: DitherAlgorithmOption[] = [
  { value: 'bayer',            label: 'Bayer (Crosshatch)' },
  { value: 'halftone_dot',     label: 'Halftone — Dot' },
  { value: 'halftone_line',    label: 'Halftone — Line' },
  { value: 'halftone_diamond', label: 'Halftone — Diamond' },
  { value: 'blue_noise',       label: 'Blue Noise (Organic)' },
  { value: 'noise',            label: 'Random Noise' },
];

export interface BayerLevelOption {
  value: number;
  label: string;
}

export const BAYER_LEVEL_OPTIONS: BayerLevelOption[] = [
  { value: 0, label: '2×2 (coarse)' },
  { value: 1, label: '4×4' },
  { value: 2, label: '8×8 (default)' },
  { value: 3, label: '16×16' },
  { value: 4, label: '32×32 (fine)' },
];

export interface ColorLevelOption {
  value: number;
  label: string;
}

export const COLOR_LEVEL_OPTIONS: ColorLevelOption[] = [
  { value: 2,   label: '1-bit (B&W)' },
  { value: 3,   label: '3-level' },
  { value: 4,   label: '2-bit (4 tones)' },
  { value: 8,   label: '3-bit (8 tones)' },
  { value: 16,  label: '4-bit (16 tones)' },
  { value: 256, label: 'Off (no quantization)' },
];

export const HALFTONE_SHAPE_OPTIONS: { value: DitherAlgorithm; label: string }[] = [
  { value: 'halftone_dot',     label: 'Dot' },
  { value: 'halftone_line',    label: 'Line' },
  { value: 'halftone_diamond', label: 'Diamond' },
];

export const COLOR_MODE_OPTIONS: { value: DitherColorMode; label: string }[] = [
  { value: 'quantize', label: 'Quantize' },
  { value: 'duotone',  label: 'Duotone' },
];

// ═══════════════════════════════════════════════════════════
//  Frame Link Animation
// ═══════════════════════════════════════════════════════════

export type FrameLinkAnimationType = 'wave' | 'shake' | 'ripple' | 'noise' | 'turbulence';
export type FrameLinkLoopMode = 'free' | 'loop-to-fit';

export interface FrameLinkAnimation {
  enabled: boolean;
  type: FrameLinkAnimationType;
  amplitude: number;
  frequency: number;
  speed: number;
  direction: number;
  phase: number;
  loopMode: FrameLinkLoopMode;
  rippleCenterX: number;
  rippleCenterY: number;
  noiseOctaves: number;
  noiseLacunarity: number;
  noisePersistence: number;
  shakeSeed: number;
  displaceX: boolean;
  displaceY: boolean;
}

export const DEFAULT_FRAME_LINK_ANIMATION: FrameLinkAnimation = {
  enabled: false,
  type: 'wave',
  amplitude: 10,
  frequency: 3.0,
  speed: 0.15,
  direction: 0,
  phase: 0,
  loopMode: 'free',
  rippleCenterX: 0.5,
  rippleCenterY: 0.5,
  noiseOctaves: 2,
  noiseLacunarity: 2.0,
  noisePersistence: 0.5,
  shakeSeed: 0,
  displaceX: true,
  displaceY: false,
};

export const FRAME_LINK_TYPE_OPTIONS: { value: FrameLinkAnimationType; label: string }[] = [
  { value: 'wave',       label: 'Wave' },
  { value: 'shake',      label: 'Shake' },
  { value: 'ripple',     label: 'Ripple' },
  { value: 'noise',      label: 'Noise' },
  { value: 'turbulence', label: 'Turbulence' },
];

export const FRAME_LINK_LOOP_MODE_OPTIONS: { value: FrameLinkLoopMode; label: string }[] = [
  { value: 'free',        label: 'Free' },
  { value: 'loop-to-fit', label: 'Loop to Fit' },
];
