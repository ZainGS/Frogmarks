import { Injectable } from '@angular/core';

/** localStorage key of the user's palettes: global (shared by every document), per device, never in documents. */
export const PALETTES_STORAGE_KEY = 'fm-color-palettes';
/** Squares per palette row. */
export const PALETTE_ROW_LENGTH = 8;

/** One row: PALETTE_ROW_LENGTH squares, each a colour or null (empty). */
export type PaletteRow = Array<string | null>;

/** A square's place. */
export interface PaletteSquare { row: number; col: number }

/** What deleteRow hands back so the "Undo" toast can put the row back where it was. */
export interface DeletedPaletteRow {
  index: number;
  row: PaletteRow;
  /** It was the only row: an empty row took its place (undo replaces that empty row again). */
  replacedByEmpty: boolean;
}

/** The part of Storage this uses (a spec passes a fake). */
export type PaletteStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function emptyPaletteRow(): PaletteRow {
  return new Array<string | null>(PALETTE_ROW_LENGTH).fill(null);
}

function isColour(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= 64;
}

/** A stored value back to rows: anything malformed reads as one empty row; rows are padded / cut to 8 squares. */
export function parsePaletteRows(raw: string | null | undefined): PaletteRow[] {
  if (!raw) return [emptyPaletteRow()];
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return [emptyPaletteRow()]; }
  const rows = (data as { rows?: unknown } | null)?.rows;
  if (!Array.isArray(rows)) return [emptyPaletteRow()];
  const out: PaletteRow[] = rows
    .filter((r): r is unknown[] => Array.isArray(r))
    .map((r) => Array.from({ length: PALETTE_ROW_LENGTH }, (_, i) => (isColour(r[i]) ? r[i] as string : null)));
  return out.length ? out : [emptyPaletteRow()];
}

/**
 * The colour picker's palettes (the Palettes popup): rows of 8 squares, the one selected (live-linked) square, and
 * their local persistence. Plain logic, no DOM; the picker component drives it.
 *
 * - tap an empty square: it takes the picker's colour and becomes selected; while selected, every picker change
 *   (pickerChanged) updates it;
 * - tap a filled square: returns its colour for the picker; nothing is selected;
 * - link (long-press / double-tap): a filled square becomes selected; returns its colour for the picker;
 * - tapping the selected square again deselects it. Only one square is selected at a time.
 * Storage failures never throw: the palettes then last for the session.
 */
export class PaletteBook {
  rows: PaletteRow[];
  selected: PaletteSquare | null = null;

  constructor(private readonly storage: PaletteStorage | null) {
    this.rows = this.load();
  }

  isSelected(row: number, col: number): boolean {
    return !!this.selected && this.selected.row === row && this.selected.col === col;
  }

  /** A tap on a square. Returns the colour the picker should take, or null (it keeps its colour). */
  tap(row: number, col: number, pickerColour: string): string | null {
    const r = this.rows[row];
    if (!r || col < 0 || col >= PALETTE_ROW_LENGTH) return null;
    if (this.isSelected(row, col)) { this.selected = null; return null; }
    const c = r[col];
    if (c == null) {
      if (!isColour(pickerColour)) return null;
      r[col] = pickerColour;
      this.selected = { row, col };
      this.save();
      return null;
    }
    this.selected = null;
    return c;
  }

  /** Long-press / double-tap: select (live-link) a filled square. Returns its colour for the picker (so the next
   *  picker change edits from it), or null for an empty square / a bad index. */
  link(row: number, col: number): string | null {
    const c = this.rows[row]?.[col];
    if (c == null) return null;
    this.selected = { row, col };
    return c;
  }

  deselect(): void { this.selected = null; }

  /** The picker's colour changed: the selected square follows it. */
  pickerChanged(colour: string): void {
    const s = this.selected;
    if (!s || !isColour(colour)) return;
    const r = this.rows[s.row];
    if (!r || r[s.col] === colour) return;
    r[s.col] = colour;
    this.save();
  }

  /** "+": a new empty row right below `row`. */
  addRowBelow(row: number): void {
    const at = Math.max(0, Math.min(this.rows.length, row + 1));
    this.rows.splice(at, 0, emptyPaletteRow());
    if (this.selected && this.selected.row >= at) this.selected = { ...this.selected, row: this.selected.row + 1 };
    this.save();
  }

