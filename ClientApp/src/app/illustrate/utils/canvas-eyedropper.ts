/**
 * Eyedropper read (UI review 2026-10-07 §3 #10): the colour the canvas SHOWS at a viewport point.
 * Newer Salsa: sm.sampleCanvasColor (reads the final frame back on the GPU). Older dist: the canvas is drawn into a
 * 1 × 1 2D canvas (a WebGPU canvas keeps its last presented frame for drawImage in Chromium); a fully transparent
 * read counts as no colour.
 */
export interface EyedropperEngine {
  sampleCanvasColor?(clientX: number, clientY: number): Promise<{ hex: string; a: number } | null>;
}

const hex2 = (v: number): string => v.toString(16).padStart(2, '0');

/** #rrggbb from 0..255 premultiplied-or-straight RGBA (a 2D canvas getImageData is straight). */
export function rgbHex(r: number, g: number, b: number): string { return '#' + hex2(r) + hex2(g) + hex2(b); }

export async function sampleCanvasHex(engine: EyedropperEngine | null | undefined, canvas: HTMLCanvasElement | null,
                                      clientX: number, clientY: number): Promise<string | null> {
  if (engine && typeof engine.sampleCanvasColor === 'function') {
    const c = await engine.sampleCanvasColor(clientX, clientY);
    return c && c.a > 0 ? c.hex : null;
  }
  if (!canvas || typeof document === 'undefined') return null;
  const rect = canvas.getBoundingClientRect();
  if (clientX < rect.left || clientY < rect.top || clientX >= rect.right || clientY >= rect.bottom || !rect.width || !rect.height) return null;
  const sx = Math.floor((clientX - rect.left) * canvas.width / rect.width);
  const sy = Math.floor((clientY - rect.top) * canvas.height / rect.height);
  const one = document.createElement('canvas');
  one.width = one.height = 1;
  const ctx = one.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  const read = (): string | null => {
    try {
      ctx.clearRect(0, 0, 1, 1);
      ctx.drawImage(canvas, sx, sy, 1, 1, 0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return d[3] > 0 ? rgbHex(d[0], d[1], d[2]) : null;
    } catch {
      return null;
    }
  };
  // A WebGPU canvas is readable only inside the frame that drew it: ask for a frame, read in the animation frame
  // queued after the engine's (a 2D canvas reads at once).
  const now = read();
  if (now || typeof requestAnimationFrame !== 'function') return now;
  for (let i = 0; i < 3; i++) {
    (engine as { scheduleRender?(): void } | null | undefined)?.scheduleRender?.();
    const hex = await new Promise<string | null>(res => requestAnimationFrame(() => res(read())));
    if (hex) return hex;
  }
  return null;
}
