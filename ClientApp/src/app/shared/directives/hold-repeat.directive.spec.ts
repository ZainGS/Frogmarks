import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HoldRepeatDirective } from './hold-repeat.directive';

@Component({
  template: `
    <button *ngIf="shown" type="button" class="btn" [disabled]="disabled" (fmHoldRepeat)="onStep()">+</button>
    <div class="div" tabindex="0" (fmHoldRepeat)="onStep()">-</div>`,
})
class HostComponent {
  shown = true;
  disabled = false;
  steps = 0;
  /** Disable the button once this many steps have run (0 = never). */
  disableAfter = 0;
  onStep(): void {
    this.steps++;
    if (this.disableAfter && this.steps >= this.disableAfter) this.disabled = true;
  }
}

describe('HoldRepeatDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  const btn = () => fixture.nativeElement.querySelector('.btn') as HTMLButtonElement;
  const div = () => fixture.nativeElement.querySelector('.div') as HTMLDivElement;
  const pe = (type: string, extra: Partial<PointerEventInit> = {}) =>
    new PointerEvent(type, { pointerId: 3, pointerType: 'touch', button: 0, bubbles: true, ...extra });
  const click = (el: HTMLElement, detail: number) => el.dispatchEvent(new MouseEvent('click', { detail, bubbles: true }));
  /** A full tap: down, up, then the click the browser sends after it. */
  const tap = (el: HTMLElement, extra: Partial<PointerEventInit> = {}) => {
    el.dispatchEvent(pe('pointerdown', extra));
    el.dispatchEvent(pe('pointerup', extra));
    click(el, 1);
  };

  beforeEach(() => {
    jasmine.clock().install();
    TestBed.configureTestingModule({ declarations: [HostComponent], imports: [HoldRepeatDirective] });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    jasmine.clock().uninstall();
  });

  it('a tap (touch, pen or mouse) is exactly one step, the follow-up click adds none', () => {
    tap(btn());
    expect(host.steps).toBe(1);
    tap(btn(), { pointerType: 'pen' });
    tap(btn(), { pointerType: 'mouse' });
    expect(host.steps).toBe(3);
    jasmine.clock().tick(2000);
    expect(host.steps).toBe(3);
  });

  it('a mouse right / middle press does nothing', () => {
    btn().dispatchEvent(pe('pointerdown', { pointerType: 'mouse', button: 2 }));
    jasmine.clock().tick(1000);
    expect(host.steps).toBe(0);
  });

  it('holding repeats after the delay, accelerates, and stops on release', () => {
    btn().dispatchEvent(pe('pointerdown'));
    expect(host.steps).toBe(1);
    jasmine.clock().tick(399);
    expect(host.steps).toBe(1);   // still inside the initial delay
    jasmine.clock().tick(1);
    expect(host.steps).toBe(2);   // first repeat at 400 ms
    jasmine.clock().tick(79);
    expect(host.steps).toBe(2);
    jasmine.clock().tick(1);
    expect(host.steps).toBe(3);   // the first interval is 80 ms

    // Fully accelerated past 1.5 s: 30 ms apart.
    jasmine.clock().tick(1500);
    const s = host.steps;
    jasmine.clock().tick(300);
    expect(host.steps - s).toBe(10);
    // More steps over the hold than a constant 80 ms would give (press + 1 per 80 ms after 400 ms).
    expect(host.steps).toBeGreaterThan(1 + Math.floor((2280 - 400) / 80) + 1);

    btn().dispatchEvent(pe('pointerup'));
    click(btn(), 1);
    const after = host.steps;
    jasmine.clock().tick(2000);
    expect(host.steps).toBe(after);
  });

  it('the interval eases from 80 ms down to 30 ms by 1.5 s', () => {
    const dir = fixture.debugElement.query(d => d.nativeElement === btn()).injector.get(HoldRepeatDirective);
    expect(dir.intervalAt(400)).toBe(80);
    expect(dir.intervalAt(900)).toBeLessThan(80);
    expect(dir.intervalAt(900)).toBeGreaterThan(30);
    expect(dir.intervalAt(1500)).toBe(30);
    expect(dir.intervalAt(5000)).toBe(30);
  });

  for (const end of ['pointercancel', 'pointerleave', 'lostpointercapture']) {
    it(`${end} stops the hold`, () => {
      btn().dispatchEvent(pe('pointerdown'));
      btn().dispatchEvent(pe(end));
      jasmine.clock().tick(2000);
      expect(host.steps).toBe(1);
    });
  }

  it('another pointer ending does not stop the hold', () => {
    btn().dispatchEvent(pe('pointerdown'));
    btn().dispatchEvent(pe('pointerup', { pointerId: 99 }));
    jasmine.clock().tick(400);
    expect(host.steps).toBe(2);
  });

  it('blur (element or window) stops the hold', () => {
    btn().dispatchEvent(pe('pointerdown'));
    btn().dispatchEvent(new FocusEvent('blur'));
    jasmine.clock().tick(1000);
    expect(host.steps).toBe(1);
    btn().dispatchEvent(pe('pointerdown'));
    window.dispatchEvent(new Event('blur'));
    jasmine.clock().tick(1000);
    expect(host.steps).toBe(2);
  });

  it('a disabled button does nothing; becoming disabled mid-hold stops it', () => {
    host.disabled = true;
    fixture.detectChanges();
    tap(btn());
    click(btn(), 0);
    jasmine.clock().tick(1000);
    expect(host.steps).toBe(0);

    host.disabled = false;
    host.disableAfter = 3;
    fixture.detectChanges();
    btn().dispatchEvent(pe('pointerdown'));
    jasmine.clock().tick(400 + 80);   // steps 2 and 3; the 3rd disables
    expect(host.steps).toBe(3);
    fixture.detectChanges();
    jasmine.clock().tick(2000);
    expect(host.steps).toBe(3);
  });

  it('aria-disabled hosts do nothing', () => {
    div().setAttribute('aria-disabled', 'true');
    tap(div());
    div().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(host.steps).toBe(0);
  });

  it('destroying the host mid-hold clears the timer', () => {
    btn().dispatchEvent(pe('pointerdown'));
    host.shown = false;
    fixture.detectChanges();
    jasmine.clock().tick(2000);
    expect(host.steps).toBe(1);
  });

  it('keyboard: a button\'s Enter / Space click is one step each; other hosts get Enter / Space themselves', () => {
    click(btn(), 0);   // what Enter / Space on a focused button produces
    expect(host.steps).toBe(1);
    // A button relies on its own click: a keydown alone does not step.
    btn().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(host.steps).toBe(1);

    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    div().dispatchEvent(enter);
    expect(host.steps).toBe(2);
    expect(enter.defaultPrevented).toBeTrue();
    div().dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    div().dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(host.steps).toBe(3);
    jasmine.clock().tick(2000);
    expect(host.steps).toBe(3);
  });

  it('a keyboard click after a pointer press that never clicked still steps', () => {
    btn().dispatchEvent(pe('pointerdown'));
    btn().dispatchEvent(pe('pointercancel'));   // e.g. released elsewhere without capture: no click came
    click(btn(), 0);
    expect(host.steps).toBe(2);
  });
});
