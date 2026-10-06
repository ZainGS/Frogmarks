import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { RasterAnimationService } from '../../../shared/services/raster/raster-animation.service';

/**
 * The current timeline frame as text ("F12") — for readouts outside the timeline (the 3D panel's camera row). Its own
 * component so a frame of playback refreshes just this text: playback runs outside the Angular zone (no app tick per
 * frame), so it detectChanges itself on currentFrame$ instead of re-checking the whole editor.
 */
@Component({
  selector: 'app-timeline-frame-badge',
  standalone: false,
  template: 'F{{ frame }}',
})
export class TimelineFrameBadgeComponent implements OnInit, OnDestroy {
  constructor(private animationService: RasterAnimationService, private cdr: ChangeDetectorRef) {}

  /** Read from the engine (as the editor's old getter did) — currentFrame$ only says when to look again. */
  get frame(): number { return this.animationService.getCurrentFrame?.() ?? 1; }

  private _sub: Subscription | null = null;

  ngOnInit(): void {
    let ready = false;
    this._sub = this.animationService.currentFrame$.subscribe(() => {
      if (ready && !NgZone.isInAngularZone()) this.cdr.detectChanges();
    });
    ready = true;
  }

  ngOnDestroy(): void { this._sub?.unsubscribe(); }
}
