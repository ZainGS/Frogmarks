import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild } from '@angular/core';

/**
 * Inline "are you sure?" strip for one-tap destructive panel buttons that have no undo (Clear city, Remove Hair,
 * Delete block …): shown in place of the button, it says what will be lost, with the destructive action and Cancel
 * (focused, so Enter / a stray second tap doesn't delete). Esc cancels. The owner shows it with *ngIf and hides it
 * on either output.
 */
@Component({
  selector: 'fm-confirm-strip',
  standalone: true,
  templateUrl: './confirm-strip.component.html',
  styleUrls: ['./confirm-strip.component.scss'],
})
export class ConfirmStripComponent implements AfterViewInit {
  /** The question, naming what goes ("Delete this block and all its buildings?"). */
  @Input() text = 'Are you sure?';
  /** The destructive button's label. */
  @Input() action = 'Delete';
  @Output() ok = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  @ViewChild('cancelBtn') private cancelBtn?: ElementRef<HTMLButtonElement>;

  ngAfterViewInit(): void {
    this.cancelBtn?.nativeElement.focus({ preventScroll: true });
  }

  @HostListener('keydown.escape', ['$event'])
  onEscape(e: Event): void {
    e.stopPropagation();
    this.cancel.emit();
  }

  confirm(e: Event): void {
    e.stopPropagation();
    this.ok.emit();
  }

  dismiss(e: Event): void {
    e.stopPropagation();
    this.cancel.emit();
  }
}
