/**
 * Small pure helpers for the 2D drawing tools' UI (UI review 2026-10-07): the one-line hint per vector tool (§3 #12)
 * and where the touch "Done editing text" pill goes so it never covers the text being typed (§2b).
 */

const SHAPE_NAMES: Record<string, string> = { square: 'rectangle', circle: 'circle', triangle: 'triangle', polygon: 'polygon' };

/**
 * The hint under a vector tool's options. `engineDrags`: the Salsa dist has drag-to-size shapes and press-drag-release
 * arrows (ShapeManager.shapeDragToSize); an older dist only places by click.
 */
export function vectorToolHint(tool: string, shapeKind: string, engineDrags: boolean): string {
  if (tool.startsWith('shape:')) {
    const name = SHAPE_NAMES[tool.slice('shape:'.length)] ?? SHAPE_NAMES[shapeKind] ?? 'shape';
    return engineDrags
      ? `Drag to draw a ${name} (Shift keeps it even); a click places the default size.`
      : `Click to place a ${name}.`;
  }
  if (tool === 'arrow') {
    return engineDrags
      ? 'Drag from the start to the end, or click the start, then the end. Esc cancels.'
      : 'Click the start, then click the end. Esc cancels.';
  }
  return '';
}

/** A screen box (viewport px). */
export interface ScreenSpan { top: number; bottom: number }

/**
 * The pill's `top` (viewport px) for LiveText editing: just above the text box; below it when there's no room above
 * (the top bar); at the top when neither fits. null = no box known (keep the default bottom placement).
 * The default bottom placement is not used while editing: the on-screen keyboard covers the bottom of the screen and
 * the box is often right there.
 */
export function liveTextPillTop(box: ScreenSpan | null, viewportH: number, pillH: number, topInset: number, gap = 12): number | null {
  if (!box) return null;
  const above = box.top - gap - pillH;
  if (above >= topInset) return above;
  const below = box.bottom + gap;
  if (below + pillH <= viewportH - 8) return below;
  return topInset;
}
