/**
 * The operation pill's value logic (mode-op-pill.component): clamping, scrubbing, − / + steps, typed input, display
 * and the axis chips. Plain functions so they are testable without a DOM.
 */
import type { ModeOpParam } from './mode-chrome.types';

/** Default step of a 'number' param without one. */
export const DEFAULT_NUMBER_STEP = 0.01;
/** Scrub: CSS px of drag per step (an int moves one unit per 8 px, a number one step per 2 px). */
export const SCRUB_PX_PER_STEP = { int: 8, number: 2 } as const;
/** Scrub with Shift (fine) moves this much slower. */
export const SCRUB_FINE_FACTOR = 10;
/** A press on the label becomes a scrub after this much horizontal drag (less = a tap). */
export const SCRUB_START_PX = 3;

export function paramStep(p: ModeOpParam): number {
  if (p.kind === 'int') return p.step && p.step > 0 ? Math.max(1, Math.round(p.step)) : 1;
  return p.step && p.step > 0 ? p.step : DEFAULT_NUMBER_STEP;
}

/** Decimals shown for a number param: those of its step (at most 4). Ints: 0. */
export function paramDecimals(p: ModeOpParam): number {
  if (p.kind === 'int') return 0;
  const s = paramStep(p);
  if (s >= 1 && Number.isInteger(s)) return 0;
  const txt = String(s);
  const e = /e-(\d+)$/.exec(txt);
  if (e) return Math.min(4, Number(e[1]));
  const dot = txt.indexOf('.');
  return dot < 0 ? 0 : Math.min(4, txt.length - dot - 1);
}

/** Clamp to [min, max], round ints, and drop float noise beyond the shown precision. NaN → min ?? 0. */
export function clampParamValue(p: ModeOpParam, v: number): number {
  let x = Number.isFinite(v) ? v : (p.min ?? 0);
  if (p.min !== undefined && x < p.min) x = p.min;
  if (p.max !== undefined && x > p.max) x = p.max;
  if (p.kind === 'int') return Math.round(x);
  const f = Math.pow(10, Math.max(paramDecimals(p), 0) + 2);   // keep two extra digits while scrubbing (no drift)
  return Math.round(x * f) / f;
}

/**
 * The value after a horizontal scrub of `dx` CSS px from `start`, in whole steps (an int: one per 8 px; a number: one
 * step per 2 px, or a tenth of a step per 2 px with Shift = fine). Clamped.
 */
export function scrubParamValue(p: ModeOpParam, start: number, dx: number, fine = false): number {
  const s0 = Number.isFinite(start) ? start : 0;
  if (p.kind === 'int') return clampParamValue(p, s0 + Math.trunc(dx / SCRUB_PX_PER_STEP.int) * paramStep(p));
  const unit = fine ? paramStep(p) / SCRUB_FINE_FACTOR : paramStep(p);
  return clampParamValue(p, s0 + Math.trunc(dx / SCRUB_PX_PER_STEP.number) * unit);
}

/** − / + : one step down / up, clamped. */
export function stepParamValue(p: ModeOpParam, value: number, dir: 1 | -1): number {
  return clampParamValue(p, (Number.isFinite(value) ? value : 0) + dir * paramStep(p));
}

/**
 * Typed text → value, or null when it is not a number. Accepts a comma decimal ('0,5'), surrounding spaces and the
 * param's unit ('45°', '2 m'). The result is clamped.
 */
export function parseTypedParamValue(p: ModeOpParam, text: string): number | null {
  let t = String(text ?? '').trim();
  if (p.unit && t.toLowerCase().endsWith(p.unit.toLowerCase())) t = t.slice(0, t.length - p.unit.length).trim();
  t = t.replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? clampParamValue(p, v) : null;
}

/** The value as shown (precision from the step, plus the unit). */
export function formatParamValue(p: ModeOpParam, value: unknown): string {
  const v = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(v)) return '—';
  const txt = p.kind === 'int' ? String(Math.round(v)) : v.toFixed(paramDecimals(p));
  return p.unit ? `${txt}${p.unit.length > 1 && !/^[°%]/.test(p.unit) ? ' ' : ''}${p.unit}` : txt;
}

/** The value as an editable string (no unit) when typing starts. */
export function editTextForParam(p: ModeOpParam, value: unknown): string {
  const v = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(v)) return '';
  return p.kind === 'int' ? String(Math.round(v)) : String(Number(v.toFixed(paramDecimals(p))));
}

export const DEFAULT_AXIS_OPTIONS: { id: string; label: string }[] = [
  { id: 'x', label: 'X' }, { id: 'y', label: 'Y' }, { id: 'z', label: 'Z' },
];

/** The axis chips of a param: its options or X / Y / Z, plus None for a single-pick param. */
export function axisChips(p: ModeOpParam): { id: string | null; label: string }[] {
  const base: { id: string | null; label: string }[] = (p.options && p.options.length ? p.options : DEFAULT_AXIS_OPTIONS).slice();
  return Array.isArray(p.value) ? base : [...base, { id: null, label: 'None' }];
}

/** Is this axis chip on? (null = the None chip.) */
export function axisChipOn(value: unknown, id: string | null): boolean {
  if (Array.isArray(value)) return id === null ? value.length === 0 : value.includes(id);
  return id === null ? value === null || value === undefined || value === '' || value === 'none' : value === id;
}

/**
 * The value after tapping an axis chip. Multi (array value): toggles that axis, kept in the chips' order. Single:
 * picks it; tapping the picked axis again (or None) clears it to null.
 */
export function toggleAxisValue(p: ModeOpParam, id: string | null): string | string[] | null {
  const v = p.value;
  if (Array.isArray(v)) {
    if (id === null) return [];
    const on = new Set<string>(v as string[]);
    if (on.has(id)) on.delete(id); else on.add(id);
    const order = axisChips(p).map(c => c.id).filter((x): x is string => x !== null);
    return order.filter(x => on.has(x)).concat([...on].filter(x => !order.includes(x)));
  }
  if (id === null || v === id) return null;
  return id;
}
