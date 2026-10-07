import { Component, Input, Output, EventEmitter, OnInit, OnChanges, OnDestroy, SimpleChanges, ChangeDetectorRef, NgZone } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { ArmRigService } from './arm-rig.service';
import { ArmBindingService } from './arm-binding.service';
import { ArmAnimService } from './arm-anim.service';
import { ArmLibraryService } from './arm-library.service';
import { ArmSpringService } from './arm-spring.service';
import { ArmPickService } from './arm-pick.service';
import { ARMATURE_BG_MODES, ArmatureBgMode, ArmatureHost, ArmatureSession } from './arm-session';

// The shapes the arm-* services share (they moved to arm-session.ts; re-exported for older imports).
export type { ArmatureSkeleton, ArmatureJoint, ArmatureClip, NLASegmentDisplay, NLATrackDisplay } from './arm-session';

/** The panel-scoped services an Armature host provides (the classic panel and the mode chrome). */
export const ARMATURE_HOST_PROVIDERS = [ArmRigService, ArmBindingService, ArmAnimService, ArmLibraryService, ArmSpringService, ArmPickService];

/**
 * The classic Armature panel: one 280 px overlay with every section (Experimental › Classic Armature panel). The mode
 * chrome (<app-armature-mode>) is the default; both use the same section components and services.
 */
@Component({
  selector: 'app-armature-panel',
  templateUrl: './armature-panel.component.html',
  styleUrls: ['./armature-panel.component.scss'],
  providers: ARMATURE_HOST_PROVIDERS,
})
export class ArmaturePanelComponent implements ArmatureHost, OnInit, OnChanges, OnDestroy {
  @Input() shapeManager: ShapeManager = null;
  @Input() initialMeshId: string = '';
  /** The 3D canvas (one-shot "tap a joint" picks take its presses). */
  @Input() canvasEl: HTMLElement | null = null;
  @Output() closeRequest = new EventEmitter<void>();

  readonly bgModes = ARMATURE_BG_MODES;
  readonly session: ArmatureSession;

  constructor(public cdr: ChangeDetectorRef, public rig: ArmRigService, public binding: ArmBindingService, public anim: ArmAnimService,
              public library: ArmLibraryService, public spring: ArmSpringService, public pick: ArmPickService, zone: NgZone) {
    rig.bind(this); binding.bind(this); anim.bind(this); library.bind(this); spring.bind(this); pick.bind(this);
    this.session = new ArmatureSession(this, zone);
  }

  /** The background style (the header's dropdown). */
  get bgMode(): ArmatureBgMode { return this.session.bgMode; }
  set bgMode(m: ArmatureBgMode) { this.session.bgMode = m; }

  ngOnInit(): void {
    this.pick.canvas = this.canvasEl;
    this.session.start('rotate');
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['canvasEl']) this.pick.canvas = this.canvasEl;
    if (changes['shapeManager'] && !changes['shapeManager'].firstChange && this.shapeManager) this.session.shapeManagerChanged();
  }

  /** Every close path (the panel's ✕, the toolbar, Shift+Tab, another 3D mode taking over) removes this panel. */
  ngOnDestroy(): void {
    this.pick.cancel();
    this.session.stop();
  }

  /** The editor removes the panel; engine cleanup runs in ngOnDestroy. */
  close(): void {
    this.closeRequest.emit();
  }

  updateBgMode(): void {
    this.session.setBgMode(this.session.bgMode);
  }

  refreshAll(): void {
    this.session.refreshAll();
  }
}
