import { BalloonOptionsComponent } from './balloon-options.component';
import { createEffectEntry } from 'app/illustrate/models/text-effect.model';

/** Balloon ▶ Text Effects preview (UI dead-controls audit 2026-10-09): it used to create a GPU texture per frame that
 *  nothing showed or freed. Now it draws into the panel's preview canvas through the engine (which frees its
 *  textures), and never calls the leaking createEffectedText. */
describe('BalloonOptionsComponent text-effect preview', () => {
  const zone = { run: (f: () => unknown) => f(), runOutsideAngular: (f: () => unknown) => f() };

  function rig(withPreview = true) {
    const comp = new BalloonOptionsComponent(zone as never);
    const canvas = document.createElement('canvas');
    comp.fxPreviewCanvas = { nativeElement: canvas } as never;
    let resolveFrame: ((ok: boolean) => void) | null = null;
    const sm: Record<string, jasmine.Spy> = {
      createEffectedText: jasmine.createSpy('createEffectedText').and.returnValue({ texture: { destroy() {} }, width: 1, height: 1 }),
    };
    if (withPreview) {
      sm['previewEffectedTextToCanvas'] = jasmine.createSpy('preview').and.callFake(() => new Promise<boolean>(r => { resolveFrame = r; }));
    }
    comp.shapeManager = sm as never;
    return { comp, sm, canvas, finish: async (ok = true) => { resolveFrame?.(ok); resolveFrame = null; await new Promise(r => setTimeout(r, 0)); } };
  }

  it('draws into the preview canvas and shows it once a frame lands', async () => {
    const { comp, sm, canvas, finish } = rig();
    comp.textEffectChain = [createEffectEntry('glow')];
    expect(comp.textEffectPreviewShown).toBeFalse();
    comp.previewTextEffect();
    expect(sm['previewEffectedTextToCanvas']).toHaveBeenCalledTimes(1);
    const [c, , chain] = sm['previewEffectedTextToCanvas'].calls.mostRecent().args;
    expect(c).toBe(canvas);
    expect(chain[0].params.color).toEqual([1, 1, 1, 1]);   // the glow colour the engine reads
    await finish(true);
    expect(comp.textEffectPreviewShown).toBeTrue();
    expect(sm['createEffectedText']).not.toHaveBeenCalled();
  });

  it('keeps one render in flight; a call while busy re-renders once afterwards', async () => {
    const { comp, sm, finish } = rig();
    comp.previewTextEffect();
    comp.previewTextEffect();
    comp.previewTextEffect();
    expect(sm['previewEffectedTextToCanvas']).toHaveBeenCalledTimes(1);
    await finish(true);
    expect(sm['previewEffectedTextToCanvas']).toHaveBeenCalledTimes(2);
    await finish(true);
    expect(sm['previewEffectedTextToCanvas']).toHaveBeenCalledTimes(2);
  });

  it('an engine without the preview call makes no texture at all', () => {
    const { comp, sm } = rig(false);
    comp.previewTextEffect();
    expect(sm['createEffectedText']).not.toHaveBeenCalled();
  });

  it('a glow swatch edit writes the key the engine reads', () => {
    const { comp } = rig();
    const entry = createEffectEntry('glow');
    entry.params['glowColor'] = [0, 1, 0, 1];
    delete entry.params['color'];
    comp.textEffectChain = [entry];
    expect(comp.glowColorOf(entry)).toEqual([0, 1, 0, 1]);
    comp.onTextEffectParamChange(entry, 'color', [1, 0, 0, 1]);
    expect(entry.params['color']).toEqual([1, 0, 0, 1]);
    expect(entry.params['glowColor']).toBeUndefined();
    expect(comp._buildEffectChain()[0].params['color']).toEqual([1, 0, 0, 1]);
  });
});
