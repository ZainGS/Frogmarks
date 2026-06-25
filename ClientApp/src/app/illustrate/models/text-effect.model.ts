// ── Text Effect Types (mirrors Salsa's TextEffectEngine types) ──

export type TextEffectType = 'chromatic-aberration' | 'glow' | 'wave' | 'glitch' | 'outline' | 'feather';

export interface TextEffectEntry {
  id: number;
  type: TextEffectType;
  params: Record<string, any>;
}

export interface TextEffectPreset {
  label: string;
  icon: string;
  effects: TextEffectEntry[];
}

export const TEXT_EFFECT_TYPE_OPTIONS: { value: TextEffectType; label: string }[] = [
  { value: 'chromatic-aberration', label: 'Chromatic Aberration' },
  { value: 'glow',                 label: 'Glow' },
  { value: 'wave',                 label: 'Wave' },
  { value: 'glitch',               label: 'Glitch' },
  { value: 'outline',              label: 'Outline' },
  { value: 'feather',              label: 'Feather' },
];

let _nextId = 1;

export function createDefaultParams(type: TextEffectType): Record<string, any> {
  switch (type) {
    case 'chromatic-aberration': return { strength: 0.005, angle: 0 };
    case 'glow':                 return { radius: 4, intensity: 1.5, glowColor: [1, 1, 1, 1] };
    case 'wave':                 return { amplitude: 3, frequency: 10, speed: 1, time: 0 };
    case 'glitch':               return { intensity: 0.3, blockSize: 8, time: 0 };
    case 'outline':              return { thickness: 2, color: [0, 0, 0, 1], offset: [0, 0] as [number, number], gap: 0 };
    case 'feather':              return { mode: 'linear', angle: 90, start: 0.6, end: 1.0 };
  }
}

export function createEffectEntry(type: TextEffectType): TextEffectEntry {
  return { id: _nextId++, type, params: createDefaultParams(type) };
}

export const TEXT_EFFECT_PRESETS: TextEffectPreset[] = [
  {
    label: 'Impact',
    icon: '🔥',
    effects: [
      { id: 0, type: 'outline', params: { thickness: 3, color: [0, 0, 0, 1] } },
      { id: 0, type: 'chromatic-aberration', params: { strength: 0.008, angle: 0 } },
    ],
  },
  {
    label: 'Energy',
    icon: '✨',
    effects: [
      { id: 0, type: 'glow', params: { radius: 8, intensity: 2.5, color: [0.2, 0.6, 1.0] } },
      { id: 0, type: 'chromatic-aberration', params: { strength: 0.004, angle: 0 } },
    ],
  },
  {
    label: 'Ghost',
    icon: '👻',
    effects: [
      { id: 0, type: 'wave', params: { amplitude: 4, frequency: 8, speed: 1, time: 0 } },
      { id: 0, type: 'glow', params: { radius: 6, intensity: 1.5, color: [0.8, 0.8, 1.0] } },
    ],
  },
  {
    label: 'Horror',
    icon: '💀',
    effects: [
      { id: 0, type: 'wave', params: { amplitude: 6, frequency: 3, speed: 0.5, time: 0 } },
      { id: 0, type: 'outline', params: { thickness: 2, color: [0.3, 0, 0, 1] } },
    ],
  },
  {
    label: 'Glitch',
    icon: '🤖',
    effects: [
      { id: 0, type: 'glitch', params: { intensity: 0.4, blockSize: 6, time: 0 } },
      { id: 0, type: 'chromatic-aberration', params: { strength: 0.006, angle: 0 } },
    ],
  },
  {
    label: 'Clean',
    icon: '💬',
    effects: [
      { id: 0, type: 'outline', params: { thickness: 2, color: [0, 0, 0, 1] } },
    ],
  },
  {
    label: 'Neon',
    icon: '💡',
    effects: [
      { id: 0, type: 'outline', params: { thickness: 1, color: [0, 0, 0, 1] } },
      { id: 0, type: 'glow', params: { radius: 10, intensity: 3.0, color: [1, 0, 0.5] } },
    ],
  },
  {
    label: 'Boom',
    icon: '💥',
    effects: [
      { id: 0, type: 'outline', params: { thickness: 4, color: [0, 0, 0, 1] } },
      { id: 0, type: 'glow', params: { radius: 4, intensity: 1.5 } },
      { id: 0, type: 'chromatic-aberration', params: { strength: 0.01, angle: 0.3 } },
    ],
  },
];

// ── Balloon Presets ──────────────────────────────────────────

export interface BalloonPreset {
  label: string;
  style: string;
  tailSide: string;
  tailPosition: number;
  showTail: boolean;
  fontSize?: number;
  bold?: boolean;
  italic?: boolean;
  strokeWidth?: number;
  fillColor?: string;
}

