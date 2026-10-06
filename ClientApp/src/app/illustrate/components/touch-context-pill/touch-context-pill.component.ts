import { Component, EventEmitter, HostBinding, Input, Output } from '@angular/core';
import type { ContextPillSpec } from '../illustration/editor-keymap';

/**
 * Contextual Apply / Cancel pill (mobile-parity TOUCH-10; replaced the floating Undo / Redo / Del / Dup / Esc / ✓ bar).
 * The editor shows it on a coarse (touch) pointer only, while a modal state is waiting for Enter / Esc: a selection
 * transform, the mesh-edit knife, decal placement, LiveText editing (editor-keymap CONTEXT_PILLS / activeContextPill).
 * The buttons run the same MODE_ACTIONS the keys run, through IllustrationComponent.runContextPill. Bottom centre of
 * the free canvas strip: clear of the colour picker (left), the zoom widget + the side panel (right) and, with
 * animation on, above the timeline.
 */
@Component({
  selector: 'app-touch-context-pill',
  templateUrl: './touch-context-pill.component.html',
  styleUrls: ['./touch-context-pill.component.scss'],
})
export class TouchContextPillComponent {
  @Input() spec!: ContextPillSpec;
  /** Animation timeline open: sit above it (like the zoom widget). */
  @Input() @HostBinding('class.above-timeline') aboveTimeline = false;
  /** The right panel column is showing: keep clear of it. */
  @Input() @HostBinding('class.side-panel-open') sidePanelOpen = true;
  @Output() apply = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  @HostBinding('attr.data-mode') get mode(): string { return this.spec?.mode ?? ''; }
}
