import { NgZone } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import ShapeManager from '@zaings/salsa/shape-manager';
import { RasterAutoSaveService } from './raster-autosave.service';
import { RasterAnimationService } from './raster-animation.service';

/** The app-wide (root) services outlive every editor instance: switching documents must leave nothing of the previous
 *  document in them. The engine is a stub here (no WebGPU in unit tests). */
function fakeEngine() {
  return {
    isAutoSaveAvailable: () => true,
    enableAutoSave: jasmine.createSpy('enableAutoSave'),
    disableAutoSave: jasmine.createSpy('disableAutoSave'),
    onSaveEvent: () => undefined,
    saveDocument: jasmine.createSpy('saveDocument').and.resolveTo(true),
    notifyStrokeEnd: jasmine.createSpy('notifyStrokeEnd'),
    setAnimationEnabled: jasmine.createSpy('setAnimationEnabled'),
    setFrameCount: () => undefined, setFps: () => undefined, setLoopMode: () => undefined, setPlayRange: () => undefined,
    setOnionSkin: () => undefined, stopPlayback: jasmine.createSpy('stopPlayback'), togglePlayPause: () => undefined,
    onAnimationEvent: () => () => undefined,
    getRasterLayers: () => [{ id: 'L1', name: 'Old layer' }], isLayerAnimated: () => false, getCels: () => [],
  };
}

describe('Root services across a document switch', () => {
  let engine: ReturnType<typeof fakeEngine>;
  const zone = new NgZone({ enableLongStackTrace: false });

  beforeEach(() => {
    engine = fakeEngine();
    spyOn(ShapeManager, 'getInstance').and.returnValue(engine as unknown as ShapeManager);
  });
  afterEach(() => jasmine.clock().uninstall());

  describe('RasterAutoSaveService.disable (the editor leaving a document)', () => {
    it('unbinds the document: a pending stroke save and an explicit saveNow can no longer write into it', async () => {
      jasmine.clock().install();
      const svc = new RasterAutoSaveService(zone);
      svc.enable('local-A', 'A', { intervalMs: 0, strokeDebounceMs: 1500 });
      expect(svc.docId).toBe('local-A');
      svc.notifyStrokeEnd();                       // the 1500 ms debounce is pending…
      svc.disable();                               // …when the user opens another document
      jasmine.clock().tick(5000);
      expect(engine.saveDocument).not.toHaveBeenCalled();
      expect(engine.disableAutoSave).toHaveBeenCalled();
      expect(svc.docId).toBe('');
      jasmine.clock().uninstall();
      expect(await svc.saveNow()).toBeFalse();
      expect(engine.saveDocument).not.toHaveBeenCalled();
    });

    it('enable() binds the next document', () => {
      const svc = new RasterAutoSaveService(zone);
      svc.enable('local-A', 'A', { intervalMs: 0 });
      svc.disable();
      svc.enable('local-B', 'B', { intervalMs: 0 });
      expect(svc.docId).toBe('local-B');
      expect(engine.enableAutoSave.calls.mostRecent().args[0]).toBe('local-B');
    });
  });

  describe('RasterAnimationService.resetForNewDocument', () => {
    it("drops the previous document's animation mode, timeline settings and layers (the save payload reads them)", async () => {
      const svc = new RasterAnimationService(zone);
      svc.setAnimationEnabled(true);
      svc.setFrameCount(48);
      svc.setFps(30);
      svc.setLoopMode('ping-pong');
      svc.setPlayRange(5, 40);
      svc.togglePlayPause();
      expect((await firstValueFrom(svc.timelineLayers$)).length).toBe(1);

      svc.resetForNewDocument();

      expect(svc.isAnimationEnabled()).toBeFalse();
      expect(engine.stopPlayback).toHaveBeenCalled();
      expect(await firstValueFrom(svc.isPlaying$)).toBeFalse();
      expect(await firstValueFrom(svc.frameCount$)).toBe(24);
      expect(await firstValueFrom(svc.fps$)).toBe(12);
      expect(await firstValueFrom(svc.loopMode$)).toBe('loop');
      expect(await firstValueFrom(svc.playRangeStart$)).toBe(1);
      expect(await firstValueFrom(svc.playRangeEnd$)).toBe(24);
      expect((await firstValueFrom(svc.onionSkin$)).enabled).toBeFalse();
      expect(await firstValueFrom(svc.timelineLayers$)).toEqual([]);
    });
  });
});
