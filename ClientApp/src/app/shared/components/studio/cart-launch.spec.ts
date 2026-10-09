import { canLaunchCarts, cartLaunchMessage, cartLaunchCode, launchCartToPlayer, PLAYER_BLACK, type LaunchableShell, type CartLaunchDeps } from './cart-launch';

const cart = new Blob(['x'], { type: 'application/zip' });

function deps(navOk: boolean | 'throw' = true) {
  const calls: string[] = [];
  const d: CartLaunchDeps = {
    handOff: (b) => { calls.push('handOff:' + (b === cart)); },
    navigate: () => { calls.push('navigate'); if (navOk === 'throw') throw new Error('nav'); return Promise.resolve(navOk); },
    toast: (m) => { calls.push('toast:' + m); },
  };
  return { d, calls };
}

describe('cart launch (Shell → Player)', () => {
  it('canLaunchCarts needs the launchSupported flag (the old stub was a function too)', () => {
    expect(canLaunchCarts({ launchSupported: true, launchSlot: () => Promise.reject() })).toBeTrue();
    expect(canLaunchCarts({ launchSlot: () => Promise.reject() })).toBeFalse();
    expect(canLaunchCarts({ launchSupported: true })).toBeFalse();
    expect(canLaunchCarts(null)).toBeFalse();
    expect(canLaunchCarts(undefined)).toBeFalse();
  });

  it('messages: a toast for each failure, silence for Esc / a second tap / leaving the Shell', () => {
    for (const code of ['cancelled', 'busy', 'unmounted']) expect(cartLaunchMessage(code)).toBeNull();
    for (const code of ['not-found', 'not-installed', 'read-failed', 'invalid-cart', 'too-new', 'timeout']) {
      const m = cartLaunchMessage(code);
      expect(m).toBeTruthy();
      expect(m).not.toMatch(/undefined|null|\bcode\b/);
    }
    expect(cartLaunchMessage('too-new')).toContain('newer');
    expect(cartLaunchMessage(undefined)).toBe("Couldn't open that cart.");
    expect(cartLaunchMessage('something-else')).toBe("Couldn't open that cart.");
  });

  it('cartLaunchCode reads a ShellLaunchError-like code', () => {
    expect(cartLaunchCode({ code: 'timeout' })).toBe('timeout');
    expect(cartLaunchCode(new Error('x'))).toBeUndefined();
    expect(cartLaunchCode(null)).toBeUndefined();
  });

  it('success: launches with the Player black, hands the cart over, then navigates', async () => {
    const shell: LaunchableShell = { launchSupported: true, launchSlot: jasmine.createSpy('launchSlot').and.resolveTo({ slotId: 'c', cart, title: 'T', author: '' }) };
    const { d, calls } = deps();
    expect(await launchCartToPlayer(shell, 'c', d)).toBe('launched');
    expect(shell.launchSlot).toHaveBeenCalledWith('c', { fadeColor: PLAYER_BLACK });
    expect(calls).toEqual(['handOff:true', 'navigate']);
    expect(PLAYER_BLACK).toBe('#0a0a0a');
  });

  it('a failed launch toasts and never hands off / navigates; a cancelled one is silent', async () => {
    const failing: LaunchableShell = { launchSupported: true, launchSlot: () => Promise.reject({ code: 'invalid-cart' }) };
    const a = deps();
    expect(await launchCartToPlayer(failing, 'c', a.d)).toBe('failed');
    expect(a.calls).toEqual(['toast:' + cartLaunchMessage('invalid-cart')]);
    const cancelled: LaunchableShell = { launchSupported: true, launchSlot: () => Promise.reject({ code: 'cancelled' }) };
    const b = deps();
    expect(await launchCartToPlayer(cancelled, 'c', b.d)).toBe('silent');
    expect(b.calls).toEqual([]);
  });

  it('a navigation that did not happen fades the Shell back in and toasts', async () => {
    for (const nav of [false, 'throw'] as const) {
      const cancelLaunch = jasmine.createSpy('cancelLaunch').and.returnValue(true);
      const shell: LaunchableShell = { launchSupported: true, launchSlot: () => Promise.resolve({ slotId: 'c', cart, title: '', author: '' }), cancelLaunch };
      const { d, calls } = deps(nav);
      expect(await launchCartToPlayer(shell, 'c', d)).toBe('nav-failed');
      expect(cancelLaunch).toHaveBeenCalled();
      expect(calls[calls.length - 1]).toContain('toast:');
    }
  });
});
