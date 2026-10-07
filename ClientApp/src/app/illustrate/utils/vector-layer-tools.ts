/**
 * The tool rail when the editor enters / leaves a vector layer (UI review 2026-10-07 #6 + the 2b "options panel stays
 * open after its tool leaves the rail" row). The 2D rail and the vector rail offer different tools: a tool that only
 * one rail has must not stay active (with its options panel open) once that rail is gone, and the raster tool a
 * vector layer pushed out (the brush) comes back when the user returns to a raster layer.
 */

/** Tools only the vector rail offers (`.tools-vector` in illustration.component.html). */
export function isVectorOnlyTool(tool: string): boolean {
  return tool.startsWith('shape:') || tool === 'polygon:freeform' || tool === 'arrow';
}

/** 2D-rail tools that don't apply on a vector layer (brushes, raster tools, fill). */
export function isRasterOnlyTool(tool: string): boolean {
  return tool.startsWith('drawing:') || tool.startsWith('raster:') || tool === 'fill';
}

export interface VectorToolSwitch {
  /** The tool to switch to ('' = none), or null to leave the active tool alone. */
  next: string | null;
  /** The raster tool to bring back when the user leaves vector mode ('' = none). */
  remembered: string;
}

/**
 * @param tool       the active tool now
 * @param wasVector  a vector layer was active
 * @param toVector   a vector layer is active after the change
 * @param remembered the raster tool remembered when vector mode was entered
 */
export function vectorLayerToolSwitch(tool: string, wasVector: boolean, toVector: boolean, remembered: string): VectorToolSwitch {
  if (toVector) {
    if (wasVector) return { next: null, remembered };                       // one vector layer → another
    return isRasterOnlyTool(tool) ? { next: '', remembered: tool } : { next: null, remembered: '' };
  }
  if (!wasVector) return { next: null, remembered };                        // raster → raster: nothing to do
  if (isVectorOnlyTool(tool)) return { next: remembered, remembered: '' };  // its rail is gone: back to the brush (or none)
  if (!tool && remembered) return { next: remembered, remembered: '' };
  return { next: null, remembered: '' };
}
