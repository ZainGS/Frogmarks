import {
  AfterViewInit, ChangeDetectorRef, Component, EventEmitter, Input, NgZone, OnChanges, OnDestroy, OnInit, Output,
  SimpleChanges,
} from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { ArmRigService } from '../armature-panel/arm-rig.service';
import { ArmBindingService } from '../armature-panel/arm-binding.service';
import { ArmAnimService } from '../armature-panel/arm-anim.service';
import { ArmLibraryService } from '../armature-panel/arm-library.service';
import { ArmSpringService } from '../armature-panel/arm-spring.service';
import { ArmPickService } from '../armature-panel/arm-pick.service';
import { ArmatureHost, ArmatureSession } from '../armature-panel/arm-session';
import { ARMATURE_HOST_PROVIDERS } from '../armature-panel/armature-panel.component';
import { armApi, pickArmatureJoint, selectArmatureJoint } from '../armature-panel/arm-engine';
import { ExperimentalSettingsService } from '../../services/experimental-settings.service';
import { TouchUiService } from '../../services/touch-ui.service';
import { RasterAnimationService } from 'app/shared/services/raster/raster-animation.service';
import { NotifyService } from 'app/shared/services/notify/notify.service';
import { LongPressDetector, type LongPressPointer } from '../mode-chrome/long-press';
import type { ModeMenuItem, ModeOpParamChange, ModeRadialItem, ModeSegment, ModeTool } from '../mode-chrome/mode-chrome.types';
import type { ArmatureKeyTarget } from '../illustration/mode-keymap';
import {
  ARM_SEGMENTS, ARM_WORKSPACES, ArmOpPill, ArmOpState, ArmSegmentId, ArmTimelineGuard, ArmToolId, ArmWorkspace,
  armMenuItems, armRadialItems, buildArmOpPill, loadArmWorkspace, saveArmWorkspace, segmentForTool, switchArmTool,
  toolForSegment, toolForWorkspace, toolsFor,
} from './armature-mode.logic';

const NO_SEGMENTS: ModeSegment[] = [];

/**
 * Armature on the shared mode chrome (UI review 2026-10-07 §4; components/mode-chrome/README.md): the header bar (Pose /
 * Edit Bones / Weight, Rig | Animate, Multi, Undo / Redo, Frame, ⋯, Done), the left tool strip, the operation pill for
 * the active tool, the long-press radial on a joint and the right properties panel — Rig: skeletons, joints, joint
 * properties, constraints, bind, weight paint, spring bones; Animate: preset poses, pose library, clips, NLA, the
 * libraries, retarget, with the editor's timeline shown. The sections and services are the classic panel's
 * (armature-panel/sections, arm-*.service), so both stay in step. Every newer Salsa call is typeof-guarded
 * (arm-engine.ts); the old dist keeps everything it could do before.
 */
@Component({
  selector: 'app-armature-mode',
  templateUrl: './armature-mode.component.html',
  styleUrls: ['./armature-mode.component.scss'],
  providers: ARMATURE_HOST_PROVIDERS,
})
export class ArmatureModeComponent implements ArmatureHost, ArmatureKeyTarget, OnInit, OnChanges, AfterViewInit, OnDestroy {
  @Input() shapeManager: ShapeManager = null;
  @Input() initialMeshId = '';
  /** The 3D canvas: the long-press radial and the one-shot joint picks listen on it. */
  @Input() canvasEl: HTMLElement | null = null;
  /** The chrome is shown (the editor's modeChromeVisible: false while the UI is hidden). The armature session stays. */
  @Input() chromeVisible = true;
  /** The animation timeline is open: the pill and the props panel sit above it. */
  @Input() aboveTimeline = false;

  @Output() undo = new EventEmitter<void>();
  @Output() redo = new EventEmitter<void>();
  @Output() done = new EventEmitter<void>();
  @Output() shortcuts = new EventEmitter<void>();
  /** The chrome appeared / went (mount, Toggle UI, leave): the editor moves the 3D nav gizmo below the header bar. */
  @Output() chromeLayout = new EventEmitter<void>();