export const BALLOON_PRESETS: BalloonPreset[] = [
  { label: 'Clean',     style: 'rounded-rect', tailSide: 'bottom', tailPosition: 0.5, showTail: true },
  { label: 'Shout',     style: 'burst',        tailSide: 'bottom', tailPosition: 0.3, showTail: true, fontSize: 72, bold: true },
  { label: 'Whisper',   style: 'ellipse',      tailSide: 'bottom', tailPosition: 0.5, showTail: true, fontSize: 36, italic: true, strokeWidth: 1 },
  { label: 'Thought',   style: 'thought',      tailSide: 'bottom', tailPosition: 0.3, showTail: true },
  { label: 'Scream',    style: 'burst',        tailSide: 'bottom', tailPosition: 0.5, showTail: true, fontSize: 96, bold: true },
  { label: 'Narration', style: 'rounded-rect', tailSide: 'bottom', tailPosition: 0.5, showTail: false, fillColor: '#f2f2e6' },
];

// ── Custom Shader Snippets ───────────────────────────────────

export interface ShaderSnippet {
  label: string;
  code: string;
  params: [number, number, number, number];
}

export const SHADER_SNIPPETS: ShaderSnippet[] = [
  {
    label: 'Grayscale',
    code: `let c = textureLoad(src, vec2<i32>(gid.xy), 0);
let grey = dot(c.rgb, vec3<f32>(0.299, 0.587, 0.114));
textureStore(dst, gid.xy, vec4<f32>(vec3(grey), c.a));`,
    params: [0, 0, 0, 0],
  },
  {
    label: 'Invert',
    code: `let c = textureLoad(src, vec2<i32>(gid.xy), 0);
textureStore(dst, gid.xy, vec4<f32>(1.0 - c.rgb, c.a));`,
    params: [0, 0, 0, 0],
  },
  {
    label: 'Sepia',
    code: `let c = textureLoad(src, vec2<i32>(gid.xy), 0);
let r = dot(c.rgb, vec3<f32>(0.393, 0.769, 0.189));
let g = dot(c.rgb, vec3<f32>(0.349, 0.686, 0.168));
let b = dot(c.rgb, vec3<f32>(0.272, 0.534, 0.131));
textureStore(dst, gid.xy, vec4<f32>(min(r, 1.0), min(g, 1.0), min(b, 1.0), c.a));`,
    params: [0, 0, 0, 0],
  },
  {
    label: 'Ripple',
    code: `let dist = distance(uv, u.cursor);
let ripple = sin(dist * u.params.x - u.time * u.params.y) * u.params.z;
let offset = vec2<i32>(vec2<f32>(f32(dim.x), f32(dim.y)) * vec2<f32>(ripple, 0.0));
let coord = clamp(vec2<i32>(gid.xy) + offset, vec2<i32>(0), vec2<i32>(i32(dim.x)-1, i32(dim.y)-1));
let c = textureLoad(src, coord, 0);
textureStore(dst, gid.xy, c);`,
    params: [40, 5, 0.01, 0],
  },
  {
    label: 'Pixelate',
    code: `let ps = max(u.params.x, 1.0);
let pixelCoord = vec2<i32>(vec2<f32>(floor(vec2<f32>(f32(gid.x), f32(gid.y)) / ps) * ps));
let c = textureLoad(src, pixelCoord, 0);
textureStore(dst, gid.xy, c);`,
    params: [8, 0, 0, 0],
  },
  {
    label: 'Vignette',
    code: `let c = textureLoad(src, vec2<i32>(gid.xy), 0);
let center = vec2<f32>(0.5, 0.5);
let dist = distance(uv, center);
let vignette = smoothstep(u.params.x, u.params.x - u.params.y, dist);
textureStore(dst, gid.xy, vec4<f32>(c.rgb * vignette, c.a));`,
    params: [0.7, 0.4, 0, 0],
  },
  {
    label: 'Rainbow',
    code: `let c = textureLoad(src, vec2<i32>(gid.xy), 0);
let hue = fract(uv.x + u.time * u.params.x);
let hueR = abs(hue * 6.0 - 3.0) - 1.0;
let hueG = 2.0 - abs(hue * 6.0 - 2.0);
let hueB = 2.0 - abs(hue * 6.0 - 4.0);
let tint = clamp(vec3<f32>(hueR, hueG, hueB), vec3(0.0), vec3(1.0));
let mixed = mix(c.rgb, tint, u.params.y * c.a);
textureStore(dst, gid.xy, vec4<f32>(mixed, c.a));`,
    params: [1, 0.3, 0, 0],
  },
  {
    label: 'Breathe',
    code: `let c = textureLoad(src, vec2<i32>(gid.xy), 0);
let pulse = mix(u.params.y, u.params.z, (sin(u.time * u.params.x) + 1.0) * 0.5);
textureStore(dst, gid.xy, vec4<f32>(c.rgb * pulse, c.a));`,
    params: [2, 0.6, 1.4, 0],
  },
  {
    label: 'Scan Line',
    code: `let c = textureLoad(src, vec2<i32>(gid.xy), 0);
let line = fract(u.time * u.params.x);
let dist = abs(uv.y - line);
let glow = smoothstep(u.params.y, 0.0, dist) * u.params.z;
textureStore(dst, gid.xy, vec4<f32>(c.rgb + vec3(glow), c.a));`,
    params: [2, 0.05, 0.5, 0],
  },
];
