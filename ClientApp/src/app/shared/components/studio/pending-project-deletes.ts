/**
 * Delete-with-Undo for the Shell's project cards (UI review 2026-10-07 §1 #1: one tap on a card's ✕ used to delete
 * the project forever).
 *
 * A ✕ now only SCHEDULES the delete: the card is hidden at once (the Shell's project list filters `isHidden`), an
 * "Undo" toast shows, and the project is really deleted `delayMs` later unless Undo was tapped. If the Shell goes
 * away first (navigation, app closed), `cancelAll()` drops every pending delete WITHOUT deleting anything — the
 * project is back the next time the list is read. Nothing here touches storage except the `commit` callback.
 */

/** Default time the Undo toast stays up before the delete really happens. */
export const PROJECT_DELETE_UNDO_MS = 8000;

export interface PendingProjectDelete {
  id: string;
  /** Shown in the toast ("Deleted “name”"). */
  name: string;
  dashboardKind: 'illustration' | 'packaging';
}

type TimerId = ReturnType<typeof setTimeout>;

export class PendingProjectDeletes {
  /** Waiting for their timer: shown in the toast, can be undone. */
  private readonly _waiting = new Map<string, { entry: PendingProjectDelete; timer: TimerId }>();
  /** Timer fired, the delete is running: still hidden, no Undo any more. */
  private readonly _committing = new Set<string>();
  private _list: PendingProjectDelete[] = [];

  /**
   * @param commit   really delete the project (storage).
   * @param onChange the pending set changed (hide / show the card again, refresh the toast).
   * @param onError  the delete failed (the card shows again).
   */
  constructor(
    private readonly commit: (id: string) => Promise<void>,
    private readonly onChange: () => void,
    private readonly delayMs = PROJECT_DELETE_UNDO_MS,
    private readonly setTimer: (fn: () => void, ms: number) => TimerId = (fn, ms) => setTimeout(fn, ms),
    private readonly clearTimer: (id: TimerId) => void = (id) => clearTimeout(id),
    private readonly onError: (id: string, err: unknown) => void = () => { /* the card just reappears */ },
  ) {}

  /** The deletes the toast offers Undo for, oldest first (a stable array between changes, for *ngFor). */
  get list(): readonly PendingProjectDelete[] { return this._list; }

  /** Hide this project from the list (waiting or being deleted)? */
  isHidden(id: string): boolean { return this._waiting.has(id) || this._committing.has(id); }

  /** Hide the card now and delete it after the delay. A second ✕ on the same project is ignored. */
  schedule(entry: PendingProjectDelete): void {
    if (this.isHidden(entry.id)) return;
    const timer = this.setTimer(() => void this._commit(entry.id), this.delayMs);
    this._waiting.set(entry.id, { entry: { ...entry }, timer });
    this._sync();
  }

  /** Undo: the card comes back, nothing is deleted. False when it is too late (already deleting) or unknown. */
  undo(id: string): boolean {
    const w = this._waiting.get(id);
    if (!w) return false;
    this.clearTimer(w.timer);
    this._waiting.delete(id);
    this._sync();
    return true;
  }

  /** The Shell is going away: forget every waiting delete WITHOUT deleting (the projects come back). */
  cancelAll(): void {
    if (!this._waiting.size) return;
    for (const w of this._waiting.values()) this.clearTimer(w.timer);
    this._waiting.clear();
    this._list = [];
    // No onChange: the owner is being torn down; the next Shell mount re-reads the list from storage.
  }

  private async _commit(id: string): Promise<void> {
    if (!this._waiting.delete(id)) return;
    this._committing.add(id);
    this._sync();   // the toast goes; the card stays hidden
    try {
      await this.commit(id);
    } catch (err) {
      this.onError(id, err);
    } finally {
      this._committing.delete(id);
      this.onChange();
    }
  }

  private _sync(): void {
    this._list = [...this._waiting.values()].map(w => w.entry);
    this.onChange();
  }
}
