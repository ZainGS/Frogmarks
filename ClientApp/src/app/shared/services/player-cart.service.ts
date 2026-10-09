import { Injectable } from '@angular/core';

/** One-shot hand-offs between the Shell / dashboard and the Player (in memory: a cart Blob can't go in the URL). */
@Injectable({ providedIn: 'root' })
export class PlayerCartService {
  /** The cart the Player opens on its next mount (it takes it and clears it). */
  pendingCart: Blob | null = null;
  /** The pending cart came from the Shell's launch animation: the screen is already black (#0a0a0a), so the Player
   *  keeps it black, shows its spinner only if loading is slow, and fades the cart in. One-shot, like pendingCart. */
  launchedFromShell = false;
  /** The Player was left for the Shell: the Shell fades in from the Player's black. One-shot (the Shell clears it). */
  returningToShell = false;

  /** Hand a cart to the Player (`fromShell`: it was launched from the Shell's animation). */
  handOff(cart: Blob, fromShell = false): void {
    this.pendingCart = cart;
    this.launchedFromShell = fromShell;
  }

  /** The Player takes its pending cart (and whether it came from the Shell); both are cleared. */
  take(): { cart: Blob | null; fromShell: boolean } {
    const out = { cart: this.pendingCart, fromShell: this.launchedFromShell && !!this.pendingCart };
    this.pendingCart = null;
    this.launchedFromShell = false;
    return out;
  }

  /** The Shell asks whether it is coming back from the Player (and clears it). */
  takeReturningToShell(): boolean {
    const r = this.returningToShell;
    this.returningToShell = false;
    return r;
  }
}
