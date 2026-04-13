import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  SelectionTool,
  SelectionInfo,
} from '../../../boards/models/brush-preset.model';
import ShapeManager from '@zaings/salsa/shape-manager';

const EMPTY_INFO: SelectionInfo = {
  hasSelection: false,
  bounds: null,
  isTransforming: false,
  transform: null,
};

@Injectable({ providedIn: 'root' })
export class RasterSelectionService {

  // ── Observable state ──────────────────────────────────────────
  private _info$ = new BehaviorSubject<SelectionInfo>(EMPTY_INFO);
  private _tool$ = new BehaviorSubject<SelectionTool>('rect');
  private _feather$ = new BehaviorSubject<number>(0);
  private _enabled$ = new BehaviorSubject<boolean>(false);

  readonly info$: Observable<SelectionInfo> = this._info$.asObservable();
  readonly tool$: Observable<SelectionTool> = this._tool$.asObservable();
  readonly feather$: Observable<number> = this._feather$.asObservable();
  readonly enabled$: Observable<boolean> = this._enabled$.asObservable();

  get info(): SelectionInfo { return this._info$.value; }
  get tool(): SelectionTool { return this._tool$.value; }
  get feather(): number { return this._feather$.value; }
  get isEnabled(): boolean { return this._enabled$.value; }

  // ── ShapeManager access ───────────────────────────────────────
  private get sm(): any | null {
    return ShapeManager?.getInstance?.() ?? null;
  }

  // ── Enable / Disable ─────────────────────────────────────────

  enable(): void {
    this.sm?.enableRasterSelection?.(this._tool$.value);
    this._enabled$.next(true);
    this.refreshInfo();
  }

  disable(): void {
    // Auto-commit any in-progress transform
    if (this.info.isTransforming) {
      this.commitTransform();
    }
    this.sm?.disableRasterSelection?.();
    this._enabled$.next(false);
    this.refreshInfo();
  }

  // ── Tool mode ─────────────────────────────────────────────────

  setTool(tool: SelectionTool): void {
    this._tool$.next(tool);
    // If already enabled, switch tool live
    if (this._enabled$.value) {
      this.sm?.enableRasterSelection?.(tool);
    }
    // Also update the service's internal tool state for overlay rendering
    this.sm?.rasterSelectionService?.setTool?.(tool);
  }

  setFeather(px: number): void {
    const clamped = Math.max(0, Math.min(50, px));
    this._feather$.next(clamped);
    this.sm?.setRasterSelectionFeather?.(clamped);
  }

  // ── Selection creation (programmatic) ─────────────────────────

  selectAll(): void {
    this.sm?.rasterSelectAll?.();
    this.refreshInfo();
  }

  deselectAll(): void {
    this.sm?.rasterDeselectAll?.();
    this.refreshInfo();
  }

  invertSelection(): void {
    this.sm?.rasterInvertSelection?.();
    this.refreshInfo();
  }

  // ── Pixel operations ──────────────────────────────────────────

  async cut(): Promise<void> {
    await this.sm?.rasterCutSelection?.();
    this.refreshInfo();
  }

  async copy(): Promise<void> {
    await this.sm?.rasterCopySelection?.();
  }

  paste(): void {
    this.sm?.rasterPaste?.();
    this.refreshInfo();
  }

  deleteSelection(): void {
    this.sm?.rasterDeleteSelection?.();
    this.refreshInfo();
  }

  // ── Transform ─────────────────────────────────────────────────

  beginTransform(): void {
    this.sm?.rasterBeginTransform?.();
    this.refreshInfo();
  }

  updateTransform(
    dx: number, dy: number,
    scaleX = 1, scaleY = 1,
    rotation = 0
  ): void {
    this.sm?.rasterUpdateTransform?.(dx, dy, scaleX, scaleY, rotation);
    this.refreshInfo();
  }

  commitTransform(): void {
    this.sm?.rasterCommitTransform?.();
    this.refreshInfo();
  }

  cancelTransform(): void {
    this.sm?.rasterCancelTransform?.();
    this.refreshInfo();
  }

  // ── Query ─────────────────────────────────────────────────────

  refreshInfo(): void {
    const raw = this.sm?.getRasterSelectionInfo?.();
    const info: SelectionInfo = raw ?? EMPTY_INFO;
    this._info$.next(info);
  }

  getSelectionInfo(): SelectionInfo {
    this.refreshInfo();
    return this._info$.value;
  }
}
