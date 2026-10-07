import { Injectable, NgZone, OnDestroy, Optional } from '@angular/core';
import { Subscription } from 'rxjs';

/**
 * One overlay at a time in the editor (UI review 2026-10-07 §3 item 2): every menu, popover and modal registers here.
 *
 *  - **Esc** closes the most recently opened overlay that is open, and is consumed (the tools never see that Esc).
 *    With nothing open, Esc is left alone.
 *  - **Outside tap**: a pointerdown (mouse, pen or finger) outside a popover's own elements closes it. It is a CAPTURE
 *    listener on the document, so it still runs when the canvas swallows the click (the engine's pointer handling) —
 *    taps on the canvas used to leave menus open. Modals (no `contains`) are left to their own backdrop.
 *  - **One at a time**: when an overlay opens, every other open one closes. Openings are detected after each change
 *    detection (isOpen() went false → true), so every path that opens one — a button, a shortcut, a service — counts,
 *    and owners do not need to report it.
 *
 * Owners keep their own open flags and their own close logic; an entry only reads and closes them. register() once
 * (ngOnInit) and call the returned function on destroy.
 */
export interface OverlayEntry {
  /** Unique id (one entry per owner). */
  id: string;
  isOpen(): boolean;
  /** Close it. Must be safe to call when it is already closed. */
  close(): void;
  /** The overlay's own elements and its trigger: a pointerdown inside does not close it. Omit for a modal (its
   *  backdrop closes it) — outside taps then never close it. */
  contains?(target: Node): boolean;
}

@Injectable({ providedIn: 'root' })
export class OverlayManagerService implements OnDestroy {
  private readonly entries = new Map<string, OverlayEntry>();
  /** Ids that were open at the last sync, in the order they opened (most recent last). */
  private openOrder: string[] = [];
  private stableSub: Subscription | null = null;
  private listening = false;

  constructor(@Optional() private ngZone?: NgZone) {}

  /** Add an overlay. Returns its unregister function. */
  register(entry: OverlayEntry): () => void {
    this.entries.set(entry.id, entry);
    if (entry.isOpen() && !this.openOrder.includes(entry.id)) this.openOrder.push(entry.id);
    this.listen();
    return () => {
      if (this.entries.get(entry.id) !== entry) return;
      this.entries.delete(entry.id);
      this.openOrder = this.openOrder.filter(id => id !== entry.id);
      if (this.entries.size === 0) this.unlisten();
    };
  }

  /** Something is open (for callers that want to step aside, e.g. gestures). */
  get anyOpen(): boolean {
    for (const e of this.entries.values()) if (safeIsOpen(e)) return true;
    return false;
  }

  /** Close every open overlay except `exceptId`. */
  closeAll(exceptId?: string): void {
    for (const e of this.entries.values()) {
      if (e.id !== exceptId && safeIsOpen(e)) safeClose(e);
    }
    this.sync();
  }

  /**
   * After a change: an overlay that has just opened closes the others (one at a time), and the open order is updated
   * (Esc closes the most recent). Runs after every change detection; also callable directly (specs).
   */
  sync(): void {
    const nowOpen: string[] = [];
    for (const e of this.entries.values()) if (safeIsOpen(e)) nowOpen.push(e.id);
    const opened = nowOpen.filter(id => !this.openOrder.includes(id));
    // Keep the old order for the ones still open, then the newly opened ones.
    this.openOrder = [...this.openOrder.filter(id => nowOpen.includes(id)), ...opened];
    if (!opened.length) return;
    const newest = opened[opened.length - 1];
    const others = this.openOrder.filter(id => id !== newest);
    if (!others.length) return;
    for (const id of others) { const e = this.entries.get(id); if (e) safeClose(e); }
    this.openOrder = this.openOrder.filter(id => id === newest || safeIsOpen(this.entries.get(id)!));
  }

  /** Esc: close the most recently opened overlay. Returns true when one was closed (the key is then consumed). */
  handleEscape(): boolean {
    this.sync();
    for (let i = this.openOrder.length - 1; i >= 0; i--) {
      const e = this.entries.get(this.openOrder[i]);
      if (e && safeIsOpen(e)) {
        safeClose(e);
        this.openOrder = this.openOrder.filter(id => id !== e.id);
        return true;
      }
    }
    return false;
  }

  /** Pointerdown at `target`: close every open popover it is outside of. Returns true when one was closed. */
  handlePointerDown(target: Node | null): boolean {
    if (!target) return false;
    let closed = false;
    for (const e of this.entries.values()) {
      if (!e.contains || !safeIsOpen(e)) continue;
      let inside = false;
      try { inside = e.contains(target); } catch { inside = false; }
      if (!inside) { safeClose(e); closed = true; }
    }
    if (closed) this.sync();
    return closed;
  }

  ngOnDestroy(): void { this.unlisten(); }

  // ── DOM listeners (outside Angular's zone; re-enter only when something closes) ───────────────────────────────

  private readonly onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key !== 'Escape' || ev.defaultPrevented || !this.anyOpen) return;
    if (this.run(() => this.handleEscape())) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
    }
  };

  private readonly onPointerDown = (ev: PointerEvent): void => {
    if (!this.anyOpen) return;
    this.run(() => this.handlePointerDown(ev.target as Node | null));
  };

  private run<T>(fn: () => T): T {
    const z = this.ngZone;
    return z && !NgZone.isInAngularZone() ? z.run(fn) : fn();
  }

  private listen(): void {
    if (this.listening || typeof window === 'undefined') return;
    this.listening = true;
    const add = () => {
      window.addEventListener('keydown', this.onKeyDown, true);
      document.addEventListener('pointerdown', this.onPointerDown, true);
    };
    if (this.ngZone) this.ngZone.runOutsideAngular(add); else add();
    // After each change detection: detect openings (one at a time). onStable fires outside the zone; a close re-enters.
    // Only a sync that closes something needs the zone (a view change); otherwise it just updates the open order.
    this.stableSub = this.ngZone?.onStable.subscribe(() => {
      if (!this.entries.size) return;
      if (this.wouldClose()) this.run(() => this.sync()); else this.sync();
    }) ?? null;
  }

  /** A sync would close something (a newly opened overlay while another is open). */
  private wouldClose(): boolean {
    let open = 0, fresh = 0;
    for (const e of this.entries.values()) {
      if (!safeIsOpen(e)) continue;
      open++;
      if (!this.openOrder.includes(e.id)) fresh++;
    }
    return fresh > 0 && open > 1;
  }

  private unlisten(): void {
    if (!this.listening) return;
    this.listening = false;
    window.removeEventListener('keydown', this.onKeyDown, true);
    document.removeEventListener('pointerdown', this.onPointerDown, true);
    this.stableSub?.unsubscribe();
    this.stableSub = null;
  }
}

function safeIsOpen(e: OverlayEntry | undefined): boolean {
  if (!e) return false;
  try { return !!e.isOpen(); } catch { return false; }
}

function safeClose(e: OverlayEntry): void {
  try { e.close(); } catch (err) { console.warn(`[overlays] closing "${e.id}" failed`, err); }
}

/** contains() for an overlay that lives inside one element (a component host) — its trigger usually does too. */
export function insideElement(el: () => Element | null | undefined): (target: Node) => boolean {
  return (target: Node) => !!el()?.contains(target);
}

/** contains() for an overlay matched by a CSS selector on the target or an ancestor. */
export function insideSelector(selector: string): (target: Node) => boolean {
  return (target: Node) => {
    const el = target instanceof Element ? target : target.parentElement;
    return !!el?.closest(selector);
  };
}
