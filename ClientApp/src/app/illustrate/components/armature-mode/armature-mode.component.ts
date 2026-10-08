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
import { ARMATURE_BG_MODES, ArmatureBgMode, ArmatureHost, ArmatureSession } from '../armature-panel/arm-session';
import { ARMATURE_HOST_PROVIDERS } from '../armature-panel/armature-panel.component';
import { armApi, pickArmatureJoint, selectArmatureJoint } from '../armature-panel/arm-engine';
import { ExperimentalSettingsService } from '../../services/experimental-settings.service';
import { RasterAnimationService } from 'app/shared/services/raster/raster-animation.service';
import { NotifyService } from 'app/shared/services/notify/notify.service';
import { LongPressDetector, type LongPressPointer } from '../mode-chrome/long-press';
import { acquireAdditiveLatch, releaseAdditiveLatch } from '../mode-chrome/additive-latch-scope';
import type { ModeOpParamChange, ModeRadialItem } from '../mode-chrome/mode-chrome.types';
import type { ArmatureKeyTarget } from '../illustration/mode-keymap';
import {
  ARM_SEGMENTS, ARM_WORKSPACES, ArmBaseTool, ArmModeTool, ArmOpPill, ArmOpState, ArmSegmentId, ArmTimelineGuard,
  ArmToolId, ArmWorkspace, armRadialItems, buildArmOpPill, isArmBaseTool, loadArmWorkspace, modeToolsFor,
  saveArmWorkspace, segmentForTool, switchArmTool, toolForSegment, toolForWorkspace,
} from './armature-mode.logic';

