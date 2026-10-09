import { ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { RasterAnimationService } from '../../../shared/services/raster/raster-animation.service';

/**
 * The current timeline frame as text ("F12") — for readouts outside the timeline (the 3D panel's camera row). Its own
 * component so a frame of playback refreshes just this text: playback runs outside the Angular zone (no app tick per
 * frame), so it detectChanges itself on currentFrame$ instead of re-checking the whole editor.
 *
 * The host is a one-line box with size + layout containment, its width = the text's ("F" + the frame's digits, in ch
 * of the panel's monospace font — so it looks as the plain text did) and set only when the digit count changes: the
 * per-frame text change lays out only this box, never the page (playback perf A3, 2026-10-09).
 */
@Component({
  selector: 'app-timeline-frame-badge',
  standalone: false,
  template: 'F{{ frame }}',
  styles: [':host { display: inline-block; vertical-align: top; height: 1lh; white-space: nowrap; contain: size layout style; }'],
})
export class TimelineFrameBadgeComponent implements OnInit, OnDestroy {
  constructor(private animationService: RasterAnimationService, private cdr: ChangeDetectorRef, private host: ElementRef<HTMLElement>) {}

  /** Read from the engine (as the editor's old getter did) — currentFrame$ only says when to look again. */
  get frame(): number { return this.animationService.getCurrentFrame?.() ?? 1; }

  private _sub: Subscription | null = null;
  private _chars = -1;

  ngOnInit(): void {
    let ready = false;
    this._sub = this.animationService.currentFrame$.subscribe(() => {
      this._fitWidth();
      if (ready && !NgZone.isInAngularZone()) this.cdr.detectChanges();
    });
    ready = true;
  }

  /** "F" + the digits (the box doesn't size itself: it is size-contained). */
  private _fitWidth(): void {
    const chars = 1 + String(this.frame).length;
    if (chars === this._chars) return;
    this._chars = chars;
    this.host.nativeElement.style.width = chars + 'ch';
  }

  ngOnDestroy(): void { this._sub?.unsubscribe(); }
}
