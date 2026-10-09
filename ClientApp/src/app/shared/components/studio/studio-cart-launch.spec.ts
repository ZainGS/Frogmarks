import { StudioComponent } from './studio.component';
import { PlayerCartService } from '../../services/player-cart.service';
import { PLAYER_BLACK } from './cart-launch';

/** A StudioComponent over fakes (no engine, no Angular DI): the Shell → Player cart wiring only. */
function studio(shell: Record<string, unknown>) {
  const zone = { run: (fn: () => unknown) => fn(), runOutsideAngular: (fn: () => unknown) => fn() };
  const router = { navigate: jasmine.createSpy('navigate').and.resolveTo(true) };
  const notify = { error: jasmine.createSpy('error') };
  const playerCart = new PlayerCartService();
  const none = null as never;
  const c = new StudioComponent(router as never, zone as never, none, none, none, none, none, none, notify as never, none, playerCart);
  (c as unknown as { sm: unknown }).sm = { shell };
  (c as unknown as { _syncModalChrome(): void })._syncModalChrome = () => undefined;
  const handle = (id: string, kind: string) => (c as unknown as { _handleActivation(id: string, kind: string): void })._handleActivation(id, kind);
  return { c, router, notify, playerCart, handle };
}

const slot = { id: 'c1', type: 'local', name: 'Snake', description: 'A game' };
const cart = new Blob(['x']);

describe('Studio: a tap on a cart plays it (Shell launch → Player)', () => {
  it('launches with the Player black, hands the cart over (from the Shell) and opens /player', async () => {
    const launchSlot = jasmine.createSpy('launchSlot').and.resolveTo({ slotId: 'c1', cart, title: 'Snake', author: '' });
    const { router, playerCart, handle, c } = studio({ launchSupported: true, launchSlot, getSlot: () => slot });
    handle('c1', 'local');
    await new Promise((r) => setTimeout(r));
    expect(launchSlot).toHaveBeenCalledWith('c1', { fadeColor: PLAYER_BLACK });
    expect(router.navigate).toHaveBeenCalledWith(['/player']);
    expect(playerCart.take()).toEqual({ cart, fromShell: true });
    expect(c.cartDialog).toBeNull();
  });

  it('a failed launch toasts; Esc (cancelled) does not', async () => {
    const launchSlot = jasmine.createSpy('launchSlot').and.returnValues(Promise.reject({ code: 'too-new' }), Promise.reject({ code: 'cancelled' }));
    const { notify, router, handle } = studio({ launchSupported: true, launchSlot, getSlot: () => slot });
    handle('c1', 'local');
    await new Promise((r) => setTimeout(r));
    expect(notify.error).toHaveBeenCalledTimes(1);
    handle('c1', 'local');
    await new Promise((r) => setTimeout(r));
    expect(notify.error).toHaveBeenCalledTimes(1);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('an engine without launch support opens the cart sheet instead (not playable)', () => {
    const { c, handle } = studio({ launchSlot: () => Promise.reject(new Error('Phase 6')), getSlot: () => slot });
    handle('c1', 'local');
    expect(c.cartDialog).toEqual(jasmine.objectContaining({ id: 'c1', name: 'Snake', playable: false, removable: true }));
  });

  it('the sheet (long-press / right-click / Options): Play closes it and launches; Remove still asks first', async () => {
    const launchSlot = jasmine.createSpy('launchSlot').and.resolveTo({ slotId: 'c1', cart, title: '', author: '' });
    const removeCartSlot = jasmine.createSpy('removeCartSlot').and.resolveTo();
    const { c } = studio({ launchSupported: true, launchSlot, getSlot: () => slot, removeCartSlot });
    c.openCartDialog('c1');
    expect(c.cartDialog?.playable).toBeTrue();
    await c.removeCart();
    expect(removeCartSlot).not.toHaveBeenCalled();
    expect(c.cartDialog?.confirmRemove).toBeTrue();
    c.playCartFromDialog();
    expect(c.cartDialog).toBeNull();
    expect(launchSlot).toHaveBeenCalledWith('c1', jasmine.anything());
  });

  it('the keyboard strip: Play launches, Options opens the sheet', () => {
    const launchSlot = jasmine.createSpy('launchSlot').and.returnValue(new Promise(() => {}));
    const { c } = studio({ launchSupported: true, launchSlot, getSlot: () => slot, getDashboardKind: () => 'illustration' });
    c.activateKey({ key: 'c:c1', label: 'Play “Snake”', action: { type: 'cart-play', id: 'c1' } });
    expect(launchSlot).toHaveBeenCalledTimes(1);
    c.activateKey({ key: 'co:c1', label: 'Options for “Snake”', action: { type: 'cart', id: 'c1' } });
    expect(c.cartDialog?.id).toBe('c1');
  });
});
