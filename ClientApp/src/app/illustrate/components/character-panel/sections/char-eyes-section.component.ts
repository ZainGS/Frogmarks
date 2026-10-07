import { ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, ViewChild } from '@angular/core';
import { CharacterPanelComponent } from '../character-panel.component';
import { CharFaceService } from '../char-face.service';

/** Edit Character › Expressions, procedural / drawn eyes, blink, gaze pad.
 *  Markup only: state and actions live in the panel's services; `cp` is the panel (outputs, section, part textures). */
@Component({
  selector: 'app-char-eyes-section',
  templateUrl: './char-eyes-section.component.html',
  styleUrls: ['./char-eyes-section.component.scss'],
})
export class CharEyesSectionComponent implements OnDestroy {
  constructor(public cp: CharacterPanelComponent, public face: CharFaceService, private ngZone: NgZone, private cdr: ChangeDetectorRef) {}

  /** M3 (zone audit): the gaze pad's pointermove is listened OUTSIDE the zone (as a template binding every hover move
   *  ran an app change detection). While dragging, each move aims the eyes and re-renders only this section (the
   *  dot); the pointerup binding runs the one app change detection when the drag ends. */
  private _gazeEl: HTMLElement | null = null;
  @ViewChild('gazePad') set gazePadRef(ref: ElementRef<HTMLElement> | undefined) {
    const el = ref?.nativeElement ?? null;
    if (el === this._gazeEl) return;
    this._gazeEl?.removeEventListener('pointermove', this._onGazeMoveOutsideZone);
    this._gazeEl = el;
    if (el) this.ngZone.runOutsideAngular(() => el.addEventListener('pointermove', this._onGazeMoveOutsideZone));
  }
  private readonly _onGazeMoveOutsideZone = (e: PointerEvent): void => {
    if (this._gazeEl && this.face.scene3dGazePadPointerMove(e, this._gazeEl)) this.cdr.detectChanges();
  };

  ngOnDestroy(): void {
    this._gazeEl?.removeEventListener('pointermove', this._onGazeMoveOutsideZone);
    this._gazeEl = null;
  }
}
