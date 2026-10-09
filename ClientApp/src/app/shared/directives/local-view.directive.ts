import { Directive, EmbeddedViewRef, Input, OnDestroy, OnInit, TemplateRef, ViewContainerRef } from '@angular/core';

/** What a `*fmLocalView` hands its owner: re-check just this view (outside the zone), or null once it is gone. */
export type LocalViewRefresh = (() => void) | null;

/**
 * Renders its template as an embedded view the owner can re-check ON ITS OWN (playback perf A4, 2026-10-09): for a
 * small readout fed from outside the Angular zone (a poll), `refresh()` updates just that block instead of an
 * ngZone.run (a full app tick) per new value. The view is still checked with its parent as usual, and it keeps the
 * parent template's context + styles (it is declared there).
 *
 *   <div *ngIf="hudVisible" class="hud"><ng-container *fmLocalView="stats.attachHudView">…</ng-container></div>
 *
 * The input is called with the refresh function once the view exists, and with null when it is destroyed.
 */
@Directive({ selector: '[fmLocalView]', standalone: true })
export class LocalViewDirective implements OnInit, OnDestroy {
  @Input('fmLocalView') attach: ((refresh: LocalViewRefresh) => void) | null | undefined = null;

  private _view: EmbeddedViewRef<unknown> | null = null;

  constructor(private tpl: TemplateRef<unknown>, private vcr: ViewContainerRef) {}

  ngOnInit(): void {
    const view = this.vcr.createEmbeddedView(this.tpl);
    this._view = view;
    this.attach?.(() => { if (this._view === view && !view.destroyed) view.detectChanges(); });
  }

  ngOnDestroy(): void {
    this._view = null;
    this.attach?.(null);
  }
}
