import { OverlayManagerService, OverlayEntry, insideElement, insideSelector } from './overlay-manager.service';

/** A popover / modal stand-in: an open flag, a close that clears it, and (popovers) an element it lives in. */
function overlay(id: string, el?: HTMLElement): OverlayEntry & { open: boolean; closes: number } {
  const o = {
    id, open: false, closes: 0,
    isOpen: () => o.open,
    close: () => { o.closes++; o.open = false; },
    ...(el ? { contains: insideElement(() => el) } : {}),
  };
  return o;
}

describe('OverlayManagerService', () => {
  let svc: OverlayManagerService;
  let host: HTMLElement;
  const unregister: Array<() => void> = [];

  beforeEach(() => {
    svc = new OverlayManagerService();   // no NgZone: listeners run directly
    host = document.createElement('div');
    document.body.appendChild(host);
  });
  afterEach(() => {
    unregister.splice(0).forEach(f => f());
    host.remove();
    svc.ngOnDestroy();
  });

  function add(o: OverlayEntry): void { unregister.push(svc.register(o)); }

  it('Esc closes the most recently opened overlay, and only that one', () => {
    const a = overlay('a'), b = overlay('b');
    add(a); add(b);
    a.open = true; svc.sync();
    b.open = true;                      // a modal opened over… (sync would close `a`; check Esc order without it)
    svc['openOrder'] = ['a', 'b'];
    expect(svc.handleEscape()).toBeTrue();
    expect(b.open).toBeFalse();
    expect(a.open).toBeTrue();
    expect(svc.handleEscape()).toBeTrue();
    expect(a.open).toBeFalse();
    expect(svc.handleEscape()).toBeFalse();   // nothing open: the key is left alone
  });

  it('one at a time: an overlay that opens closes the others', () => {
    const menu = overlay('menu'), layers = overlay('layers');
    add(menu); add(layers);
    menu.open = true; svc.sync();
    expect(menu.closes).toBe(0);
    layers.open = true; svc.sync();
    expect(menu.open).toBeFalse();
    expect(layers.open).toBeTrue();
    expect(layers.closes).toBe(0);
  });

  it('a pointerdown outside a popover closes it; inside (or on its trigger) does not; modals are left alone', () => {
    const inside = document.createElement('button');
    host.appendChild(inside);
    const outside = document.createElement('div');
    document.body.appendChild(outside);
    const popover = overlay('popover', host), modal = overlay('modal');
    add(popover); add(modal);
    popover.open = true; modal.open = true;
    expect(svc.handlePointerDown(inside)).toBeFalse();
    expect(popover.open).toBeTrue();
    expect(svc.handlePointerDown(outside)).toBeTrue();
    expect(popover.open).toBeFalse();
    expect(modal.open).toBeTrue();
    outside.remove();
  });

  it('listens on the document: Esc is consumed only when it closed something; capture pointerdown closes', () => {
    const popover = overlay('popover', host);
    add(popover);
    popover.open = true;
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    window.dispatchEvent(esc);
    expect(popover.open).toBeFalse();
    expect(esc.defaultPrevented).toBeTrue();
    const esc2 = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    window.dispatchEvent(esc2);
    expect(esc2.defaultPrevented).toBeFalse();

    popover.open = true;
    const target = document.createElement('canvas');
    document.body.appendChild(target);
    // The canvas stops the event at its own listener: the capture listener has already run
    target.addEventListener('pointerdown', e => e.stopPropagation());
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(popover.open).toBeFalse();
    target.remove();
  });

  it('a close that throws does not stop the others; unregister forgets the entry', () => {
    const bad: OverlayEntry = { id: 'bad', isOpen: () => true, close: () => { throw new Error('boom'); } };
    const ok = overlay('ok');
    spyOn(console, 'warn');
    add(bad); add(ok);
    ok.open = true;
    expect(() => svc.closeAll()).not.toThrow();
    expect(ok.open).toBeFalse();
    const off = svc.register(overlay('x'));
    off();
    expect(svc['entries'].has('x')).toBeFalse();
  });

  it('insideSelector matches the target or an ancestor', () => {
    host.innerHTML = '<app-add-mesh-menu><span id="t">x</span></app-add-mesh-menu>';
    const t = host.querySelector('#t')!;
    expect(insideSelector('app-add-mesh-menu')(t.firstChild!)).toBeTrue();
    expect(insideSelector('app-add-mesh-menu')(host)).toBeFalse();
  });
});
