// Colour helpers shared by the editor and its extracted panels (refactor-plan Phase 2.0).
// Moved verbatim from illustration.component.ts (_buildingColorToHex / _hexToRgba01).

/** Engine colour (hex string, [r,g,b] in 0..1 or 0..255, or {r,g,b}) → '#rrggbb'. */
export function colorToHex(v: unknown): string {
  if (typeof v === 'string') return v.startsWith('#') ? v : `#${v}`;
  const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n)) * (n <= 1 ? 255 : 1)).toString(16).padStart(2, '0');
  if (Array.isArray(v) && v.length >= 3) return `#${toHex(v[0])}${toHex(v[1])}${toHex(v[2])}`;
  if (v && typeof v === 'object') {
    const o = v as any;
    return `#${toHex(o.r ?? 0)}${toHex(o.g ?? 0)}${toHex(o.b ?? 0)}`;
  }
  return '#000000';
}

/** '#rrggbb' → { r, g, b, a } in 0..1 (alpha always 1). */
export function hexToRgba01Obj(hex: string): { r: number; g: number; b: number; a: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16) / 255,
    g: parseInt(h.substring(2, 4), 16) / 255,
    b: parseInt(h.substring(4, 6), 16) / 255,
    a: 1,
  };
}

/** '#rgb' / '#rrggbb' → [r, g, b, 1] in 0..1. */
export function hexToRgba01(hex: string): [number, number, number, number] {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  return [r, g, b, 1];
}

/** [r, g, b, a] in 0..1 → '#rrggbb'. */
export function rgba01ToHex(c: [number, number, number, number]): string {
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return '#' + toHex(c[0]) + toHex(c[1]) + toHex(c[2]);
}

// HSL helpers for the persistent colour picker (h 0..360, s / l 0..100).
export function hexToHSL(hex: string): { h: number; s: number; l: number } {
  let r = parseInt(hex.substring(1, 3), 16) / 255;
  let g = parseInt(hex.substring(3, 5), 16) / 255;
  let b = parseInt(hex.substring(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
}
export function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return '#' + [r + m, g + m, b + m].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}
export function lightnessToSbY(l: number, s: number): number {
  const Lleft = l / (1 - s / 200);
  return 100 - Lleft;
}
export function sbYToLightness(sbY: number, s: number): number {
  const Lleft = 100 - sbY;
  return Lleft * (1 - s / 200);
}

/** Text-effect colour ([r,g,b(,a)] in 0..1) → '#rrggbb' for a colour input. */
export function fxColorToHex(color: number[] | undefined | null): string {
  if (!color || color.length < 3) return '#000000';
  const toH = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0');
  return `#${toH(color[0])}${toH(color[1])}${toH(color[2])}`;
}

/** '#rrggbb' → text-effect colour [r,g,b,a] in 0..1. */
export function fxHexToColor(hex: string, existingAlpha = 1): [number, number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16) / 255,
    parseInt(h.substring(2, 4), 16) / 255,
    parseInt(h.substring(4, 6), 16) / 255,
    existingAlpha,
  ];
}

/** { r, g, b } in 0..1 → '#rrggbb'. */
export function rgba01ObjToHex(c: { r: number; g: number; b: number; a?: number }): string {
  const r = Math.round((c.r ?? 0) * 255).toString(16).padStart(2, '0');
  const g = Math.round((c.g ?? 0) * 255).toString(16).padStart(2, '0');
  const b = Math.round((c.b ?? 0) * 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

/** '#'-prefix a bare 3 / 6 / 8-digit hex colour ('191919' -> '#191919'); anything else is returned unchanged. */
export function withHash(color: string | null | undefined): string {
  const c = (color ?? '').trim();
  return /^(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(c) ? '#' + c : c;
}

/** Any CSS colour (#rgb / #rrggbb / #rrggbbaa / rgb[a]() / named) -> {r,g,b} 0–255 + a 0–1. Named colours go through
 *  a canvas context. */
export function parseAnyColor(color: string): { r: number; g: number; b: number; a: number } {
  let r = 255, g = 255, b = 255, a = 1;
  color = withHash(color);   // a bare 'rrggbb' (the engine's getBackgroundColor) used to fall through to white
  if (color.startsWith('#')) {
    const hex = color.substring(1);
    if (hex.length === 3) { r = parseInt(hex[0] + hex[0], 16); g = parseInt(hex[1] + hex[1], 16); b = parseInt(hex[2] + hex[2], 16); }
    else if (hex.length === 6 || hex.length === 8) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
      if (hex.length === 8) a = parseInt(hex.slice(6, 8), 16) / 255;
    }
  } else if (color.startsWith('rgb')) {
    const vals = color.match(/\d+(\.\d+)?/g);
    if (vals) { r = +vals[0]; g = +vals[1]; b = +vals[2]; if (vals[3]) a = +vals[3]; }
  } else {
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.fillStyle = color;
    const computed = ctx.fillStyle;
    if (computed.startsWith('rgb')) {
      const vals = computed.match(/\d+(\.\d+)?/g)!;
      r = +vals[0]; g = +vals[1]; b = +vals[2]; if (vals[3]) a = +vals[3];
    }
  }
  return { r, g, b, a };
}