/**
 * Armature (UI review 2026-10-07 §4, reworked to the round-2 feedback 2026-10-08: docs/reviews/round2-feedback-2026-10-08.md
 * in salsa). No header bar and no tool strip: the editor's MAIN toolbar stays, and its Select / Move / Rotate drive the
 * joint tools (setTool). The right panel holds, at the top, Rig | Animate, Pose / Edit Bones / Weight (Rig) + Deselect
 * all and the mode tools as icon-only buttons (Add Bone / IK / Weight Brush; Animate: Key; tapping the active one again
 * turns it off), then the sections in the old green-title look: Rig — skeletons, joints, the joint, constraints, bind,
 * weight paint, spring bones; Animate — preset poses, pose library, clips, NLA, the libraries, retarget, with the
 * editor's timeline shown. The bottom op pill holds Frame + the active tool's parameters (Apply, no Cancel).
 * Selection: on touch / pen a tap on a joint adds it / removes it (the engine's additive latch, set per press); a mouse
 * click replaces, Shift+click toggles. The sections and services are the classic panel's (armature-panel/sections,
 * arm-*.service). Every newer Salsa call is typeof-guarded (arm-engine.ts).
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
  /** The 3D canvas: the long-press radial, the one-shot joint picks and the per-press additive latch listen on it. */
  @Input() canvasEl: HTMLElement | null = null;
  /** The chrome is shown (the editor's modeChromeVisible: false while the UI is hidden). The armature session stays. */
  @Input() chromeVisible = true;
  /** The animation timeline is open: the pill and the props panel sit above it. */
  @Input() aboveTimeline = false;

  /** The chrome appeared / went (mount, Toggle UI, leave): the editor re-places the 3D nav gizmo. */
  @Output() chromeLayout = new EventEmitter<void>();
  /** The active tool changed (any source: the main toolbar, the keys, the panel, the radial): the editor's main
   *  toolbar shows Select / Move / Rotate pressed to match. */
  @Output() toolChange = new EventEmitter<ArmToolId>();

  readonly workspaces = ARM_WORKSPACES;
  readonly segments = ARM_SEGMENTS;
  readonly bgModes = ARMATURE_BG_MODES;
  readonly session: ArmatureSession;

  workspace: ArmWorkspace = loadArmWorkspace();
  tool: ArmToolId = 'rotate';
  /** The main toolbar's tool (Select / Move / Rotate): what turning a mode tool off goes back to. */
  baseTool: ArmBaseTool = 'rotate';
  segment: ArmSegmentId = 'pose';

  // Pill state (Rotate / Move typed amounts, Add Bone name, Key frame, Rename)
  axis: 'x' | 'y' | 'z' | null = null;
  rotateDeg = 0;
  moveAmount = 0;
  newBoneName = '';
  keyFrame = 0;
  renameIdx: number | null = null;
  renameDraft = '';

  private _opPill: ArmOpPill | null = null;
  radial: { open: boolean; x: number; y: number; items: ModeRadialItem[]; title: string; jointIdx: number | null } =
    { open: false, x: 0, y: 0, items: [], title: '', jointIdx: null };

  private readonly timeline = new ArmTimelineGuard();
  private readonly longPress: LongPressDetector;
  private detachLongPress: (() => void) | null = null;
  private detachLatch: (() => void) | null = null;
  /** The engine the additive latch scope was joined on (additive-latch-scope.ts: put back by the last mode to leave). */
  private latchSm: ShapeManager | null = null;
  /** leave() ran (the engine teardown is done; ngOnDestroy only finishes the view). */
  private left = false;
  private pillKey = '';

  constructor(public cdr: ChangeDetectorRef, public rig: ArmRigService, public binding: ArmBindingService, public anim: ArmAnimService,
              public library: ArmLibraryService, public spring: ArmSpringService, public pick: ArmPickService,
              public exp: ExperimentalSettingsService, private animation: RasterAnimationService,
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
    this.attachLatch();
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
  get opPill(): ArmOpPill {
    const s = this.opState();
    const key = this.tool + '|' + JSON.stringify(s);
    if (key !== this.pillKey || !this._opPill) { this.pillKey = key; this._opPill = buildArmOpPill(this.tool, s); }
    return this._opPill;
  }

  /** The mode tool buttons of the current workspace (icon-only, in the right panel). */
  get modeTools(): ArmModeTool[] { return modeToolsFor(this.workspace); }

  ngOnDestroy(): void {
    this.leave();
    this.chromeLayout.emit();
  }

  /**
   * Leave the Armature NOW: listeners off, the latch scope left, the engine's armature mode down (session.stop). The
   * editor calls it from closeArmaturePanel, before a mode switch enters the next mode in the same tick (the teardown
   * used to run in ngOnDestroy, after the next mode had entered, and tore that mode's camera down). Runs once;
   * ngOnDestroy calls it too.
   */
  leave(): void {
    if (this.left) return;
    this.left = true;
    this.detachLongPress?.();
    this.detachLongPress = null;
    this.detachLatch?.();
    this.detachLatch = null;
    this.pick.cancel();
    releaseAdditiveLatch(this.latchSm, this);
    this.latchSm = null;
    // The editor restores the timeline in closeArmaturePanel (restoreTimeline) before this view goes; this covers any
    // other teardown, after the current change detection.
    if (this.timeline.active) void Promise.resolve().then(() => this.restoreTimeline());
    this.session.stop();
  }

  private attachLongPress(): void {
    this.detachLongPress?.();
    this.detachLongPress = null;
    const el = this.canvasEl;
    if (el) this.detachLongPress = this.zone.runOutsideAngular(() => this.longPress.attach(el));
  }

  /**
   * Multi-select by default (round-2 feedback): every press on the 3D canvas sets the engine's additive latch BEFORE
   * the engine sees it (window capture runs ahead of its canvas listeners) — on for touch / pen (a tap on a joint adds
   * it, a tap on a selected one removes it), off for the mouse (a click replaces, Shift+click toggles). The Weight
   * Brush paints one joint, so there a tap just picks it. Without the latch (old dist) a tap replaces, as before.
   */
  private attachLatch(): void {
    const api = armApi(this.shapeManager);
    if (typeof api.setAdditiveSelect3D !== 'function' || typeof window === 'undefined') return;
    if (acquireAdditiveLatch(this.shapeManager, this)) this.latchSm = this.shapeManager;
    const onDown = (e: PointerEvent): void => {
      const el = this.canvasEl;
      if (el && !(e.target instanceof Node && el.contains(e.target))) return;
      armApi(this.shapeManager).setAdditiveSelect3D?.(this.additiveFor(e.pointerType));
    };
    this.zone.runOutsideAngular(() => window.addEventListener('pointerdown', onDown, { capture: true }));
    this.detachLatch = () => window.removeEventListener('pointerdown', onDown, { capture: true });
  }

  /** A press of this pointer type adds to / removes from the joint selection (true) or replaces it (false). */
  additiveFor(pointerType: string): boolean {
    return (pointerType === 'touch' || pointerType === 'pen') && this.tool !== 'weight';
  }

  refreshAll(): void { this.session.refreshAll(); }

  // ── Top of the panel: Rig | Animate, Pose / Edit Bones / Weight, Deselect all ───────────────────────────────

  setWorkspace(id: string): void {
    const ws: ArmWorkspace = id === 'animate' ? 'animate' : 'rig';
    if (ws === this.workspace) return;
    this.workspace = ws;
    saveArmWorkspace(ws);
    this.radial.open = false;
    this.renameIdx = null;
    const next = toolForWorkspace(ws, this.tool, this.baseTool);
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

  /** Deselect every joint (the small button beside the selection-type switch). */
  deselectAll(): void {
    this.shapeManager?.selectJoint3D(null);
    this.rig.selectedJointIdx = null;
    this.rig.renamingIdx = null;
    this.session.selection = [];
    this.renameIdx = null;
  }

  get hasSelection(): boolean { return this.session.selection.length > 0 || this.rig.selectedJointIdx !== null; }

  /** The pill's Frame (the old header's Frame): the Armature's edit camera framing (arm-binding focusMesh). */
  frame(): void { this.binding.focusMesh(); }

  get bgMode(): ArmatureBgMode { return this.session.bgMode; }
  setBgMode(mode: string): void { this.session.setBgMode(mode as ArmatureBgMode); }

  // ── Tools ──────────────────────────────────────────────────────────────────────────────────────────────────

  /**
   * Pick a tool (the main toolbar's Select / Move / Rotate, the keys, the switch, the radial). A base tool becomes the
   * one a mode tool falls back to. Picking the active tool again keeps it (the keys, the main toolbar).
   */
  setTool(id: string): void {
    const to = id as ArmToolId;
    if (!isArmBaseTool(to) && !this.modeTools.some(t => t.id === to)) return;
    if (to === this.tool) { if (isArmBaseTool(to)) this.baseTool = to; return; }
    if (this.applyTool(this.tool, to) && isArmBaseTool(to)) this.baseTool = to;
  }

  /** A mode tool button: on, or (already on) off again — back to the main toolbar's tool. */
  toggleModeTool(id: string): void {
    if (id === this.tool) this.applyTool(this.tool, this.baseTool);
    else this.setTool(id);
  }

  private applyTool(from: ArmToolId, to: ArmToolId): boolean {
    const res = switchArmTool({ sm: this.shapeManager, rig: this.rig, binding: this.binding }, from, to);
    if (!res.ok) {
      if (res.reason) this.notify.error(res.reason);
      return false;
    }
    this.tool = to;
    this.segment = segmentForTool(to, this.segment);
    this.renameIdx = null;
    if (to === 'key' && this.anim.activeClipIdx === null && this.anim.clips.length) this.anim.selectClip(0);
    if (to === 'key') this.keyFrame = this.anim.recordFrame;
    this.toolChange.emit(to);
    return true;
  }

  /** The weight section's Enter Paint / Painting: the Weight Brush tool on / off. */
  onWeightPaint(on: boolean): void {
    if (on) this.setTool('weight');
    else if (this.tool === 'weight') this.applyTool('weight', this.baseTool);
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

  /** Esc inside the pill (there is no Cancel button): drop a pending rename, else the typed amount. */
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

  /** Esc (mode-keymap ARMATURE_KEYS.exit): close the radial / drop a pending rename; false = Esc leaves Armature. */
  cancelOverlay(): boolean {
    if (this.radial.open) { this.closeRadial(); return true; }
    if (this.renameIdx !== null) { this.renameIdx = null; return true; }
    return false;
  }

  /** Browser seam (the specs replace it). */
  confirm(question: string): boolean { return window.confirm(question); }

  trackTool(_: number, t: ArmModeTool): string { return t.id; }

  /** The thin label under a mode tool: its name (Weight Brush shortened to fit the button; the tooltip keeps it). */
  shortToolLabel(t: ArmModeTool): string { return t.id === 'weight' ? 'Weight' : t.label; }
}
