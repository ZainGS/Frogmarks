import { NgZone } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import ShapeManager from '@zaings/salsa/shape-manager';
import { RasterAnimationService } from './raster-animation.service';

/** Playback performance contract: the engine's rAF playback clock must start OUTSIDE the Angular zone (a rAF requested
 *  inside it = a full app change detection per display frame), and hiding the timeline must stop it. Engine stubbed. */
function fakeEngine() {
  let playing = false;
  const engine = {
    startedInZone: null as boolean | null,
    togglePlayPause: () => { playing = !playing; if (playing) engine.startedInZone = NgZone.isInAngularZone(); },
    pause: jasmine.createSpy('pause').and.callFake(() => { playing = false; }),
    getTimelineState: () => ({ playbackState: playing ? 'playing' : 'paused' }),
    setAnimationEnabled: jasmine.createSpy('setAnimationEnabled'),
    onAnimationEvent: () => () => undefined,
    getRasterLayers: () => [], isLayerAnimated: () => false, getCels: () => [],
  };
  return engine;
}

describe('RasterAnimationService playback', () => {
  let engine: ReturnType<typeof fakeEngine>;
  let zone: NgZone;

  beforeEach(() => {
    engine = fakeEngine();
    zone = new NgZone({ enableLongStackTrace: false });
    spyOn(ShapeManager, 'getInstance').and.returnValue(engine as unknown as ShapeManager);
  });

  it('starts the playback clock outside the Angular zone, even when Play is clicked inside it', async () => {
    const svc = new RasterAnimationService(zone);
    zone.run(() => svc.togglePlayPause());   // the Play button / Space handler runs in the zone
    expect(engine.startedInZone).toBeFalse();
    expect(await firstValueFrom(svc.isPlaying$)).toBeTrue();
    zone.run(() => svc.togglePlayPause());
    expect(await firstValueFrom(svc.isPlaying$)).toBeFalse();
  });

  it('turning animation off while playing pauses playback first', async () => {
    const svc = new RasterAnimationService(zone);
    svc.setAnimationEnabled(true);
    svc.togglePlayPause();
    svc.setAnimationEnabled(false);
    expect(engine.pause).toHaveBeenCalledTimes(1);
    expect(engine.getTimelineState().playbackState).toBe('paused');
    expect(await firstValueFrom(svc.isPlaying$)).toBeFalse();
  });

  it('pausePlayback is a no-op on the engine when nothing plays', () => {
    const svc = new RasterAnimationService(zone);
    svc.pausePlayback();
    expect(engine.pause).not.toHaveBeenCalled();
  });
});
