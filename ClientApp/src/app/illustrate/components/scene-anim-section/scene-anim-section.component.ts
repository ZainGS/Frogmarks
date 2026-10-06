import { ChangeDetectorRef, Component, NgZone, OnDestroy, OnInit } from '@angular/core';
import { Subscription, merge } from 'rxjs';
import { SceneAnimationService } from '../../services/scene-animation.service';

/** Global tab: 3D animation player + timeline sync, and the Play-mode player object (locomotion, blend, overlay). A view over SceneAnimationService (refactor-plan 2.7e). */
@Component({
  selector: 'app-scene-anim-section',
  templateUrl: './scene-anim-section.component.html',
  styleUrls: ['./scene-anim-section.component.scss'],
})
export class SceneAnimSectionComponent implements OnInit, OnDestroy {
  constructor(public anim: SceneAnimationService, private cdr: ChangeDetectorRef) {}

  private _sub: Subscription | null = null;

  /** The frame readout: playback (raster timeline or 3D player) runs outside the Angular zone — no app tick per
   *  frame — so refresh this section's own view when the frame moves. */
  ngOnInit(): void {
    let ready = false;
    this._sub = merge(this.anim.animationService.currentFrame$, this.anim.scene3dPlayerFrame$).subscribe(() => {
      if (ready && !NgZone.isInAngularZone()) this.cdr.detectChanges();
    });
    ready = true;
  }

  ngOnDestroy(): void { this._sub?.unsubscribe(); }
}
