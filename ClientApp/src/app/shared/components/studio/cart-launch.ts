/**
 * Shell → Player hand-off for a FrogCart (salsa/docs/specs/frogcart-cd-art-and-launch.md, Part A).
 *
 * One tap on an installed cart: Salsa's `shell.launchSlot(id)` plays the CD launch animation while it reads + checks the
 * cart, and resolves with the cart once the screen has faded to the Player's black. The host then hands the cart to
 * the Player (PlayerCartService) and navigates to /player. A failed launch is a toast (cartLaunchMessage); Esc /
 * a scene teardown is silent. Pure helpers + the hand-off, so they are unit-tested without the engine.
 */

/** Why a launch did not reach the Player (Salsa ShellLaunchErrorCode). */
export type CartLaunchCode =
  | 'busy' | 'not-found' | 'not-installed' | 'read-failed' | 'invalid-cart' | 'too-new' | 'timeout' | 'cancelled' | 'unmounted';

/** What a launch resolves with (Salsa ShellLaunchResult). */
export interface CartLaunchResult { slotId: string; cart: Blob; title: string; author: string }

/** The Shell API the hand-off needs (a newer Salsa build; older ones lack launchSupported). */
export interface LaunchableShell {
  launchSupported?: boolean;
  launchSlot(slotId: string, opts?: { fadeColor?: string }): Promise<CartLaunchResult>;
  cancelLaunch?(): boolean;
}

/** The Player's background — the launch fades to it, and the Shell comes back from it. */
export const PLAYER_BLACK = '#0a0a0a';

/** True when this Salsa build launches carts (the old Phase-6 stub was a function too — check the flag). */
export function canLaunchCarts(shell: unknown): shell is LaunchableShell {
  const s = shell as Partial<LaunchableShell> | null | undefined;
  return !!s && s.launchSupported === true && typeof s.launchSlot === 'function';
}

/** The toast for a failed launch; null = say nothing (cancelled with Esc, a second tap while one runs, the Shell was
 *  left mid-launch). */
export function cartLaunchMessage(code: string | null | undefined): string | null {
  switch (code) {
    case 'cancelled':
    case 'busy':
    case 'unmounted':
      return null;
    case 'not-found': return "That cart isn't on this device any more.";
    case 'not-installed': return "That cart isn't downloaded to this device yet.";
    case 'read-failed': return "Couldn't read that cart from this device's storage. Try again, or import it again.";
    case 'invalid-cart': return "That file isn't a FrogCart that can be played.";
    case 'too-new': return 'That cart was made with a newer version of Frogmarks. Update the app to play it.';
    case 'timeout': return 'The cart took too long to load. Try again.';
    default: return "Couldn't open that cart.";
  }
}

/** The launch error's code (Salsa throws a ShellLaunchError with `code`); undefined for anything else. */
export function cartLaunchCode(e: unknown): string | undefined {
  const c = (e as { code?: unknown } | null | undefined)?.code;
  return typeof c === 'string' ? c : undefined;
}

export interface CartLaunchDeps {
  /** Hand the cart to the Player (PlayerCartService.pendingCart + launchedFromShell). */
  handOff(cart: Blob): void;
  /** Open the Player; resolves false / rejects when the navigation didn't happen. */
  navigate(): Promise<boolean> | boolean | void;
  /** Show an error toast. */
  toast(message: string): void;
}

export type CartLaunchOutcome = 'launched' | 'failed' | 'silent' | 'nav-failed';

/**
 * Launch `slotId` and open it in the Player. A failure toasts (or not — see cartLaunchMessage); a navigation that
 * didn't happen fades the Shell back in from black (cancelLaunch) and toasts.
 */
export async function launchCartToPlayer(shell: LaunchableShell, slotId: string, deps: CartLaunchDeps): Promise<CartLaunchOutcome> {
  let result: CartLaunchResult;
  try {
    result = await shell.launchSlot(slotId, { fadeColor: PLAYER_BLACK });
  } catch (e) {
    const msg = cartLaunchMessage(cartLaunchCode(e));
    if (msg) { deps.toast(msg); return 'failed'; }
    return 'silent';
  }
  deps.handOff(result.cart);
  let ok: boolean | void;
  try { ok = await deps.navigate(); } catch { ok = false; }
  if (ok === false) {
    try { shell.cancelLaunch?.(); } catch { /* the Shell is gone */ }
    deps.toast("Couldn't open the Player. Try again.");
    return 'nav-failed';
  }
  return 'launched';
}
