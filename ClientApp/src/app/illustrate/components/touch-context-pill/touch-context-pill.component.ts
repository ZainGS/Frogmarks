import { Component, ElementRef, EventEmitter, HostBinding, Input, Output, ViewChild } from '@angular/core';
import { pillButtons, type ContextPillButton, type ContextPillSpec, type ModeHost } from '../illustration/editor-keymap';

/**
 * Contextual touch pill (mobile-parity TOUCH-10; replaced the floating Undo / Redo / Del / Dup / Esc / ✓ bar).
 * The editor shows it on a coarse (touch) pointer only:
 *  - while a modal state is waiting for Enter / Esc (a selection transform, the mesh-edit knife, the Edit Mesh Chamfer
 *    — its amount field, segments − / + and Snap —, decal placement, LiveText editing, the 3D keyboard transform):
 *    Apply / Cancel;
 *  - in the 3D view: the modifier keys / shortcuts a tablet lacks, as tool buttons (Multi = Shift-select, Snap = Ctrl,
 *    Frame, and in Edit Mesh Grab / Rotate / Scale; during that transform X / Y / Z + the typed amount).
 * The buttons run the same actions the keys run (editor-keymap CONTEXT_PILLS), through IllustrationComponent.
 * Bottom centre of the free canvas strip: clear of the colour picker (left), the zoom widget + the side panel (right)
 * and, with animation on, above the timeline.
 */
@Component({
  selector: 'app-touch-context-pill',
  templateUrl: './touch-context-pill.component.html',
  styleUrls: ['./touch-context-pill.component.scss'],
})
export class TouchContextPillComponent {
  @Input() spec!: ContextPillSpec;
  /** The editor (toggle states, which buttons the engine supports). */
  @Input() ed: ModeHost | null = null;
  /** Animation timeline open: sit above it (like the zoom widget). */
  @Input() @HostBinding('class.above-timeline') aboveTimeline = false;
  /** The right panel column is showing: keep clear of it. */
  @Input() @HostBinding('class.side-panel-open') sidePanelOpen = true;
  @Output() apply = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();
  /** A tool button was tapped. */
  @Output() action = new EventEmitter<ContextPillButton>();
  /** The typed amount changed (the number field). */
  @Output() numeric = new EventEmitter<string>();

  @HostBinding('attr.data-mode') get mode(): string { return this.spec?.mode ?? ''; }

  get buttons(): ContextPillButton[] { return this.spec && this.ed ? pillButtons(this.spec, this.ed) : (this.spec?.buttons ?? []).slice(); }

  isPressed(b: ContextPillButton): boolean { return !!(b.pressed && this.ed && b.pressed(this.ed)); }

  /** The number field waits for an axis (the engine ignores digits without one). */
  get axisPicked(): boolean { return !!this.ed?.shapeManager?.shortcutAxis3D; }

  /** The number field takes input: the spec's rule (the Chamfer: once something is picked), else an axis is picked. */
  get numericEnabled(): boolean {
    return this.spec?.numericEnabled ? (!!this.ed && this.spec.numericEnabled(this.ed)) : this.axisPicked;
  }

  /** The field's text: the spec's live value (the Chamfer amount while dragging) — but never under the user's caret. */
  get numericText(): string {
    const el = this.numEl?.nativeElement;
    if (!this.spec?.numericValue || !this.ed || (el && typeof document !== 'undefined' && document.activeElement === el)) return el?.value ?? '';
    return this.spec.numericValue(this.ed);
  }

  /** The hint line: the spec's live hint (the Chamfer's phase / segments) or its fixed one. */
  get hintText(): string {
    return this.spec?.hintFor && this.ed ? this.spec.hintFor(this.ed) : (this.spec?.hint ?? '');
  }

  /** Apply is shown (the Chamfer hides it until a corner / edge is picked). */
  get applyAvailable(): boolean { return !this.spec?.apply?.available || (!!this.ed && this.spec.apply.available(this.ed)); }

  trackButton(_: number, b: ContextPillButton): string { return b.id; }

  @ViewChild('num') private numEl?: ElementRef<HTMLInputElement>;

  /** A tool button: run it; a new axis clears the engine's typed amount, so the field's value is sent again. */
  onTool(b: ContextPillButton): void {
    this.action.emit(b);
    const v = this.numEl?.nativeElement.value;
    if (this.spec?.numeric && v) this.numeric.emit(v);
  }
}