  readonly workspaces = ARM_WORKSPACES;
  readonly session: ArmatureSession;

  workspace: ArmWorkspace = loadArmWorkspace();
  tool: ArmToolId = 'rotate';
  segment: ArmSegmentId = 'pose';
  tools: ModeTool[] = toolsFor(this.workspace);
  segments: ModeSegment[] = this.workspace === 'rig' ? ARM_SEGMENTS : NO_SEGMENTS;

  // Pill state (Rotate / Move typed amounts, Add Bone name, Key frame, Rename)
  axis: 'x' | 'y' | 'z' | null = null;
  rotateDeg = 0;
  moveAmount = 0;
  newBoneName = '';
  keyFrame = 0;
  renameIdx: number | null = null;
  renameDraft = '';

  private _opPill: ArmOpPill | null = null;
  private _menuItems: ModeMenuItem[] = [];
  radial: { open: boolean; x: number; y: number; items: ModeRadialItem[]; title: string; jointIdx: number | null } =
    { open: false, x: 0, y: 0, items: [], title: '', jointIdx: null };

  private readonly timeline = new ArmTimelineGuard();
  private readonly longPress: LongPressDetector;
  private detachLongPress: (() => void) | null = null;
  private pillKey = '';
  private menuKey = '';
  /** The additive latch was switched on from here (switched off again on leave). */
  private latchOn = false;

