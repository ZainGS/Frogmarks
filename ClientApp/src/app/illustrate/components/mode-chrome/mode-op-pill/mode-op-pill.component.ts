import { Component, ElementRef, EventEmitter, HostBinding, Input, Output, ViewChild } from '@angular/core';
import type { ModeOpParam, ModeOpParamChange } from '../mode-chrome.types';
import {
  SCRUB_START_PX, axisChipOn, axisChips, editTextForParam, formatParamValue, parseTypedParamValue, scrubParamValue,
  stepParamValue, toggleAxisValue,
} from '../op-pill-logic';

interface ScrubState { id: string; pointerId: number; startX: number; start: number; moved: boolean; last: number; }

/**
 * Operation pill (UI review 2026-10-07 §4 item 3): bottom centre of the viewport on every device (above the timeline
 * with class="above-timeline"). The active tool's live parameters + Apply / Cancel; on desktop it doubles as "adjust
 * last operation". Controlled: it never changes `params` itself — it emits paramChange and the mode passes the new
 * value back in.
 *
 * number / int: drag sideways on the label to scrub (mouse, pen or finger; Shift = fine), tap the value (or the label)
 * to type, − / + on a touch screen, ↑ / ↓ on the focused value. toggle: a pressed button. axis: X / Y / Z chips (+ None
 * for a single pick; an array value = multi-select). choice: chips. button: emits action(id).
 * Keys, only while focus is inside the pill (the mode's keymap owns the global keys): Enter = apply, Esc = cancel.
 */
@Component({
  selector: 'app-mode-op-pill',
  templateUrl: './mode-op-pill.component.html',
  styleUrls: ['./mode-op-pill.component.scss'],
})
export class ModeOpPillComponent {
  @Input() title = '';
  @HostBinding('attr.title') readonly hostTitle = null;
  @Input() params: ModeOpParam[] = [];
  @Input() showApplyCancel = true;
  @Input() applyLabel = 'Apply';
  @Input() cancelLabel = 'Cancel';
  @Input() note?: string;
  /** Apply is shown but greyed out (e.g. nothing selected for the op yet); Enter does nothing then. */
  @Input() applyDisabled = false;
  /** false = Apply only (Edit Mesh / Armature: turning the tool off replaces Cancel; Esc still cancels). */
  @Input() showCancel = true;
  /** A Frame button (frame the selection) at the start of the pill; emits frame. */
  @Input() showFrame = false;

  @Output() paramChange = new EventEmitter<ModeOpParamChange>();
  @Output() frame = new EventEmitter<void>();
  @Output() apply = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
  @Output() action = new EventEmitter<string>();

  /** The number param being typed into (its value is an input field). */
  editingId: string | null = null;
  editText = '';
  private scrub: ScrubState | null = null;

  @ViewChild('pill', { static: true }) private pillEl?: ElementRef<HTMLElement>;
  /** Focus + select the field as soon as it appears. */
  @ViewChild('edit') set editEl(el: ElementRef<HTMLInputElement> | undefined) {
    if (el) { el.nativeElement.focus(); el.nativeElement.select(); }
  }

  isNumeric(p: ModeOpParam): boolean { return p.kind === 'number' || p.kind === 'int'; }
  format(p: ModeOpParam): string { return formatParamValue(p, p.value); }
  chips(p: ModeOpParam): { id: string | null; label: string }[] {
    return p.kind === 'axis' ? axisChips(p) : (p.options ?? []);
  }
  chipOn(p: ModeOpParam, id: string | null): boolean { return p.kind === 'axis' ? axisChipOn(p.value, id) : p.value === id; }

  private emit(p: ModeOpParam, value: unknown): void {
    if (p.disabled) return;
    this.paramChange.emit({ id: p.id, value });
  }

  pickChip(p: ModeOpParam, id: string | null): void {
    if (p.kind === 'axis') this.emit(p, toggleAxisValue(p, id));
    else if (id !== null && id !== p.value) this.emit(p, id);
  }

  toggle(p: ModeOpParam): void { this.emit(p, !p.value); }

  step(p: ModeOpParam, dir: 1 | -1): void {
    const v = stepParamValue(p, Number(p.value), dir);
    if (v !== p.value) this.emit(p, v);
  }

  runButton(p: ModeOpParam): void { if (!p.disabled) this.action.emit(p.id); }

  // ── text / select (added for the Armature pills) ────────────────────────────────────────────────────────────

  /** A text param's field: Enter commits (and blurs), Esc restores the value; no key reaches the mode's keymap. */
  onTextKey(ev: KeyboardEvent, p: ModeOpParam): void {
    const el = ev.target as HTMLInputElement;
    if (ev.key === 'Enter') {
      ev.preventDefault();
      this.commitText(p, el.value);
      el.blur();
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      el.value = p.value ?? '';
      el.blur();
    }
    ev.stopPropagation();
  }

