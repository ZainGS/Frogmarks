import { TestBed } from '@angular/core/testing';
import { PlayTouchControlsComponent } from './play-touch-controls.component';

/** Play on touch (UI review 2026-10-07 §3 #21): Stop is a ≥ 44 px button on its own, away from Sneak / Run; Sneak /
 *  Run are ≥ 44 px; the hint fades (CSS animation). */
describe('PlayTouchControlsComponent layout', () => {
  function create() {
    const sm = {
      getPlayerRunning3D: () => false, getPlayerSneaking3D: () => false,
      onPlayerRunChanged3D: { subscribe: () => ({ unsubscribe() { /* */ } }) },
      onPlayerSneakChanged3D: { subscribe: () => ({ unsubscribe() { /* */ } }) },
      setPlayInput3D: jasmine.createSpy('setPlayInput3D'),
    };
    TestBed.configureTestingModule({ declarations: [PlayTouchControlsComponent] });
    const fixture = TestBed.createComponent(PlayTouchControlsComponent);
    fixture.componentInstance.shapeManager = sm as never;
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement, cmp: fixture.componentInstance };
  }

  it('Stop sits outside the Sneak / Run / Use / Jump cluster, at least 44 px, and emits stop', () => {
    const { el, cmp, fixture } = create();
    const stop = el.querySelector<HTMLButtonElement>('.ptc-stop')!;
    expect(stop).toBeTruthy();
    expect(stop.closest('.ptc-buttons')).toBeNull();
    const r = stop.getBoundingClientRect();
    expect(r.width).toBeGreaterThanOrEqual(44);
    expect(r.height).toBeGreaterThanOrEqual(44);
    const spy = spyOn(cmp.stop, 'emit');
    stop.click();
    expect(spy).toHaveBeenCalled();
    fixture.destroy();
  });

  it('Sneak / Run are at least 44 px tall; the hint fades out', () => {
    const { el, fixture } = create();
    const small = Array.from(el.querySelectorAll<HTMLElement>('.ptc-btn-sm'));
    expect(small.map(b => b.textContent?.trim())).toEqual(['Sneak', 'Run']);
    for (const b of small) expect(b.getBoundingClientRect().height).toBeGreaterThanOrEqual(44);
    const hint = el.querySelector<HTMLElement>('.ptc-hint')!;
    expect(getComputedStyle(hint).animationName).toContain('ptc-hint-fade');
    fixture.destroy();
  });
});
