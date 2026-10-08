/**
 * Undo / redo scoped to a 3D edit mode (Edit Mesh, Armature — Rig and Animate): while the mode is on, the editor's
 * Undo / Redo (the top bar's buttons, Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z, two- / three-finger taps, the canvas context
 * menu — all through editor-keymap routeUndo) only walk the 3D steps made IN the mode:
 *   - undo stops at the 3D undo step that was on top when the mode was entered (the floor; an older Salsa without
 *     scene3d.peekUndoCommand3D has no floor — undo then runs as before),
 *   - redo only re-does what was undone inside the mode (a redo left over from before the mode is not re-done).
 * The caller runs the step itself (scene3dUndo / scene3dRedo) when takeStep says it may; the 2D object stack is
 * skipped while a mode owns undo.
 */

/** The engine members the scope reads (ShapeManager). */
interface UndoEngine {
  readonly canUndo3D?: boolean;
  readonly canRedo3D?: boolean;
  readonly scene3d?: { peekUndoCommand3D?(): unknown } | null;
}

export class ModeUndoScope {
  /** The 3D undo step on top when the mode was entered (undefined = no floor). */
  private _floor: unknown = undefined;
  /** How many of the mode's steps were undone since it was entered (redo stops after those). */
  private _undone = 0;

  constructor(private readonly engine: () => object | null | undefined) {}

  private get _sm(): UndoEngine | null { return (this.engine() as UndoEngine | null | undefined) ?? null; }

  private _peek(): unknown {
    const s3d = this._sm?.scene3d;
    return typeof s3d?.peekUndoCommand3D === 'function' ? s3d.peekUndoCommand3D() : undefined;
  }

  /** The mode was entered: the step on top now is the floor, nothing undone yet. */
  enter(): void {
    this._floor = this._peek();
    this._undone = 0;
  }

  /** The mode was left: no floor until the next enter(). */
  leave(): void {
    this._floor = undefined;
    this._undone = 0;
  }

  /** Whether the undo (redo = false) / redo step may run inside the mode; counts it when it may. */
  takeStep(redo: boolean): boolean {
    const sm = this._sm;
    if (!sm) return false;
    if (redo) {
      if (this._undone <= 0 || !sm.canRedo3D) return false;
      this._undone--;
      return true;
    }
    if (!sm.canUndo3D) return false;
    const top = this._peek();
    if (top !== undefined && top === this._floor) return false;
    this._undone++;
    return true;
  }
}