  constructor(public cdr: ChangeDetectorRef, public rig: ArmRigService, public binding: ArmBindingService, public anim: ArmAnimService,
              public library: ArmLibraryService, public spring: ArmSpringService, public pick: ArmPickService,
              public exp: ExperimentalSettingsService, private touchUi: TouchUiService, private animation: RasterAnimationService,
              private notify: NotifyService, private zone: NgZone) {
    rig.bind(this); binding.bind(this); anim.bind(this); library.bind(this); spring.bind(this); pick.bind(this);
    this.session = new ArmatureSession(this, zone, () => this.cdr.markForCheck());
    this.longPress = new LongPressDetector({ onLongPress: (p) => this.zone.run(() => this.openRadialAt(p)) });
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.pick.canvas = this.canvasEl;
    this.session.start('rotate');
    this.applyTool('rotate', 'rotate');
    if (this.workspace === 'animate') this.timeline.enter(() => this.timelineOn, (on) => this.setTimeline(on));
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['canvasEl'] && !changes['canvasEl'].firstChange) {
      this.pick.canvas = this.canvasEl;
      this.attachLongPress();
    }
    if (changes['shapeManager'] && !changes['shapeManager'].firstChange && this.shapeManager) this.session.shapeManagerChanged();
    if (changes['chromeVisible'] && !changes['chromeVisible'].firstChange) this.chromeLayout.emit();
  }

  ngAfterViewInit(): void {
    this.attachLongPress();
    this.chromeLayout.emit();
  }

  /** The pill for the active tool. Rebuilt only when what it shows changed: the chrome wants stable references. */
  get opPill(): ArmOpPill | null {
    const s = this.opState();
    const key = this.tool + '|' + JSON.stringify(s);
    if (key !== this.pillKey) { this.pillKey = key; this._opPill = buildArmOpPill(this.tool, s); }
    return this._opPill;
  }

  /** The header's ⋯ menu (memoised like the pill). */
  get menuItems(): ModeMenuItem[] {
    const m = { bgMode: this.session.bgMode, devTools: this.exp.devTools };
    const key = m.bgMode + '|' + m.devTools;
    if (key !== this.menuKey) { this.menuKey = key; this._menuItems = armMenuItems(m); }
    return this._menuItems;
  }

  ngOnDestroy(): void {
    this.detachLongPress?.();
    this.detachLongPress = null;
    this.pick.cancel();
    if (this.latchOn) armApi(this.shapeManager).setAdditiveSelect3D?.(false);
    // The editor restores the timeline in closeArmaturePanel (restoreTimeline) before this view goes; this covers any
    // other teardown, after the current change detection.
    if (this.timeline.active) void Promise.resolve().then(() => this.restoreTimeline());
    this.session.stop();
    this.chromeLayout.emit();
  }

  private attachLongPress(): void {
    this.detachLongPress?.();
    this.detachLongPress = null;
    const el = this.canvasEl;
    if (el) this.detachLongPress = this.zone.runOutsideAngular(() => this.longPress.attach(el));
  }

  refreshAll(): void { this.session.refreshAll(); }

  // ── Header ─────────────────────────────────────────────────────────────────────────────────────────────────

  get subtitle(): string {
    const parts = [this.rig.activeSkeleton?.name, this.binding.bindMeshId ? this.binding.bindMeshName : ''].filter(Boolean);
    return parts.join(' · ');
  }

  /** Multi (taps add to the selection) on a touch screen with a Salsa that has the latch; null hides it. */
  get multiLatch(): boolean | null {
    const api = armApi(this.shapeManager);
    if (!this.touchUi.coarse || typeof api.setAdditiveSelect3D !== 'function') return null;
    return !!api.getAdditiveSelect3D?.();
  }

  setMulti(on: boolean): void {
    const api = armApi(this.shapeManager);
    if (typeof api.setAdditiveSelect3D !== 'function') return;
    api.setAdditiveSelect3D(on);
    this.latchOn = on;
  }

  setWorkspace(id: string): void {
    const ws: ArmWorkspace = id === 'animate' ? 'animate' : 'rig';
    if (ws === this.workspace) return;
    this.workspace = ws;
    saveArmWorkspace(ws);
    this.tools = toolsFor(ws);
    this.segments = ws === 'rig' ? ARM_SEGMENTS : NO_SEGMENTS;
    this.radial.open = false;
    this.renameIdx = null;
    const next = toolForWorkspace(ws, this.tool);
    if (next !== this.tool) this.setTool(next);
    if (ws === 'animate') this.timeline.enter(() => this.timelineOn, (on) => this.setTimeline(on));
    else this.restoreTimeline();
  }

  /** Put the timeline back the way the user had it before Animate (no-op when Animate didn't change it). */
  restoreTimeline(): void {
    this.timeline.leave(() => this.timelineOn, (on) => this.setTimeline(on));
  }

  private get timelineOn(): boolean { return !!this.shapeManager?.isAnimationEnabled?.(); }
  private setTimeline(on: boolean): void { this.animation.setAnimationEnabled(on); }

  setSegment(id: string): void {
    if (this.workspace !== 'rig') return;
    const seg = (id === 'edit' || id === 'weight' ? id : 'pose') as ArmSegmentId;
    this.setTool(toolForSegment(seg));
    if (this.tool === toolForSegment(seg)) this.segment = seg;
  }

  frame(): void { this.binding.focusMesh(); }

  runMenu(id: string): void {
    if (id.startsWith('bg:')) { this.session.setBgMode(id.slice(3) as never); return; }
    if (id === 'refresh') this.refreshAll();
    else if (id === 'shortcuts') this.shortcuts.emit();
    else if (id === 'copyForClaude' && this.exp.devTools) this.library.exportPoseForClaude();
  }

  // ── Tools ──────────────────────────────────────────────────────────────────────────────────────────────────

  setTool(id: string): void {
    const to = id as ArmToolId;
    if (to === this.tool || !this.tools.some(t => t.id === to)) return;
    this.applyTool(this.tool, to);
  }

  private applyTool(from: ArmToolId, to: ArmToolId): void {
    const res = switchArmTool({ sm: this.shapeManager, rig: this.rig, binding: this.binding }, from, to);
    if (!res.ok) {
      if (res.reason) this.notify.error(res.reason);
      return;
    }
    this.tool = to;
    this.segment = segmentForTool(to, this.segment);
    this.renameIdx = null;
    if (to === 'key' && this.anim.activeClipIdx === null && this.anim.clips.length) this.anim.selectClip(0);
    if (to === 'key') this.keyFrame = this.anim.recordFrame;
  }

  /** The weight section's Enter Paint / Painting: the Weight Brush tool on / off. */
  onWeightPaint(on: boolean): void {
    if (on) this.setTool('weight');
    else if (this.tool === 'weight') this.setTool('rotate');
  }

  /** Record the current pose into the picked clip at the Key frame (the Key tool, K, the radial). */
  keyPose(): void {
    if (this.anim.activeClipIdx === null) { this.notify.error('Pick a clip to key into first'); return; }
    this.anim.recordFrame = this.keyFrame;
    this.anim.recordPose();
    this.notify.success(`Keyed the pose at frame ${this.keyFrame}`);
  }

  // ── Operation pill ─────────────────────────────────────────────────────────────────────────────────────────

  private opState(): ArmOpState {
    const r = this.rig, b = this.binding, chain = r.selectedJointIKChain;
    return {
      workspace: this.workspace,
      hasSkeleton: !!r.activeSkeleton,
      joints: r.joints,
      selectedIdx: r.selectedJointIdx,
      selectionCount: Math.max(this.session.selection.length, r.selectedJointIdx !== null ? 1 : 0),
      axis: this.axis, rotateDeg: this.rotateDeg, moveAmount: this.moveAmount,
      newBoneName: this.newBoneName, placing: r.placementModeActive,
      ik: { exists: !!chain, enabled: !!chain?.enabled, chainLength: chain?.chainLength ?? r.ikChainLength,
            poleJointIdx: r.ikPoleJointIdx, intermediate: r.isIKIntermediate },
      hasPoleApi: r.hasPoleJointApi,
      pickArmed: this.pick.pending?.id ?? null,
      weight: { active: b.wpActive, mode: b.wpMode, radius: b.wpRadius, strength: b.wpStrength, weight: b.wpTargetWeight },
      clips: this.anim.clips, clipIdx: this.anim.activeClipIdx, keyFrame: this.keyFrame,
      renameIdx: this.renameIdx, renameDraft: this.renameDraft,
    };
  }

  onParamChange(ch: ModeOpParamChange): void {
    const v = ch.value, r = this.rig, b = this.binding;
    switch (ch.id) {
      case 'axis': this.axis = v; break;
      case 'rotateDeg': this.rotateDeg = +v; break;
      case 'moveAmount': this.moveAmount = +v; break;
      case 'newBoneName': this.newBoneName = String(v ?? ''); break;
      case 'placing':
        if (v) r.enterPlacement(); else r.cancelPlacement();
        break;
      case 'ikEnabled': r.configureIK({ enabled: !!v, chainLength: r.selectedJointIKChain?.chainLength ?? r.ikChainLength }); break;
      case 'ikChainLength':
        r.ikChainLength = Math.max(2, Math.round(+v));
        if (r.selectedJointIKChain) r.configureIK({ enabled: !!r.selectedJointIKChain.enabled, chainLength: r.ikChainLength });
        break;
      case 'ikPole': r.setIKPoleJoint(v === '' || v === null ? null : +v); break;
      case 'wpJoint': if (v !== '' && v !== null) r.selectJoint(+v); break;
      case 'wpMode': b.setWpMode(v); break;
      case 'wpRadius': b.wpRadius = +v; b.onWpBrushChange(); break;
      case 'wpStrength': b.wpStrength = +v; b.onWpBrushChange(); break;
      case 'wpWeight': b.wpTargetWeight = +v; b.onWpBrushChange(); break;
      case 'keyClip': if (v !== '' && v !== null) this.anim.selectClip(+v); break;
      case 'keyFrame': this.keyFrame = Math.max(0, Math.round(+v)); this.anim.recordFrame = this.keyFrame; break;
      case 'renameDraft': this.renameDraft = String(v ?? ''); break;
    }
  }

  onOpAction(id: string): void {
    const r = this.rig;
    if (id === 'addChild') {
      const idx = r.addChildJoint(r.selectedJointIdx ?? -1, this.newBoneName);
      if (idx >= 0) this.newBoneName = '';
    } else if (id === 'pickPole') {
      this.pick.arm({ id: 'ik-pole', label: 'Tap the pole joint in the viewport', onPick: (j) => r.setIKPoleJoint(j) });
    } else if (id === 'pickJoint') {
      this.pick.arm({ id: 'weight-joint', label: 'Tap the joint to paint in the viewport', onPick: (j) => r.selectJoint(j) });
    } else if (id === 'keyPose') {
      this.keyPose();
    }
  }

  onOpApply(): void {
    if (this.renameIdx !== null) {
      this.rig.renameJoint(this.renameIdx, this.renameDraft);
      this.renameIdx = null;
      return;
    }
    if (!this.axis) return;
    if (this.tool === 'rotate') this.rig.rotateSelectedBy(this.axis, this.rotateDeg, this.session.selection);
    else if (this.tool === 'move') this.rig.moveSelectedBy(this.axis, this.moveAmount, this.session.selection);
  }

  onOpCancel(): void {
    if (this.renameIdx !== null) { this.renameIdx = null; return; }
    this.rotateDeg = 0;
    this.moveAmount = 0;
    this.axis = null;
  }

  // ── Long-press radial on a joint ──────────────────────────────────────────────────────────────────────────────

  /** A long press (touch / pen) on a joint: select it and open the radial there. Elsewhere: nothing. */
  openRadialAt(p: Pick<LongPressPointer, 'clientX' | 'clientY'>): boolean {
    const sk = this.rig.activeSkeleton;
    if (!sk || this.pick.pending) return false;
    const hit = pickArmatureJoint(this.shapeManager, sk.id, p.clientX, p.clientY, this.canvasEl);
    if (!hit) return false;
    selectArmatureJoint(this.shapeManager, sk.id, hit.jointIndex);
    this.rig._applyJointSelection(hit.jointIndex);
    const intermediate = this.rig.isIKIntermediate;
    this.radial = {
      open: true, x: p.clientX, y: p.clientY, title: hit.jointName, jointIdx: hit.jointIndex,
      items: armRadialItems({ hasIK: !!this.rig.selectedJointIKChain, intermediate, workspace: this.workspace }),
    };
    return true;
  }

  runRadial(id: string): void {
    const idx = this.radial.jointIdx;
    this.radial = { ...this.radial, open: false };
    if (idx === null || !this.rig.joints[idx]) return;
    const r = this.rig;
    switch (id) {
      case 'child': r.addChildJoint(idx, this.newBoneName); this.newBoneName = ''; break;
      case 'ik':
        if (!r.selectedJointIKChain) r.configureIK({ enabled: true, chainLength: 3 });
        this.setTool('ik');
        break;
      case 'rename': this.renameIdx = idx; this.renameDraft = r.joints[idx].name; break;
      case 'frame': this.frame(); break;
      case 'delete':
        if (this.confirm(`Delete "${r.joints[idx].name}" and every bone below it? This can't be undone.`)) {
          r.removeBone(idx, { stopPropagation: () => {} } as Event);
        }
        break;
      case 'key': this.keyPose(); break;
      case 'rotate': this.setTool('rotate'); break;
    }
  }

  closeRadial(): void { this.radial = { ...this.radial, open: false }; }

  /** Browser seam (the specs replace it). */
  confirm(question: string): boolean { return window.confirm(question); }
}
