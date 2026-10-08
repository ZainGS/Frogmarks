import { LayerEffectsHost, LayerEffectsService } from './layer-effects.service';

// Layer Dither panel "Bake" (2026-10-08): sm.bakeLayerDither writes the dithered look into the layer pixels as one
// raster undo entry and turns the engine's layer dither off (settings kept). The panel mirrors that, is disabled on
// an engine without the API, and follows the engine after undo / redo (undoing a bake turns the dither back on).

function make(engine: { bake?: boolean; result?: boolean } = {}) {
  const engineCfg = new Map<string, Record<string, unknown> | undefined>();
  const calls: string[] = [];
  let dirty = 0;
  const sm: Record<string, unknown> = {
    setLayerDitherConfig: (id: string, cfg: Record<string, unknown> | undefined) => { engineCfg.set(id, cfg ? { ...cfg } : undefined); return true; },
    getLayerDitherConfig: (id: string) => engineCfg.get(id),
    getRasterLayers: () => [{ id: 'L1' }, { id: 'L2' }],
  };
  if (engine.bake !== false) {
    sm['bakeLayerDither'] = async (id: string) => {
      calls.push(id);
      if (engine.result === false) return false;
      const cfg = engineCfg.get(id);
      if (cfg) engineCfg.set(id, { ...cfg, enabled: false });
      return true;
    };
  }
  const host: LayerEffectsHost = {
    shapeManager: () => sm as never, markStateDirty: () => { dirty++; }, penColor: () => '#000000', ensureAnimationMode: () => {},
  };
  const fx = new LayerEffectsService();
  fx.bind(host);
  return { fx, engineCfg, calls, dirty: () => dirty };
}

describe('Layer Dither: Bake', () => {
  it('bakes the layer and turns the panel dither off, keeping the settings', async () => {
    const w = make();
    w.fx.onLayerDitherEnabledChange('L1', true);
    w.fx.onLayerDitherStrengthChange('L1', 60);
    expect(w.fx.canBakeLayerDither()).toBe(true);
    const before = w.dirty();
    await w.fx.onLayerDitherBake('L1');
    expect(w.calls).toEqual(['L1']);
    expect(w.fx.getLayerDitherEnabled('L1')).toBe(false);
    expect(w.fx.getLayerDitherConfig('L1').strength).toBeCloseTo(0.6);
    expect(w.dirty()).toBeGreaterThan(before);
    expect(w.fx.bakingLayerDither).toBe(false);
  });

  it('an engine without bakeLayerDither: unavailable, and a click does nothing', async () => {
    const w = make({ bake: false });
    w.fx.onLayerDitherEnabledChange('L1', true);
    expect(w.fx.canBakeLayerDither()).toBe(false);
    await w.fx.onLayerDitherBake('L1');
    expect(w.fx.getLayerDitherEnabled('L1')).toBe(true);
  });

  it('a bake the engine refused leaves the dither on', async () => {
    const w = make({ result: false });
    w.fx.onLayerDitherEnabledChange('L1', true);
    await w.fx.onLayerDitherBake('L1');
    expect(w.calls).toEqual(['L1']);
    expect(w.fx.getLayerDitherEnabled('L1')).toBe(true);
  });

  it('undo / redo of the bake: the panel follows the engine on / off state', async () => {
    const w = make();
    w.fx.onLayerDitherEnabledChange('L1', true);
    await w.fx.onLayerDitherBake('L1');
    // the engine's raster undo of the bake entry turned the dither back on
    w.engineCfg.set('L1', { ...w.engineCfg.get('L1')!, enabled: true });
    w.fx.syncLayerDitherEnabledFromEngine();
    expect(w.fx.getLayerDitherEnabled('L1')).toBe(true);
    // redo turns it off again
    w.engineCfg.set('L1', { ...w.engineCfg.get('L1')!, enabled: false });
    w.fx.syncLayerDitherEnabledFromEngine();
    expect(w.fx.getLayerDitherEnabled('L1')).toBe(false);
    // a layer whose dither was switched off from the panel (engine config cleared) is left alone
    expect(w.engineCfg.get('L2')).toBeUndefined();
    expect(w.fx.getLayerDitherEnabled('L2')).toBe(false);
  });
});
