import { Component, EventEmitter, Output } from '@angular/core';

export type TouchAction = 'undo' | 'redo' | 'delete' | 'duplicate' | 'escape' | 'enter';

/**
 * Floating touch action bar (mobile-parity TOUCH-10): on-screen buttons for the editor actions that are
 * keyboard-only today. The editor routes each one (IllustrationComponent.onTouchAction): Undo / Redo per context like
 * the Ctrl+Z keymap (editor-keymap.ts routeUndo), and Delete / Duplicate / Esc / Enter as the same key events the
 * keyboard sends, so every engine tool (mesh edit, path edit, pen, gizmo modal, selection transform) reacts as usual.
 */
@Component({
  selector: 'app-touch-action-bar',
  templateUrl: './touch-action-bar.component.html',
  styleUrls: ['./touch-action-bar.component.scss'],
})
export class TouchActionBarComponent {
  @Output() action = new EventEmitter<TouchAction>();

  readonly buttons: { id: TouchAction; label: string; title: string }[] = [
    { id: 'undo', label: '↶', title: 'Undo' },
    { id: 'redo', label: '↷', title: 'Redo' },
    { id: 'delete', label: 'Del', title: 'Delete the selection' },
    { id: 'duplicate', label: 'Dup', title: 'Duplicate (Ctrl+D)' },
    { id: 'escape', label: 'Esc', title: 'Cancel (Esc)' },
    { id: 'enter', label: '✓', title: 'Done / confirm (Enter)' },
  ];
}
