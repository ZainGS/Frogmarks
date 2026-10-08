import { TestBed } from '@angular/core/testing';
import { OverlayManagerService } from '../../../shared/services/overlay/overlay-manager.service';
import { SidePanelService } from '../../services/side-panel.service';
import { ModeHeaderBarComponent } from './mode-header-bar/mode-header-bar.component';
import { ModeOpPillComponent } from './mode-op-pill/mode-op-pill.component';
import { MODE_PROPS_COLLAPSED_KEY, ModePropsPanelComponent } from './mode-props-panel/mode-props-panel.component';
import { ModeRadialMenuComponent } from './mode-radial-menu/mode-radial-menu.component';
import { ModeToolStripComponent, modeToolRows } from './mode-tool-strip/mode-tool-strip.component';
import { MODE_CHROME_VARS, ModeOpParam, ModeTool } from './mode-chrome.types';
import { releaseRootVar, rootVarValue, setRootVar } from './root-css-vars';
import { HoldRepeatDirective } from '../../../shared/directives/hold-repeat.directive';

const ALL = [ModeHeaderBarComponent, ModeToolStripComponent, ModeOpPillComponent, ModeRadialMenuComponent, ModePropsPanelComponent];

describe('mode chrome', () => {
  beforeEach(() => TestBed.configureTestingModule({ declarations: ALL, imports: [HoldRepeatDirective] }));

  describe('root CSS vars', () => {
    it('the newest owner wins; releasing restores the previous value, then removes it', () => {
      const a = {}, b = {};
      setRootVar('--fm-test-var', a, '1px');
      setRootVar('--fm-test-var', b, '2px');
      expect(rootVarValue('--fm-test-var')).toBe('2px');
      releaseRootVar('--fm-test-var', b);
      expect(rootVarValue('--fm-test-var')).toBe('1px');
      releaseRootVar('--fm-test-var', a);
      expect(rootVarValue('--fm-test-var')).toBe('');
    });
  });

  describe('header bar', () => {
    function create() {
      const fixture = TestBed.createComponent(ModeHeaderBarComponent);
      const r = fixture.componentRef;
      r.setInput('title', 'Edit Mesh');
      r.setInput('subtitle', 'Cube');
      r.setInput('segments', [{ id: 'vertex', label: 'Vertex', key: '1' }, { id: 'edge', label: 'Edge', key: '2' }, { id: 'face', label: 'Face', key: '3' }]);
      r.setInput('activeSegment', 'vertex');
      r.setInput('multiLatch', false);
      r.setInput('menuItems', [{ id: 'bg', label: 'Gradient background', checked: true }, { id: 'x', label: 'Off', disabled: true, separatorBefore: true }]);
      fixture.detectChanges();
      return { fixture, el: fixture.nativeElement as HTMLElement, cmp: fixture.componentInstance };
    }

    it('publishes --fm-modebar-h while mounted and never leaks the title as a host tooltip', () => {
      const { fixture, el } = create();
      expect(rootVarValue(MODE_CHROME_VARS.modebarH)).toMatch(/^\d+px$/);
      expect(el.getAttribute('title')).toBeNull();
      fixture.destroy();
      expect(rootVarValue(MODE_CHROME_VARS.modebarH)).toBe('');
    });

    it('segments, Multi, Done emit; the picked segment does not re-emit', () => {
      const { fixture, el, cmp } = create();
      const seg = jasmine.createSpy('seg'), multi = jasmine.createSpy('multi'), done = jasmine.createSpy('done');
      cmp.segmentChange.subscribe(seg); cmp.multiLatchChange.subscribe(multi); cmp.done.subscribe(done);
      const btns = el.querySelectorAll<HTMLButtonElement>('.mhb-seg-btn');
      btns[0].click();
      btns[2].click();
      expect(seg.calls.allArgs()).toEqual([['face']]);
      el.querySelector<HTMLButtonElement>('.mhb-multi')!.click();
      expect(multi).toHaveBeenCalledWith(true);
      el.querySelector<HTMLButtonElement>('.mhb-done')!.click();
      expect(done).toHaveBeenCalled();
      expect(btns[0].getAttribute('title')).toBe('Vertex (1)');
      fixture.destroy();
    });

    it('Multi is hidden when multiLatch is null', () => {
      const { fixture, el } = create();
      fixture.componentRef.setInput('multiLatch', null);
      fixture.detectChanges();
      expect(el.querySelector('.mhb-multi')).toBeNull();
      fixture.destroy();
    });

    it('the ⋯ menu opens, picks (disabled rows do nothing) and closes on Esc / outside tap', () => {
      const { fixture, el, cmp } = create();
      const overlays = TestBed.inject(OverlayManagerService);
      const act = jasmine.createSpy('act');
      cmp.menuAction.subscribe(act);
      const more = el.querySelector<HTMLButtonElement>('.mhb-more')!;
      more.click(); fixture.detectChanges();
      const items = el.querySelectorAll<HTMLButtonElement>('.mhb-menu-item');
      expect(items.length).toBe(2);
      expect(items[0].getAttribute('aria-checked')).toBe('true');
      expect(el.querySelectorAll('.mhb-menu-sep').length).toBe(1);
      cmp.pickMenu({ id: 'x', label: 'Off', disabled: true });
      expect(act).not.toHaveBeenCalled();
      items[0].click(); fixture.detectChanges();
      expect(act).toHaveBeenCalledWith('bg');
      expect(cmp.menuOpen).toBeFalse();

      more.click(); fixture.detectChanges();
      expect(overlays.handleEscape()).toBeTrue();
      expect(cmp.menuOpen).toBeFalse();

      more.click(); fixture.detectChanges();
      expect(overlays.handlePointerDown(document.body)).toBeTrue();
      expect(cmp.menuOpen).toBeFalse();
      more.click();
      expect(overlays.handlePointerDown(more)).toBeFalse();   // its own button is inside
      fixture.destroy();
    });
  });

  describe('tool strip', () => {
    const tools: ModeTool[] = [
      { id: 'select', label: 'Select', icon: 'svg:select', key: 'W', hint: 'Tap to select', group: 'a' },
      { id: 'move', label: 'Move', icon: '↔', key: 'G', hint: 'Drag to move', group: 'a' },
      { id: 'extrude', label: 'Extrude', icon: 'svg:extrude', key: 'E', hint: 'Drag the arrow', group: 'b' },
      { id: 'knife', label: 'Knife', icon: 'K', hint: 'Tap points', group: 'b', disabled: true },
    ];

    it('dividers where the group changes', () => {
      expect(modeToolRows(tools).map(r => r.sepBefore)).toEqual([false, false, true, false]);
      expect(modeToolRows(tools)[0].paths?.length).toBeGreaterThan(0);
      expect(modeToolRows(tools)[1].paths).toBeNull();
    });

    it('renders one active tool, its hint, and emits toolChange (not for the active / disabled one)', () => {
      const fixture = TestBed.createComponent(ModeToolStripComponent);
      fixture.componentRef.setInput('tools', tools);
      fixture.componentRef.setInput('activeTool', 'move');
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      expect(rootVarValue(MODE_CHROME_VARS.stripW)).toBe('70px');
      const on = el.querySelectorAll('.mts-tool.on');
      expect(on.length).toBe(1);
      expect(on[0].getAttribute('data-id')).toBe('move');
      expect(el.querySelectorAll('.mts-sep').length).toBe(1);
      expect(el.querySelector('.mode-tool-hint')!.textContent).toContain('Drag to move');
      const spy = jasmine.createSpy('tool');
      fixture.componentInstance.toolChange.subscribe(spy);
      el.querySelector<HTMLButtonElement>('[data-id="move"]')!.click();
      el.querySelector<HTMLButtonElement>('[data-id="knife"]')!.click();
      el.querySelector<HTMLButtonElement>('[data-id="extrude"]')!.click();
      expect(spy.calls.allArgs()).toEqual([['extrude']]);
      fixture.destroy();
      expect(rootVarValue(MODE_CHROME_VARS.stripW)).toBe('');
    });
  });

  describe('op pill', () => {
    const params = (): ModeOpParam[] => [
      { id: 'amount', label: 'Amount', kind: 'number', value: 0.5, min: 0, max: 2, step: 0.01 },
      { id: 'segments', label: 'Segments', kind: 'int', value: 2, min: 1, max: 8 },
      { id: 'mirror', label: 'Mirror', kind: 'axis', value: ['x'] },
      { id: 'even', label: 'Even', kind: 'toggle', value: false },
      { id: 'reset', label: 'Reset', kind: 'button', value: null },
    ];
    function create() {
      const fixture = TestBed.createComponent(ModeOpPillComponent);
      fixture.componentRef.setInput('title', 'Bevel');
      fixture.componentRef.setInput('params', params());
      fixture.detectChanges();
      const cmp = fixture.componentInstance;
      const changes: { id: string; value: unknown }[] = [];
      cmp.paramChange.subscribe(c => changes.push(c));
      return { fixture, el: fixture.nativeElement as HTMLElement, cmp, changes };
    }
    const pe = (type: string, x: number, extra: Partial<PointerEventInit> = {}) =>
      new PointerEvent(type, { clientX: x, clientY: 10, pointerId: 7, button: 0, bubbles: true, ...extra });

    it('scrubbing the label emits clamped values; a tap on it starts typing', () => {
      const { fixture, el, cmp, changes } = create();
      const p = cmp.params[0];
      cmp.scrubDown(pe('pointerdown', 100), p);
      cmp.scrubMove(pe('pointermove', 102), p);   // under the start threshold
      expect(changes.length).toBe(0);
      cmp.scrubMove(pe('pointermove', 120), p);   // +20 px = +10 steps
      expect(changes.pop()).toEqual({ id: 'amount', value: 0.6 });
      cmp.scrubMove(pe('pointermove', 2000), p);
      expect(changes.pop()).toEqual({ id: 'amount', value: 2 });
      cmp.scrubUp(pe('pointerup', 2000), p);
      expect(cmp.editingId).toBeNull();
      cmp.scrubDown(pe('pointerdown', 50), p);
      cmp.scrubUp(pe('pointerup', 51), p);
      expect(cmp.editingId).toBe('amount');
      fixture.detectChanges();
      expect(el.querySelector('.mop-input')).toBeTruthy();
      fixture.destroy();
    });

    it('− / + step once per tap and auto-repeat while held (no extra step from the click)', () => {
      jasmine.clock().install();
      try {
        const { fixture, el, changes } = create();
        const [less, more] = Array.from(el.querySelectorAll<HTMLButtonElement>('[data-id="segments"] .mop-step'));
        more.dispatchEvent(pe('pointerdown', 0, { pointerType: 'touch' }));
        more.dispatchEvent(pe('pointerup', 0, { pointerType: 'touch' }));
        more.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true }));
        expect(changes).toEqual([{ id: 'segments', value: 3 }]);
        changes.length = 0;
        less.dispatchEvent(pe('pointerdown', 0, { pointerType: 'pen' }));
        jasmine.clock().tick(400 + 80);
        less.dispatchEvent(pe('pointerup', 0, { pointerType: 'pen' }));
        less.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true }));
        expect(changes.length).toBe(3);   // press + 2 repeats (the parent applies the value, so each step is from 2)
        fixture.destroy();
      } finally {
        jasmine.clock().uninstall();
      }
    });

    it('typing: Enter commits (clamped), Esc keeps the old value, bad text is ignored — none reach the editor', () => {
      const { fixture, el, cmp, changes } = create();
      const outer = jasmine.createSpy('outer');
      document.addEventListener('keydown', outer);
      const p = cmp.params[1];
      cmp.startEdit(p); fixture.detectChanges();
      let input = el.querySelector<HTMLInputElement>('.mop-input')!;
      input.value = '20';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(changes.pop()).toEqual({ id: 'segments', value: 8 });
      fixture.detectChanges();
      cmp.startEdit(p); fixture.detectChanges();
      input = el.querySelector<HTMLInputElement>('.mop-input')!;
      input.value = '5';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(changes.length).toBe(0);
      expect(cmp.editingId).toBeNull();
      cmp.startEdit(p);
      cmp.commitEdit(p, 'abc');
      expect(changes.length).toBe(0);
      expect(outer).not.toHaveBeenCalled();
      document.removeEventListener('keydown', outer);
      fixture.destroy();
    });

    it('Enter applies / Esc cancels only from inside the pill', () => {
      const { fixture, el, cmp } = create();
      const apply = jasmine.createSpy('apply'), cancel = jasmine.createSpy('cancel');
      cmp.apply.subscribe(apply); cmp.cancel.subscribe(cancel);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      expect(apply).not.toHaveBeenCalled();
      const chip = el.querySelector<HTMLButtonElement>('.mop-chip')!;
      chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      expect(apply).toHaveBeenCalledTimes(1);
      chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      expect(cancel).toHaveBeenCalledTimes(1);
      el.querySelector<HTMLButtonElement>('.mop-cancel')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      expect(cancel).toHaveBeenCalledTimes(2);
      expect(apply).toHaveBeenCalledTimes(1);
      fixture.destroy();
    });

    it('axis chips toggle the array, toggle flips, button emits action, − / + step', () => {
      const { fixture, el, cmp, changes } = create();
      const act = jasmine.createSpy('act');
      cmp.action.subscribe(act);
      const chips = el.querySelectorAll<HTMLButtonElement>('[data-id="mirror"] .mop-chip');
      expect(Array.from(chips).map(c => c.textContent!.trim())).toEqual(['X', 'Y', 'Z']);
      chips[2].click();
      expect(changes.pop()).toEqual({ id: 'mirror', value: ['x', 'z'] });
      el.querySelector<HTMLButtonElement>('[data-id="even"]')!.click();
      expect(changes.pop()).toEqual({ id: 'even', value: true });
      el.querySelector<HTMLButtonElement>('[data-id="reset"]')!.click();
      expect(act).toHaveBeenCalledWith('reset');
      cmp.step(cmp.params[1], 1);
      expect(changes.pop()).toEqual({ id: 'segments', value: 3 });
      fixture.destroy();
    });
  });

  describe('radial menu', () => {
    function create() {
      const fixture = TestBed.createComponent(ModeRadialMenuComponent);
      const r = fixture.componentRef;
      r.setInput('items', [
        { id: 'extrude', label: 'Extrude', icon: 'svg:extrude' }, { id: 'delete', label: 'Delete', danger: true },
        { id: 'loop', label: 'Loop Cut' }, { id: 'merge', label: 'Merge', disabled: true },
      ]);
      r.setInput('x', 400); r.setInput('y', 300);
      r.setInput('open', true);
      fixture.detectChanges();
      const cmp = fixture.componentInstance;
      const picks: string[] = []; let closed = 0;
      cmp.pick.subscribe(id => { picks.push(id); r.setInput('open', false); });
      cmp.closed.subscribe(() => { closed++; r.setInput('open', false); });
      return { fixture, el: fixture.nativeElement as HTMLElement, cmp, picks, closed: () => closed };
    }

    it('renders the items on a ring with 52 px targets and a centre ✕', () => {
      const { fixture, el, cmp } = create();
      const items = el.querySelectorAll<HTMLButtonElement>('.mrm-item');
      expect(items.length).toBe(4);
      for (const b of Array.from(items)) expect(b.getBoundingClientRect().height).toBeGreaterThanOrEqual(52);
      expect(cmp.layout.items[0].y).toBeLessThan(cmp.layout.cy);   // first item on top
      expect(el.querySelector('.mrm-center')).toBeTruthy();
      fixture.destroy();
    });

    it('drag-and-release picks the item in that direction; lifting in place does not', () => {
      const a = create();
      a.cmp.handleGestureMove(a.cmp.layout.cx + 5, a.cmp.layout.cy - 3);
      a.cmp.handleGestureUp(a.cmp.layout.cx + 5, a.cmp.layout.cy - 3);
      expect(a.picks).toEqual([]);
      expect(a.cmp.visible).toBeTrue();
      a.fixture.destroy();

      const b = create();
      b.cmp.handleGestureMove(b.cmp.layout.cx + 90, b.cmp.layout.cy);
      expect(b.cmp.hoverIndex).toBe(1);
      b.cmp.handleGestureUp(b.cmp.layout.cx + 90, b.cmp.layout.cy);
      expect(b.picks).toEqual(['delete']);
      b.fixture.destroy();
    });

    /** The mode sets open = false on pick / closed (create() does); open it again. */
    function reopen(fixture: { detectChanges(): void; componentRef: { setInput(n: string, v: unknown): void } }) {
      fixture.detectChanges();
      fixture.componentRef.setInput('open', true);
      fixture.detectChanges();
    }

    it('never picks a disabled item by direction; tap-to-pick works after the press ends', () => {
      const { fixture, el, cmp, picks } = create();
      cmp.handleGestureUp(cmp.layout.cx - 90, cmp.layout.cy);   // toward the disabled "Merge"
      expect(picks.length).toBe(1);
      expect(picks).not.toContain('merge');
      reopen(fixture);
      expect(cmp.visible).toBeTrue();
      el.querySelector('.mode-radial')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));   // a new tap
      el.querySelector<HTMLButtonElement>('[data-id="loop"]')!.click();
      expect(picks[picks.length - 1]).toBe('loop');
      fixture.destroy();
    });

    it('the opening press lifting on the ✕ (a touch compatibility click) does not close it; a real tap does', () => {
      const { fixture, el, cmp, closed } = create();
      const center = el.querySelector<HTMLButtonElement>('.mrm-center')!;
      center.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));   // the long press lifts here
      expect(closed()).toBe(0);
      expect(cmp.visible).toBeTrue();
      el.querySelector('.mode-radial')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      center.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      expect(closed()).toBe(1);
      fixture.destroy();
    });

    it('Esc (overlay manager), the backdrop and the ✕ close it', () => {
      const { fixture, el, cmp, closed } = create();
      const overlays = TestBed.inject(OverlayManagerService);
      expect(overlays.handleEscape()).toBeTrue();
      expect(closed()).toBe(1);
      reopen(fixture);
      el.querySelector('.mrm-backdrop')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      expect(closed()).toBe(2);
      reopen(fixture);
      el.querySelector<HTMLButtonElement>('.mrm-center')!.click();
      expect(closed()).toBe(3);
      expect(cmp.visible).toBeFalse();
      fixture.destroy();
    });
  });

  describe('props panel', () => {
    let saved: string | null = null;
    beforeEach(() => { try { saved = localStorage.getItem(MODE_PROPS_COLLAPSED_KEY); localStorage.removeItem(MODE_PROPS_COLLAPSED_KEY); } catch { saved = null; } });
    afterEach(() => { try { if (saved === null) localStorage.removeItem(MODE_PROPS_COLLAPSED_KEY); else localStorage.setItem(MODE_PROPS_COLLAPSED_KEY, saved); } catch { /* */ } });

    function create(drawer: boolean | null) {
      if (drawer !== null) TestBed.overrideProvider(SidePanelService, { useValue: { drawerMode: drawer } });
      const fixture = TestBed.createComponent(ModePropsPanelComponent);
      fixture.componentRef.setInput('title', 'Mesh');
      fixture.detectChanges();
      return { fixture, el: fixture.nativeElement as HTMLElement, cmp: fixture.componentInstance };
    }

    it('docked: open by default, collapse is remembered, publishes its width', () => {
      const { fixture, el, cmp } = create(false);
      expect(cmp.collapsed).toBeFalse();
      expect(rootVarValue(MODE_CHROME_VARS.propsW)).toBe('280px');
      el.querySelector<HTMLButtonElement>('.mode-props-handle')!.click();
      fixture.detectChanges();
      expect(cmp.collapsed).toBeTrue();
      expect(localStorage.getItem(MODE_PROPS_COLLAPSED_KEY)).toBe('1');
      expect(rootVarValue(MODE_CHROME_VARS.propsW)).toBe('0px');
      expect(el.querySelector('.mode-props-panel')!.classList).toContain('collapsed');
      fixture.destroy();
      expect(rootVarValue(MODE_CHROME_VARS.propsW)).toBe('');
      const again = create(null);   // the provider is already overridden (docked)
      expect(again.cmp.collapsed).toBeTrue();
      again.cmp.toggle();
      expect(localStorage.getItem(MODE_PROPS_COLLAPSED_KEY)).toBeNull();
      again.fixture.destroy();
    });

    it('drawer: a session state that does not touch the stored preference', () => {
      const { fixture, cmp } = create(true);
      const was = cmp.collapsed;
      cmp.toggle();
      expect(cmp.collapsed).toBe(!was);
      expect(localStorage.getItem(MODE_PROPS_COLLAPSED_KEY)).toBeNull();
      fixture.destroy();
    });

    it('projects its content', () => {
      const { fixture, el } = create(false);
      expect(el.querySelector('.mpp-title')!.textContent).toContain('Mesh');
      expect(el.querySelector('.mpp-body')).toBeTruthy();
      fixture.destroy();
    });
  });
});