  commitText(p: ModeOpParam, text: string): void {
    if (text !== (p.value ?? '')) this.emit(p, text);
  }

  pickSelect(p: ModeOpParam, id: string): void {
    if (id !== p.value) this.emit(p, id);
  }

  // ── Typing ──────────────────────────────────────────────────────────────────────────────────────────────────

  startEdit(p: ModeOpParam): void {
    if (p.disabled) return;
    this.editText = editTextForParam(p, p.value);
    this.editingId = p.id;
  }

  /** Commit the typed text (Enter / blur). Invalid text keeps the old value. */
  commitEdit(p: ModeOpParam, text: string, refocus = false): void {
    if (this.editingId !== p.id) return;
    this.editingId = null;
    const v = parseTypedParamValue(p, text);
    if (v !== null && v !== p.value) this.emit(p, v);
    if (refocus) this.focusValue(p.id);
  }

  cancelEdit(p: ModeOpParam): void {
    if (this.editingId !== p.id) return;
    this.editingId = null;
    this.focusValue(p.id);
  }

  onEditKey(ev: KeyboardEvent, p: ModeOpParam): void {
    if (ev.key === 'Enter') {
      ev.preventDefault(); ev.stopPropagation();
      this.commitEdit(p, (ev.target as HTMLInputElement).value, true);
    } else if (ev.key === 'Escape') {
      ev.preventDefault(); ev.stopPropagation();
      this.cancelEdit(p);
    } else {
      ev.stopPropagation();   // typing digits must not reach the mode's keymap (G / R / S / 1 / 2 / 3 …)
    }
  }

  /** ↑ / → step up, ↓ / ← step down on the focused value. */
  onValueKey(ev: KeyboardEvent, p: ModeOpParam): void {
    const dir = ev.key === 'ArrowUp' || ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowDown' || ev.key === 'ArrowLeft' ? -1 : 0;
    if (!dir) return;
    ev.preventDefault(); ev.stopPropagation();
    this.step(p, dir);
  }

  private focusValue(id: string): void {
    setTimeout(() => {
      const root = this.pillEl?.nativeElement;
      const el = root?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"] .mop-value`);
      el?.focus();
    });
  }

  // ── Scrubbing (drag sideways on the label) ──────────────────────────────────────────────────────────────────

  scrubDown(ev: PointerEvent, p: ModeOpParam): void {
    if (p.disabled || (ev.button ?? 0) !== 0) return;
    const start = Number(p.value);
    this.scrub = { id: p.id, pointerId: ev.pointerId, startX: ev.clientX, start, moved: false, last: start };
    try { (ev.currentTarget as Element | null)?.setPointerCapture?.(ev.pointerId); } catch { /* not capturable */ }
    ev.preventDefault();   // no text selection / focus steal while dragging
  }

  scrubMove(ev: PointerEvent, p: ModeOpParam): void {
    const s = this.scrub;
    if (!s || s.id !== p.id || s.pointerId !== ev.pointerId) return;
    const dx = ev.clientX - s.startX;
    if (!s.moved && Math.abs(dx) < SCRUB_START_PX) return;
    s.moved = true;
    const v = scrubParamValue(p, s.start, dx, ev.shiftKey);
    if (v !== s.last) { s.last = v; this.emit(p, v); }
  }

  scrubUp(ev: PointerEvent, p: ModeOpParam): void {
    const s = this.scrub;
    if (!s || s.id !== p.id || s.pointerId !== ev.pointerId) return;
    this.scrub = null;
    if (!s.moved) this.startEdit(p);   // a tap on the label types, like a tap on the value
  }

  scrubCancel(): void { this.scrub = null; }

  /** The param being scrubbed (styling). */
  get scrubbingId(): string | null { return this.scrub?.moved ? this.scrub.id : null; }

  // ── Keys inside the pill ────────────────────────────────────────────────────────────────────────────────────

  onKeyDown(ev: KeyboardEvent): void {
    if (!this.showApplyCancel || ev.defaultPrevented) return;
    const t = ev.target as HTMLElement | null;
    if (ev.key === 'Enter') {
      if (t?.tagName === 'INPUT') return;
      if (t?.closest('.mop-cancel')) { ev.preventDefault(); ev.stopPropagation(); this.cancel.emit(); return; }
      if (t?.closest('[data-kind="button"]')) return;   // an action button: its own click
      ev.preventDefault(); ev.stopPropagation();
      if (!this.applyDisabled) this.apply.emit();
    } else if (ev.key === 'Escape') {
      ev.preventDefault(); ev.stopPropagation();
      this.cancel.emit();
    }
  }

  trackId(_: number, x: { id: string | null }): string { return String(x.id); }
}
