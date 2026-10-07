import { AfterViewChecked, ChangeDetectorRef, Directive, Input, OnChanges } from '@angular/core';

/**
 * Stops change-checking a permanently mounted panel while it is hidden (zone audit 2026-10-07, OnPush phase 1 / D.1).
 * Several big editor panels stay in the DOM and only slide out (`[class.visible]` / `[hidden]` on a wrapper), so every
 * app tick used to re-check their whole templates.
 *
 * Put it on the panel's COMPONENT element with the panel's visibility:
 *   `<app-world-panel [fmDetachWhenHidden]="scene3dWorldPanelOpen && !uiHidden" ...>`
 * On a component's host element a directive's ChangeDetectorRef IS that component's view, so detach() skips the panel
 * and everything inside it.
 *
 * All the switching happens inside the parent's change-detection pass that changes the input:
 *  - hide: the panel is checked once more in that pass (it renders its closing state; *ngIf'd children it closes are
 *    torn down) and detached right after it (ngAfterViewChecked);
 *  - show: reattached (+ markForCheck, for an OnPush panel) in ngOnChanges, which runs BEFORE Angular checks the panel
 *    in that same pass — so the panel renders its current state in the very pass that adds the wrapper's `visible`
 *    class, and the slide-in starts with fresh content. (The same result as reattach() + detectChanges(), without a
 *    nested check.)
 * While detached the panel still gets its inputs, ngOnChanges / ngDoCheck (the parent runs those), its outputs still
 * emit and its services keep their state — only its template is not re-rendered until it shows again.
 */
@Directive({ selector: '[fmDetachWhenHidden]', standalone: true })
export class DetachWhenHiddenDirective implements OnChanges, AfterViewChecked {
  /** The panel is showing. */
  @Input('fmDetachWhenHidden') visible = true;

  private _detached = false;
  private _detachAfterCheck = false;

  constructor(private cdr: ChangeDetectorRef) {}

  /** The panel's view is detached right now. */
  get detached(): boolean { return this._detached; }

  ngOnChanges(): void {
    if (this.visible) {
      this._detachAfterCheck = false;
      if (this._detached) {
        this._detached = false;
        this.cdr.reattach();
        this.cdr.markForCheck();
      }
    } else if (!this._detached) {
      this._detachAfterCheck = true;
    }
  }

  ngAfterViewChecked(): void {
    if (!this._detachAfterCheck) return;
    this._detachAfterCheck = false;
    this._detached = true;
    this.cdr.detach();
  }
}
