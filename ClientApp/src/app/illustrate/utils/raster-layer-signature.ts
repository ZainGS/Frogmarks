/** The engine calls the layer signature reads (a ShapeManager satisfies it). */
export interface LayerSignatureSource {
  getRasterLayers(): unknown[] | null | undefined;
  isLayerAnimated?(layerId: string): boolean;
  getCels?(layerId: string): Array<{ id: string; startFrame: number; duration: number; celType: string }> | null | undefined;
}

/**
 * A cheap signature of everything the Layers panel and the animation timeline show (zone audit H5): each layer's
 * structure fields as getRasterLayers() returns them (id / order / name / type / parent / visibility / lock / blend /
 * opacity / clip / lock-transparency / collapsed / owners) plus, per layer, the animated flag and its cels' id / start /
 * duration / type. A 2D move / rotate / scale fires a scene-graph change on every pointer move but changes none of
 * this, so the editor skips the layer + timeline refresh while the signature is unchanged.
 *
 * A few small layers + their cels: no geometry, no pixels.
 */
export function rasterLayerSignature(sm: LayerSignatureSource | null | undefined): string {
  if (!sm) return '';
  const layers = (sm.getRasterLayers() ?? []) as Array<{ id?: string }>;
  const parts: string[] = [];
  for (const l of layers) {
    parts.push(JSON.stringify(l));
    const id = l?.id;
    if (!id) continue;
    if (typeof sm.isLayerAnimated === 'function') parts.push(sm.isLayerAnimated(id) ? 'A' : 'S');
    if (typeof sm.getCels === 'function') {
      const cels = sm.getCels(id) ?? [];
      parts.push(cels.length + ':' + cels.map(c => c.id + '@' + c.startFrame + '+' + c.duration + c.celType).join(','));
    }
  }
  return parts.join('|');
}
