/**
 * Two-finger tap = Undo, three-finger tap = Redo on the canvas (UI review 2026-10-07 §3 item 3; the Procreate / Krita
 * convention). DOM-free core (MultiFingerTap) + a small window binding (attachMultiFingerTap).
 *
 * A TAP, never a gesture that did something else:
 *  - only fingers (`pointerType === 'touch'`); a pen or mouse pointer down at any point spoils it (palm while drawing);
 *  - every finger lands within LAND_MS of the first, so a finger joining a stroke that is already under way is not a
 *    tap (the engine takes that stroke back and pinches; we stay out of it);
 *  - no finger moves more than MOVE_PX (a pinch / two-finger pan is never an undo), the whole tap lasts at most MAX_MS
 *    from the first finger down to the last finger up, and exactly 2 or 3 fingers were down at once;
 *  - the first finger must land on the canvas, and so must every other one;
 *  - `blocked()` (Play, the viewer, a modal, a running stroke…) is checked when the tap completes.
 * Listeners are passive and never prevent anything, so the engine's pinch / pan / take-back are untouched: a still
 * two-finger tap is a zero-distance pinch for the engine (no zoom, no pan) and nothing for the brush.
 */
export type MultiTapAction = 'undo' | 'redo';

export interface TapPointer {
  pointerId: number;
  pointerType: string;
  clientX: number;
  clientY: number;
  timeStamp: number;
}

export class MultiFingerTap {
  /** Max travel of any finger (CSS px). A little over Salsa's 8 px touch-start slop: fingers wobble on a tap. */
  static readonly MOVE_PX = 12;
  /** Max time between the first and the last finger landing (ms). */
  static readonly LAND_MS = 200;
  /** Max time from the first finger down to the last finger up (ms). */
  static readonly MAX_MS = 450;

  private readonly fingers = new Map<number, { x: number; y: number }>();
  private readonly others = new Set<number>();
  private startT = 0;
  private maxFingers = 0;
  private spoiled = false;

  /** Fingers currently tracked. */
  get count(): number { return this.fingers.size; }

  /** pointerdown. `onCanvas`: the pointer landed on the drawing canvas. */
  down(p: TapPointer, onCanvas: boolean): void {
    if (p.pointerType !== 'touch') {
      this.others.add(p.pointerId);
      if (this.fingers.size) this.spoiled = true;
      return;
    }
    if (this.fingers.size === 0) {
      this.startT = p.timeStamp;
      this.maxFingers = 0;
      this.spoiled = !onCanvas || this.others.size > 0;
    } else if (!onCanvas || p.timeStamp - this.startT > MultiFingerTap.LAND_MS) {
      this.spoiled = true;
    }
    this.fingers.set(p.pointerId, { x: p.clientX, y: p.clientY });
    this.maxFingers = Math.max(this.maxFingers, this.fingers.size);
  }

  /** pointermove. */
  move(p: TapPointer): void {
    const f = p.pointerType === 'touch' ? this.fingers.get(p.pointerId) : undefined;
    if (!f || this.spoiled) return;
    if (Math.hypot(p.clientX - f.x, p.clientY - f.y) > MultiFingerTap.MOVE_PX) this.spoiled = true;
  }

  /** pointerup. Returns the action when this lifts the last finger of a valid 2- / 3-finger tap. */
  up(p: TapPointer): MultiTapAction | null {
    if (p.pointerType !== 'touch') { this.others.delete(p.pointerId); return null; }
    if (!this.fingers.has(p.pointerId)) return null;
    this.move(p);
    this.fingers.delete(p.pointerId);
    if (this.fingers.size > 0) return null;
    if (this.spoiled || p.timeStamp - this.startT > MultiFingerTap.MAX_MS) return null;
    return this.maxFingers === 2 ? 'undo' : this.maxFingers === 3 ? 'redo' : null;
  }

  /** pointercancel: the browser took the pointer — never a tap. */
  cancel(p: TapPointer): void {
    if (p.pointerType !== 'touch') { this.others.delete(p.pointerId); return; }
    if (!this.fingers.has(p.pointerId)) return;
    this.fingers.delete(p.pointerId);
    this.spoiled = true;
  }

  reset(): void {
    this.fingers.clear();
    this.others.clear();
    this.spoiled = false;
    this.maxFingers = 0;
  }
}

export interface MultiFingerTapOptions {
  /** The drawing canvas (the element the first finger must land on). */
  isCanvas(target: EventTarget | null): boolean;
  /** Checked when a tap completes: true = do nothing (Play, viewer, a modal open, a stroke running…). */
  blocked(): boolean;
  onTap(action: MultiTapAction): void;
}

/** Listen on `win` (capture, passive). Returns the detach function. Call outside Angular's zone: only onTap needs it. */
export function attachMultiFingerTap(win: Window, opts: MultiFingerTapOptions): () => void {
  const tap = new MultiFingerTap();
  const onDown = (e: PointerEvent) => tap.down(e, opts.isCanvas(e.target));
  const onMove = (e: PointerEvent) => tap.move(e);
  const onUp = (e: PointerEvent) => {
    const action = tap.up(e);
    if (action && !opts.blocked()) opts.onTap(action);
  };
  const onCancel = (e: PointerEvent) => tap.cancel(e);
  const o: AddEventListenerOptions = { capture: true, passive: true };
  win.addEventListener('pointerdown', onDown, o);
  win.addEventListener('pointermove', onMove, o);
  win.addEventListener('pointerup', onUp, o);
  win.addEventListener('pointercancel', onCancel, o);
  return () => {
    win.removeEventListener('pointerdown', onDown, o);
    win.removeEventListener('pointermove', onMove, o);
    win.removeEventListener('pointerup', onUp, o);
    win.removeEventListener('pointercancel', onCancel, o);
    tap.reset();
  };
}