  /** "✕": remove `row` (the last one leaves one empty row). Returns what restoreRow needs, or null for a bad index. */
  deleteRow(row: number): DeletedPaletteRow | null {
    if (row < 0 || row >= this.rows.length) return null;
    const [removed] = this.rows.splice(row, 1);
    const replacedByEmpty = this.rows.length === 0;
    if (replacedByEmpty) this.rows.push(emptyPaletteRow());
    const s = this.selected;
    if (s) {
      if (s.row === row) this.selected = null;
      else if (s.row > row) this.selected = { ...s, row: s.row - 1 };
    }
    this.save();
    return { index: row, row: removed, replacedByEmpty };
  }

  /** Undo a deleteRow: the row goes back at the same place. */
  restoreRow(d: DeletedPaletteRow): void {
    const row = [...d.row];
    const onlyEmpty = this.rows.length === 1 && this.rows[0].every((c) => c == null);
    if (d.replacedByEmpty && onlyEmpty) {
      this.rows = [row];   // (an all-empty row cannot hold the selection: nothing to move)
    } else {
      const at = Math.max(0, Math.min(this.rows.length, d.index));
      this.rows.splice(at, 0, row);
      if (this.selected && this.selected.row >= at) this.selected = { ...this.selected, row: this.selected.row + 1 };
    }
    this.save();
  }

  private load(): PaletteRow[] {
    try { return parsePaletteRows(this.storage?.getItem(PALETTES_STORAGE_KEY)); } catch { return [emptyPaletteRow()]; }
  }

  private save(): void {
    try { this.storage?.setItem(PALETTES_STORAGE_KEY, JSON.stringify({ v: 1, rows: this.rows })); } catch { /* storage blocked / full: this session only */ }
  }
}

function browserStorage(): PaletteStorage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

/** The app-wide palettes (one per user, every document), stored in this browser's localStorage. */
@Injectable({ providedIn: 'root' })
export class PalettesService extends PaletteBook {
  constructor() { super(browserStorage()); }
}

/** Callbacks of SquareGesture. */
export interface SquareGestureHandlers {
  tap(row: number, col: number): void;
  /** Long-press or double-tap. */
  link(row: number, col: number): void;
}

export const PALETTE_LONG_PRESS_MS = 450;
export const PALETTE_DOUBLE_TAP_MS = 300;
/** A press that moves further than this is not a tap (a scroll inside the popup, a slip). */
const TAP_SLOP_PX = 10;

/**
 * Tap / long-press / double-tap on a palette square from pointer events (pen, finger and mouse alike). A long press
 * links once its time is up (the release then does nothing); a second tap on the same square soon after the first
 * links instead of tapping again.
 */
export class SquareGesture {
  private press: { row: number; col: number; x: number; y: number; timer: ReturnType<typeof setTimeout> | null; fired: boolean } | null = null;
  private lastTap: { row: number; col: number; at: number } | null = null;

  constructor(private readonly h: SquareGestureHandlers,
              private readonly longPressMs = PALETTE_LONG_PRESS_MS,
              private readonly doubleTapMs = PALETTE_DOUBLE_TAP_MS) {}

  down(row: number, col: number, x: number, y: number): void {
    this.cancel();
    const press = { row, col, x, y, timer: null as ReturnType<typeof setTimeout> | null, fired: false };
    press.timer = setTimeout(() => {
      press.timer = null;
      press.fired = true;
      this.lastTap = null;
      this.h.link(row, col);
    }, this.longPressMs);
    this.press = press;
  }

  move(x: number, y: number): void {
    const p = this.press;
    if (p && !p.fired && Math.hypot(x - p.x, y - p.y) > TAP_SLOP_PX) this.cancel();
  }

  up(): void {
    const p = this.press;
    if (!p) return;
    this.press = null;
    if (p.timer) clearTimeout(p.timer);
    if (p.fired) return;
    const now = Date.now();
    const last = this.lastTap;
    if (last && last.row === p.row && last.col === p.col && now - last.at <= this.doubleTapMs) {
      this.lastTap = null;
      this.h.link(p.row, p.col);
      return;
    }
    this.lastTap = { row: p.row, col: p.col, at: now };
    this.h.tap(p.row, p.col);
  }

  cancel(): void {
    if (this.press?.timer) clearTimeout(this.press.timer);
    this.press = null;
  }
}
