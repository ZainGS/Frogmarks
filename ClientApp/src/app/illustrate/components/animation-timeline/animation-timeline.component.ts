import {
  Component,
  OnInit,
  OnDestroy,
  DoCheck,
  AfterViewInit,
  AfterViewChecked,
  ElementRef,
  ViewChild,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  HostBinding,
  NgZone,
} from '@angular/core';
import { Subscription } from 'rxjs';
import {
  RasterAnimationService,
  OnionSkinConfig,
  LoopMode,
  TimelineLayerInfo,
  CelInfo,
  CelType,
} from '../../../shared/services/raster/raster-animation.service';
import ShapeManager from '@zaings/salsa/shape-manager';
import { EditorStateService } from '../../services/editor-state.service';

/** Types taken from the engine's own signatures so they track Salsa automatically. */
type CameraTrackKey = Parameters<ShapeManager['removeCameraKeyframe3D']>[0];
type KeyframeEasing = Parameters<ShapeManager['setMeshKeyframe3D']>[4];
/** Camera rows only ever carry camera track keys; this names that narrowing in one place. */
const camKey = (k: string): CameraTrackKey => k as CameraTrackKey;

/** One frame of an animated layer's row, precomputed (it used to be ~8 scans of layer.cels per cell per change
 *  detection — i.e. per frame of playback). */
export interface CelCellView {
  f: number;
  start: boolean;
  hold: boolean;
  blank: boolean;
  end: boolean;
  /** The cel showing on this frame (getCelAtFrame), null on a blank frame. */
  cel: CelInfo | null;
  title: string;
}

export interface LayerRowView {
  layer: TimelineLayerInfo;
  /** One per frame (index = frame - 1); empty for a static layer. */
  cells: CelCellView[];
}

export interface TrackRowView {
  def: { key: string; label: string; color: string };
  /** 1-based frames with a keyframe on this track. */
  keys: Set<number>;
  /** Per frame (index = frame - 1): the cell's title ('' without a keyframe). */
  titles: string[];
  /** Per frame (index = frame - 1): the keyframe's selection key (kfKey), '' without a keyframe. */
  kfKeys: string[];
}

export interface Mesh3dRowView {
  entry: { meshId: string; name: string; tracks: any; isCamera?: boolean };
  /** Per frame (index = frame - 1): a keyframe on any of the entry's tracks. */
  anyKey: boolean[];
  tracks: TrackRowView[];
}

// ── Touch / tablet (timeline touch audit 2026-10-09) ──
/** Touch: a cel drag starts only after a press this long, so a quicker one-finger swipe still scrolls the grid. */
export const CEL_TOUCH_DRAG_DELAY_MS = 200;
/** Touch / pen: a still press this long opens the same menu as a right-click (or shows a button's tooltip). */
export const LONG_PRESS_MS = 500;
/** A press that moves further than this (CSS px) is a scroll / drag, not a long-press. */
export const LONG_PRESS_SLOP_PX = 8;
/** Mouse / pen: a cel / keyframe drag starts once the pointer has moved this far (as before). */
const DRAG_THRESHOLD_PX = 4;
/** How long a press-and-hold tooltip stays after the finger lifts. */
const HOLD_TIP_LINGER_MS = 1500;
/** The timeline's height (drag its top edge), remembered per device. */
export const TIMELINE_HEIGHT_KEY = 'fm.animationTimeline.height';
export const TIMELINE_MIN_H = 120;
/** The animation timeline wrapper's 4 px top border (illustration.component.scss): --fm-timeline-h = height + this. */
const TIMELINE_BORDER_PX = 4;

/** Where a menu anchored at (x, y) — opening upward from it when flipUp — lands once kept inside the viewport. */
export function clampMenuToViewport(x: number, y: number, w: number, h: number, vw: number, vh: number,
                                    flipUp = false, margin = 4): { left: number; top: number } {
  const top = flipUp ? y - h : y;
  return {
    left: Math.max(margin, Math.min(x, vw - w - margin)),
    top: Math.max(margin, Math.min(top, vh - h - margin)),
  };
}

/** The frame width after a pinch from distance d0 to d (scaled like Ctrl+wheel's zoom, same limits). */
export function pinchFrameWidth(fw0: number, d0: number, d: number, min: number, max: number): number {
  if (!(d0 > 0) || !(d > 0)) return fw0;
  return Math.max(min, Math.min(max, Math.round(fw0 * d / d0)));
}

/** What the transport bar's ⋯ opens a menu for: the last cel / keyframe / layer / track tapped. */
type MenuTarget =
  | { kind: 'cel'; layerId: string; frame: number }
  | { kind: 'layer'; layerId: string }
  | { kind: 'kf'; meshId: string; trackKey: string; frame: number; isCamera: boolean }
  | { kind: 'track'; meshId: string; trackKey: string; isCamera: boolean };

/** The minimal touch-event shape the pinch handlers read (real TouchEvents in the app, plain objects in tests). */
export interface PinchTouchEvent {
  touches: ArrayLike<{ clientX: number; clientY: number }>;
  cancelable?: boolean;
  preventDefault?: () => void;
}

/** An element's text, updated in its one Text node (characterData — as Angular's own text bindings do): replacing
 *  the node (textContent =) cost ~10× more style + layout per frame of playback. */
function setText(el: HTMLElement, text: string): void {
  const n = el.firstChild;
  if (n && n.nodeType === Node.TEXT_NODE && !n.nextSibling) (n as Text).data = text;
  else el.textContent = text;
}

const CELL_TITLE_BLANK = 'Blank frame — no drawing. Click to jump here, double-click to create a new cel.';
const CELL_TITLE_HOLD = 'This frame holds the previous drawing.';
const CELL_TITLE_DRAWING = 'This frame has a drawing. Click to select it. Drag to move. Alt+drag to swap.';
const NO_CUTS: { cameraId: string; frame: number }[] = [];

/**
 * OnPush: playback runs outside the Angular zone (RasterAnimationService). Nothing in the template depends on the
 * current frame: the playhead, the current-frame column (a header cap + one highlight per row section) and the
 * "N / M" counter are written straight to the DOM by _syncFrameDom, so a frame of PLAYBACK runs no change detection
 * (playback perf A2, 2026-10-09). A frame change while paused (scrub / step / click) still refreshes the view, and so
 * does everything else: the service observables, inputs (new arrays), template events, and the document-level drag
 * listeners below (markForCheck in each). Every check of this view re-syncs those DOM writes (ngAfterViewChecked /
 * _detect), so they can't go stale. The template is a precomputed view model (frames / layerRows / mesh3dRows).
 *
 * Input is pointer events (mouse, touch and pen alike — timeline touch audit 2026-10-09): every drag goes through
 * _beginPointerDrag (pointer capture + pointercancel), right-click menus also open on a long-press, and a two-finger
 * pinch on the grid zooms the frames like Ctrl+wheel.
 */
@Component({
  selector: 'app-animation-timeline',
  standalone: false,
  templateUrl: './animation-timeline.component.html',
  styleUrl: './animation-timeline.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AnimationTimelineComponent implements OnInit, OnDestroy, DoCheck, AfterViewInit, AfterViewChecked {

  // ── State ─────────────────────────────────────────────────

  currentFrame = 1;
  frameCount = 24;
  fps = 12;
  isPlaying = false;
  loopMode: LoopMode = 'loop';
  playRangeStart = 1;
  playRangeEnd = 24;

  layers: TimelineLayerInfo[] = [];

  // Onion skin
  showOnionSkinPanel = false;
  onionSkin: OnionSkinConfig = {
    enabled: false,
    framesBefore: 2,
    framesAfter: 1,
    opacity: 0.3,
    tintBefore: [1.0, 0.2, 0.2],
    tintAfter: [0.2, 0.5, 1.0],
  };

  // Settings panel
  showSettingsPanel = false;

  // Export dialog
  showExportDialog = false;

  // Timeline scroll
  timelineScrollLeft = 0;
  frameWidth = 28;
  minFrameWidth = 16;
  maxFrameWidth = 60;

  // Context menu
  contextMenuVisible = false;
  contextMenuX = 0;
  contextMenuY = 0;
  contextMenuFlipUp = false;
  contextMenuLayerId = '';
  contextMenuFrame = 0;
  contextMenuCelId = '';
  contextMenuLayerAnimated = false;

  // Cel drag state (move / swap)
  draggingCelId = '';
  draggingLayerId = '';
  draggingFromFrame = 0;
  dragGhostFrame = 0;
  isDragging = false;
  isDragSwap = false; // true when Alt held during drag

  // Duration drag state (drag right edge of cel)
  durationDragging = false;
  durationDragCelId = '';
  durationDragLayerId = '';
  durationDragStart = 0;
  durationDragOriginal = 1;

  // Duplicate-to-frame prompt
  showDuplicatePrompt = false;
  duplicateTargetFrame = 1;

  // Move-to-frame / swap-with prompt (the cel menu's "Move to Frame…" / "Swap with…")
  showCelFramePrompt = false;
  celFramePromptMode: 'move' | 'swap' = 'move';
  celFramePromptTarget = 1;

  // The cel last tapped / clicked (outlined; the transport bar's ⋯ and cel buttons act on its layer)
  selectedCellLayerId = '';
  selectedCellFrame = 0;
  private _menuTarget: MenuTarget | null = null;

  /** Touch: taps on keyframes add to / remove from the selection (Shift+click's job with a mouse). */
  kfSelectMode = false;

  /** Press-and-hold tooltip (touch / pen) for a button: its title, shown above it. */
  holdTip: { text: string; x: number; y: number } | null = null;

  /** The panel's height once the user dragged its top edge (null = the stylesheet's 200 px). */
  panelHeight: number | null = null;

  // Tint presets
  beforeTintPresets: [number, number, number][] = [
    [1.0, 0.2, 0.2], // red
    [0.2, 0.8, 0.2], // green
    [1.0, 0.6, 0.1], // orange
  ];
  afterTintPresets: [number, number, number][] = [
    [0.2, 0.5, 1.0], // blue
    [0.2, 0.8, 0.8], // cyan
    [0.6, 0.3, 0.9], // purple
  ];

  @ViewChild('timelineGrid') timelineGridRef!: ElementRef<HTMLDivElement>;
  @ViewChild('timelineLayers') timelineLayersRef!: ElementRef<HTMLDivElement>;
  @ViewChild('timelinePanel') timelinePanelRef!: ElementRef<HTMLDivElement>;
  // Written per frame by _syncFrameDom (never bound in the template: a binding and a direct write would fight)
  @ViewChild('playhead', { static: true }) private playheadRef?: ElementRef<HTMLElement>;
  @ViewChild('curFrameCap', { static: true }) private curFrameCapRef?: ElementRef<HTMLElement>;
  @ViewChild('curCol2d', { static: true }) private curCol2dRef?: ElementRef<HTMLElement>;
  @ViewChild('curCol3d', { static: true }) private curCol3dRef?: ElementRef<HTMLElement>;
  @ViewChild('frameCounter', { static: true }) private frameCounterRef?: ElementRef<HTMLElement>;

  /** A floating panel / prompt / menu / hold tooltip is open: the host (illustration.component.scss) raises the
   *  timeline above the zoom box, which otherwise sat on top of them (they live in the timeline's stacking context). */
  @HostBinding('class.tl-floating-open') get floatingOpen(): boolean {
    return this.showOnionSkinPanel || this.showSettingsPanel || this.showDuplicatePrompt || this.showCelFramePrompt
      || this.showKfFramePrompt || this.showKfBulkMovePrompt
      || this.contextMenuVisible || this.showEasingMenu || this.showTrackMenu || !!this.holdTip;
  }

  /** All 3D mesh keyframe tracks — one entry per mesh in the scene (camera row has isCamera: true). */
  @Input() mesh3dAllTracks: { meshId: string; name: string; tracks: any; isCamera?: boolean }[] = [];

  /** Salsa ShapeManager — passed through to the export dialog. */
  @Input() shapeManager: ShapeManager;

  /** Emitted after any keyframe is added, deleted, moved, or cleared — parent should refresh track data. */
  @Output() keyframesChanged = new EventEmitter<void>();

  /** Emitted when the user clicks the Record KF button in the transport bar. */
  @Output() recordKeyframeRequested = new EventEmitter<void>();

  /** Camera cut points — drives the Cameras lane in the dope sheet. */
  @Input() cameraCuts: { cameraId: string; frame: number }[] = [];

  /** Camera nodes in the scene — label sources for cut markers. */
  @Input() cameraNodes: { id: string; name: string }[] = [];

  /** Whether cinematic cut preview is active — reflects preview toggle state. */
  @Input() cameraPreviewOn = false;

  /** Emitted when the user clicks a frame in a camera's row to drop a cut. */
  @Output() dropCutRequested = new EventEmitter<{ cameraId: string; frame: number }>();

  /** Emitted when the user removes a cut by clicking its ▼ marker. */
  @Output() removeCutRequested = new EventEmitter<number>();

  /** Emitted when the user clicks the cut-preview toggle. */
  @Output() previewToggled = new EventEmitter<void>();

  private _collapsedMesh3dIds = new Set<string>();

  toggleMesh3dCollapse(meshId: string): void {
    if (this._collapsedMesh3dIds.has(meshId)) {
      this._collapsedMesh3dIds.delete(meshId);
    } else {
      this._collapsedMesh3dIds.add(meshId);
    }
  }

  isMesh3dCollapsed(meshId: string): boolean {
    return this._collapsedMesh3dIds.has(meshId);
  }

  getCutsForCamera(cameraId: string): { cameraId: string; frame: number }[] {
    if (this._cutsSource !== this.cameraCuts) {   // the host replaces the array on every change
      this._cutsSource = this.cameraCuts;
      this._cutsByCamera.clear();
      for (const c of this.cameraCuts) {
        let list = this._cutsByCamera.get(c.cameraId);
        if (!list) { list = []; this._cutsByCamera.set(c.cameraId, list); }
        list.push(c);
      }
    }
    return this._cutsByCamera.get(cameraId) ?? NO_CUTS;
  }
  private _cutsSource: { cameraId: string; frame: number }[] | null = null;
  private _cutsByCamera = new Map<string, { cameraId: string; frame: number }[]>();

  onCameraRowClick(event: MouseEvent, cameraId: string): void {
    const frame = Math.max(1, Math.min(this.frameCount, Math.floor(event.offsetX / this.frameWidth) + 1));
    this.dropCutRequested.emit({ cameraId, frame });
  }

  onCutMarkerClick(event: MouseEvent, frame: number): void {
    event.stopPropagation();
    this.removeCutRequested.emit(frame);
  }

  get allMeshesCollapsed(): boolean {
    return this.mesh3dAllTracks.length > 0 &&
      this.mesh3dAllTracks.every(e => this._collapsedMesh3dIds.has(e.meshId));
  }

  collapseAllMeshes(): void {
    for (const entry of this.mesh3dAllTracks) {
      this._collapsedMesh3dIds.add(entry.meshId);
    }
  }

  expandAllMeshes(): void {
    this._collapsedMesh3dIds.clear();
  }

  /** The property tracks we expose in the Dope Sheet, in order. */
  readonly mesh3dTrackDefs: { key: string; label: string; color: string }[] = [
    { key: 'position', label: 'Position',  color: '#4fc3f7' },
    { key: 'rotation', label: 'Rotation',  color: '#aed581' },
    { key: 'scale',    label: 'Scale',     color: '#ffb74d' },
    { key: 'opacity',  label: 'Opacity',   color: '#f48fb1' },
    { key: 'visible',  label: 'Visible',   color: '#fff176' },
  ];

  readonly camera3dTrackDefs: { key: string; label: string; color: string }[] = [
    { key: 'position', label: 'Position', color: '#4fc3f7' },
    { key: 'target',   label: 'Target',   color: '#aed581' },
    { key: 'fov',      label: 'FOV',      color: '#ffb74d' },
  ];

  getTrackDefsForEntry(entry: { isCamera?: boolean }): { key: string; label: string; color: string }[] {
    return entry.isCamera ? this.camera3dTrackDefs : this.mesh3dTrackDefs;
  }

  // 3D keyframe easing context menu
  kfContextMeshId = '';
  kfContextTrackKey = '';
  kfContextFrame = 0;
  kfContextCurrentEasing = 'ease-in-out';
  kfContextIsCamera = false;
  showEasingMenu = false;

  // Track-level context menu (right-click on property track label)
  showTrackMenu = false;
  trackMenuX = 0;
  trackMenuY = 0;
  trackMenuFlipUp = false;
  trackMenuMeshId = '';
  trackMenuTrackKey = '';
  trackMenuIsCamera = false;

  // Multi-keyframe selection
  selectedKfKeys = new Set<string>();

  // Bulk move prompt
  showKfBulkMovePrompt = false;
  kfBulkMoveTarget = 1;

  // KF copy/move prompt
  showKfFramePrompt = false;
  kfFramePromptMode: 'copy' | 'move' = 'copy';
  kfFramePromptTarget = 1;

  // KF drag state
  kfDragging = false;
  kfDragMeshId = '';
  kfDragTrackKey = '';
  kfDragFromFrame = 0;
  kfDragGhostFrame = 0;
  kfDragIsCamera = false;
  kfDragIsCopy = false;

  readonly easingOptions = [
    { value: 'step',        label: 'Step',         icon: '◆' },
    { value: 'linear',      label: 'Linear',       icon: '╱' },
    { value: 'ease-in',     label: 'Ease In',      icon: '⌒' },
    { value: 'ease-out',    label: 'Ease Out',      icon: '⌣' },
    { value: 'ease-in-out', label: 'Ease In-Out',  icon: '∫' },
  ];

  /** Returns the set of 1-based frame numbers that have a keyframe on the given track. */
  getTrackFrameSet(tracks: any, trackKey: string): Set<number> {
    if (!tracks) return new Set();
    const track: Array<{ frame: number }> | undefined = tracks[trackKey];
    if (!track?.length) return new Set();
    return new Set(track.map((kf: any) => kf.frame)); // kf.frame is already 1-based
  }

  /** True if the given 1-based frame has a keyframe on any track for a given entry. */
  hasAnyKeyframeAt(tracks: any, frame: number, isCamera = false): boolean {
    const defs = isCamera ? this.camera3dTrackDefs : this.mesh3dTrackDefs;
    for (const def of defs) {
      if (this.getTrackFrameSet(tracks, def.key).has(frame)) return true;
    }
    return false;
  }

  onKfDiamondContextMenu(event: MouseEvent, meshId: string, trackKey: string, frame: number, isCamera: boolean): void {
    event.preventDefault();
    event.stopPropagation();
    this._openKfMenuAt(event.clientX, event.clientY, meshId, trackKey, frame, isCamera);
  }

  /** The keyframe easing menu (right-click, long-press, or ⋯ on a tapped keyframe). */
  private _openKfMenuAt(x: number, y: number, meshId: string, trackKey: string, frame: number, isCamera: boolean): void {
    this._cancelPendingGestures();
    this._menuTarget = { kind: 'kf', meshId, trackKey, frame, isCamera };
    this.contextMenuX = x;
    this.contextMenuY = y;
    this.contextMenuFlipUp = y > window.innerHeight / 2;
    this.showTrackMenu = false;
    this.kfContextMeshId = meshId;
    this.kfContextTrackKey = trackKey;
    this.kfContextFrame = frame;
    this.kfContextIsCamera = isCamera;
    // Read current easing from the track
    const entry = this.mesh3dAllTracks.find(e => e.meshId === meshId);
    const track: any[] = entry?.tracks?.[trackKey] ?? [];
    const kf = track.find((k: any) => k.frame === frame);
    this.kfContextCurrentEasing = kf?.easing ?? 'ease-in-out';
    this.showEasingMenu = true;
    this.contextMenuVisible = false; // easing menu replaces the cel context menu
    this._clampMenusSoon();
  }

  setKfEasing(easing: KeyframeEasing): void {
    if (!this.shapeManager || !this.kfContextMeshId) { this.showEasingMenu = false; return; }
    const sm = this.shapeManager;
    const entry = this.mesh3dAllTracks.find(e => e.meshId === this.kfContextMeshId);
    const track: any[] = entry?.tracks?.[this.kfContextTrackKey] ?? [];
    const kf = track.find((k: any) => k.frame === this.kfContextFrame);
    if (!kf) { this.showEasingMenu = false; return; }
    if (this.kfContextIsCamera) {
      sm.setCameraKeyframe3D(camKey(this.kfContextTrackKey), this.kfContextFrame, kf.value, easing);
    } else {
      sm.setMeshKeyframe3D(this.kfContextMeshId, this.kfContextTrackKey, this.kfContextFrame, kf.value, easing);
    }
    this.kfContextCurrentEasing = easing;
    this.showEasingMenu = false;
    this.keyframesChanged.emit();
  }

  deleteKeyframe(): void {
    if (!this.shapeManager || !this.kfContextMeshId) { this.showEasingMenu = false; return; }
    const sm = this.shapeManager;
    if (this.kfContextIsCamera) {
      sm.removeCameraKeyframe3D(camKey(this.kfContextTrackKey), this.kfContextFrame);
    } else {
      sm.removeMeshKeyframe3D(this.kfContextMeshId, this.kfContextTrackKey, this.kfContextFrame);
    }
    this.showEasingMenu = false;
    this.keyframesChanged.emit();
  }

  clearAllKeyframes(): void {
    if (!this.shapeManager || !this.kfContextMeshId) { this.showEasingMenu = false; return; }
    const sm = this.shapeManager;
    if (this.kfContextIsCamera) {
      const entry = this.mesh3dAllTracks.find(e => e.meshId === this.kfContextMeshId);
      for (const def of this.camera3dTrackDefs) {
        const track: any[] = [...(entry?.tracks?.[def.key] ?? [])];
        for (const kf of track) {
          sm.removeCameraKeyframe3D(camKey(def.key), kf.frame);
        }
      }
    } else {
      sm.clearMeshKeyframeTracks3D(this.kfContextMeshId);
    }
    this.showEasingMenu = false;
    this.keyframesChanged.emit();
  }

  openKfCopyPrompt(): void {
    this.kfFramePromptMode = 'copy';
    this.kfFramePromptTarget = this.kfContextFrame + 1;
    this.showKfFramePrompt = true;
    this.showEasingMenu = false;
  }

  openKfMovePrompt(): void {
    this.kfFramePromptMode = 'move';
    this.kfFramePromptTarget = this.kfContextFrame + 1;
    this.showKfFramePrompt = true;
    this.showEasingMenu = false;
  }

  confirmKfFrameAction(): void {
    if (!this.shapeManager || !this.kfContextMeshId) { this.showKfFramePrompt = false; return; }
    const sm = this.shapeManager;
    const entry = this.mesh3dAllTracks.find(e => e.meshId === this.kfContextMeshId);
    const track: any[] = entry?.tracks?.[this.kfContextTrackKey] ?? [];
    const kf = track.find((k: any) => k.frame === this.kfContextFrame);
    if (!kf) { this.showKfFramePrompt = false; return; }
    const target = this.kfFramePromptTarget;
    if (this.kfContextIsCamera) {
      sm.setCameraKeyframe3D(camKey(this.kfContextTrackKey), target, kf.value, kf.easing);
      if (this.kfFramePromptMode === 'move') {
        sm.removeCameraKeyframe3D(camKey(this.kfContextTrackKey), this.kfContextFrame);
      }
    } else {
      sm.setMeshKeyframe3D(this.kfContextMeshId, this.kfContextTrackKey, target, kf.value, kf.easing);
      if (this.kfFramePromptMode === 'move') {
        sm.removeMeshKeyframe3D(this.kfContextMeshId, this.kfContextTrackKey, this.kfContextFrame);
      }
    }
    this.showKfFramePrompt = false;
    this.keyframesChanged.emit();
  }

  cancelKfFramePrompt(): void {
    this.showKfFramePrompt = false;
  }

  // ── Track-level context menu ────────────────────────────────

  onKfTrackLabelContextMenu(event: MouseEvent, meshId: string, trackKey: string, isCamera: boolean): void {
    event.preventDefault();
    event.stopPropagation();
    this._openTrackMenuAt(event.clientX, event.clientY, meshId, trackKey, isCamera);
  }

  /** Touch / pen: long-press a track label = its right-click menu; the press also makes it the ⋯ target. */
  onTrackLabelPointerDown(event: PointerEvent, meshId: string, trackKey: string, isCamera: boolean): void {
    this._menuTarget = { kind: 'track', meshId, trackKey, isCamera };
    this.startLongPress(event, (x, y) => this._openTrackMenuAt(x, y, meshId, trackKey, isCamera));
  }

  private _openTrackMenuAt(x: number, y: number, meshId: string, trackKey: string, isCamera: boolean): void {
    this._cancelPendingGestures();
    this._menuTarget = { kind: 'track', meshId, trackKey, isCamera };
    this.trackMenuX = x;
    this.trackMenuY = y;
    this.trackMenuFlipUp = y > window.innerHeight / 2;
    this.trackMenuMeshId = meshId;
    this.trackMenuTrackKey = trackKey;
    this.trackMenuIsCamera = isCamera;
    this.showTrackMenu = true;
    this.showEasingMenu = false;
    this.contextMenuVisible = false;
    this._clampMenusSoon();
  }

  clearTrackKeyframes(): void {
    if (!this.shapeManager || !this.trackMenuMeshId) { this.showTrackMenu = false; return; }
    const sm = this.shapeManager;
    const entry = this.mesh3dAllTracks.find(e => e.meshId === this.trackMenuMeshId);
    const track: any[] = [...(entry?.tracks?.[this.trackMenuTrackKey] ?? [])];
    for (const kf of track) {
      if (this.trackMenuIsCamera) {
        sm.removeCameraKeyframe3D(camKey(this.trackMenuTrackKey), kf.frame);
      } else {
        sm.removeMeshKeyframe3D(this.trackMenuMeshId, this.trackMenuTrackKey, kf.frame);
      }
    }
    this.showTrackMenu = false;
    this.keyframesChanged.emit();
  }

  closeTrackMenu(): void { this.showTrackMenu = false; }

  // ── Multi-keyframe selection ────────────────────────────────

  kfKey(meshId: string, trackKey: string, frame: number): string {
    return `${meshId}:${trackKey}:${frame}`;
  }

  isKfSelected(meshId: string, trackKey: string, frame: number): boolean {
    return this.selectedKfKeys.has(this.kfKey(meshId, trackKey, frame));
  }

  clearKfSelection(): void { this.selectedKfKeys.clear(); }

  deleteSelectedKeyframes(): void {
    if (!this.shapeManager) return;
    const sm = this.shapeManager;
    for (const key of [...this.selectedKfKeys]) {
      const parts = key.split(':');
      const meshId = parts[0];
      const trackKey = parts[1];
      const frame = +parts[2];
      const entry = this.mesh3dAllTracks.find(e => e.meshId === meshId);
      if (entry?.isCamera) {
        sm.removeCameraKeyframe3D(camKey(trackKey), frame);
      } else {
        sm.removeMeshKeyframe3D(meshId, trackKey, frame);
      }
    }
    this.selectedKfKeys.clear();
    this.keyframesChanged.emit();
  }

  openKfBulkMovePrompt(): void {
    this.kfBulkMoveTarget = this.currentFrame;
    this.showKfBulkMovePrompt = true;
  }

  confirmKfBulkMove(): void {
    if (!this.shapeManager) { this.showKfBulkMovePrompt = false; return; }
    const sm = this.shapeManager;
    const keys = [...this.selectedKfKeys];
    const minFrame = Math.min(...keys.map(k => +k.split(':')[2]));
    const delta = this.kfBulkMoveTarget - minFrame;
    for (const key of keys) {
      const parts = key.split(':');
      const meshId = parts[0];
      const trackKey = parts[1];
      const frame = +parts[2];
      const newFrame = Math.max(1, Math.min(this.frameCount, frame + delta));
      const entry = this.mesh3dAllTracks.find(e => e.meshId === meshId);
      const track: any[] = entry?.tracks?.[trackKey] ?? [];
      const kf = track.find((k: any) => k.frame === frame);
      if (!kf) continue;
      if (entry?.isCamera) {
        sm.setCameraKeyframe3D(camKey(trackKey), newFrame, kf.value, kf.easing);
        sm.removeCameraKeyframe3D(camKey(trackKey), frame);
      } else {
        sm.setMeshKeyframe3D(meshId, trackKey, newFrame, kf.value, kf.easing);
        sm.removeMeshKeyframe3D(meshId, trackKey, frame);
      }
    }
    this.selectedKfKeys.clear();
    this.showKfBulkMovePrompt = false;
    this.keyframesChanged.emit();
  }

  cancelKfBulkMove(): void { this.showKfBulkMovePrompt = false; }

  /** Keyframe press: Shift (or the Select toggle) adds / removes it from the selection; otherwise a drag moves it
   *  (Alt = copy), a tap makes it the ⋯ target, and a long-press (touch / pen) opens its easing menu. */
  onKfDiamondPointerDown(event: PointerEvent, meshId: string, trackKey: string, frame: number, isCamera: boolean): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.stopPropagation();

    if (event.shiftKey || this.kfSelectMode) {
      const key = this.kfKey(meshId, trackKey, frame);
      if (this.selectedKfKeys.has(key)) {
        this.selectedKfKeys.delete(key);
      } else {
        this.selectedKfKeys.add(key);
      }
      return;
    }

    this.startLongPress(event, (x, y) => this._openKfMenuAt(x, y, meshId, trackKey, frame, isCamera));

    this.kfDragging = false;
    this.kfDragMeshId = meshId;
    this.kfDragTrackKey = trackKey;
    this.kfDragFromFrame = frame;
    this.kfDragGhostFrame = frame;
    this.kfDragIsCamera = isCamera;
    this.kfDragIsCopy = event.altKey;
    const x0 = event.clientX;

    const reset = () => {
      this.kfDragging = false;
      this.kfDragMeshId = '';
    };

    this._beginPointerDrag(event, {
      move: (e) => {
        if (!this.kfDragging && Math.abs(e.clientX - x0) > DRAG_THRESHOLD_PX) {
          this.kfDragging = true;
          this._cancelLongPress();
        }
        if (this.kfDragging) {
          const dx = e.clientX - x0;
          this.kfDragGhostFrame = Math.max(1, Math.min(this.frameCount, frame + Math.round(dx / this.frameWidth)));
          this.kfDragIsCopy = e.altKey;
          this._detect();   // outside the zone (_beginPointerDrag): re-render this view only
        }
      },
      up: () => {
        if (this.kfDragging && this.kfDragGhostFrame !== this.kfDragFromFrame) {
          const sm = this.shapeManager;
          const entry = this.mesh3dAllTracks.find(en => en.meshId === meshId);
          const track: any[] = entry?.tracks?.[trackKey] ?? [];
          const kf = track.find((k: any) => k.frame === frame);
          if (kf && sm) {
            const targetFrame = this.kfDragGhostFrame;
            if (isCamera) {
              sm.setCameraKeyframe3D(camKey(trackKey), targetFrame, kf.value, kf.easing);
              if (!this.kfDragIsCopy) sm.removeCameraKeyframe3D(camKey(trackKey), frame);
            } else {
              sm.setMeshKeyframe3D(meshId, trackKey, targetFrame, kf.value, kf.easing);
              if (!this.kfDragIsCopy) sm.removeMeshKeyframe3D(meshId, trackKey, frame);
            }
            this.keyframesChanged.emit();
          }
        } else if (!this.kfDragging) {
          this._menuTarget = { kind: 'kf', meshId, trackKey, frame, isCamera };   // a tap: ⋯ opens its menu
        }
        reset();
      },
      cancel: reset,
    });
  }

  closeEasingMenu(): void {
    this.showEasingMenu = false;
  }

  // ── Label column <-> grid scroll (both ways: a finger can scroll either) ──

  /** The grid scrolled: the label column follows. */
  onGridVerticalScroll(): void {
    const grid = this.timelineGridRef?.nativeElement;
    const labels = this.timelineLayersRef?.nativeElement;
    if (!grid || !labels) return;
    // The grid's horizontal scrollbar shortens its viewport: pad the labels by as much so both reach the same end
    const pad = Math.max(0, grid.offsetHeight - grid.clientHeight);
    if (pad !== this._labelsPad) { this._labelsPad = pad; labels.style.paddingBottom = pad + 'px'; }
    if (Math.abs(labels.scrollTop - grid.scrollTop) >= 1) labels.scrollTop = grid.scrollTop;
  }

  /** The label column scrolled (a touch swipe on the names): the grid follows. */
  onLayersScroll(): void {
    const grid = this.timelineGridRef?.nativeElement;
    const labels = this.timelineLayersRef?.nativeElement;
    if (!grid || !labels) return;
    if (Math.abs(labels.scrollTop - grid.scrollTop) >= 1) grid.scrollTop = labels.scrollTop;
  }
  private _labelsPad = -1;

  /** Forward mouse wheel on layers column to the grid so they scroll together */
  onLayersWheel(event: WheelEvent): void {
    if (this.timelineGridRef?.nativeElement) {
      this.timelineGridRef.nativeElement.scrollTop += event.deltaY;
      event.preventDefault();
    }
  }

  private subs: Subscription[] = [];

  constructor(
    public animService: RasterAnimationService,
    private editorState: EditorStateService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private hostRef: ElementRef<HTMLElement>,
  ) {}

  // ── Pointer drags (mouse, touch, pen) ──────────────────────

  private _drag: { id: number; cancel: () => void; cleanup: () => void } | null = null;
  /** A touch drag owns the finger: the grid's touchmove listener cancels the native scroll while this is set. */
  private _touchDragLock = false;

  /** A drag from this pointerdown: pointer capture on the pressed element, then document pointermove / pointerup /
   *  pointercancel for that pointer. The moves run OUTSIDE the zone (zone audit M4) — they update this OnPush view
   *  with a local detectChanges (or through the service subjects, which refresh it the same way) — and the up /
   *  cancel enters it once, so the drop's change detection covers the whole app. pointercancel (the browser took the
   *  touch, e.g. as a scroll) runs `cancel` instead of `up`: nothing is dropped. */
  private _beginPointerDrag(down: PointerEvent, h: { move: (e: PointerEvent) => void; up: (e: PointerEvent) => void; cancel: () => void }): void {
    this._drag?.cancel();
    const id = down.pointerId;
    const el = down.currentTarget as Element | null;
    try { el?.setPointerCapture?.(id); } catch { /* the pointer is gone already / a synthetic event */ }
    const move = (e: PointerEvent) => { if (e.pointerId === id) h.move(e); };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      cleanup();
      this.ngZone.run(() => {
        if (e.type === 'pointercancel') h.cancel(); else h.up(e);
        this.cdr.markForCheck();
      });
    };
    const cleanup = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', end);
      if (this._drag === rec) this._drag = null;
    };
    const rec = {
      id,
      cleanup,
      cancel: () => { cleanup(); h.cancel(); this.cdr.markForCheck(); },
    };
    this._drag = rec;
    this.ngZone.runOutsideAngular(() => {
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', end);
      document.addEventListener('pointercancel', end);
    });
  }

  /** A menu / pinch takes over: drop any drag in progress (nothing is applied) and any pending long-press. */
  private _cancelPendingGestures(): void {
    this._drag?.cancel();
    this._cancelLongPress();
  }

  // ── Long-press (touch / pen) = right-click ─────────────────

  private _lp: { id: number; timer: ReturnType<typeof setTimeout>; cleanup: () => void } | null = null;
  /** A long-press / hold-tooltip fired: the click that may follow the lift must not act (or close the menu it
   *  opened). Cleared by the next press. */
  private _swallowNextClick = false;

  /** Touch / pen: a press held still for LONG_PRESS_MS (moving < LONG_PRESS_SLOP_PX) runs `open` at the press point —
   *  the same menu the right-click opens. A mouse never long-presses (it has the right button). */
  startLongPress(event: PointerEvent, open: (x: number, y: number) => void): void {
    if (event.pointerType === 'mouse') return;
    this._cancelLongPress();
    const id = event.pointerId;
    const x = event.clientX;
    const y = event.clientY;
    const move = (e: PointerEvent) => {
      if (e.pointerId === id && Math.hypot(e.clientX - x, e.clientY - y) > LONG_PRESS_SLOP_PX) this._cancelLongPress();
    };
    const end = (e: PointerEvent) => { if (e.pointerId === id) this._cancelLongPress(); };
    const cleanup = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', end);
      document.removeEventListener('pointercancel', end);
    };
    this.ngZone.runOutsideAngular(() => {
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', end);
      document.addEventListener('pointercancel', end);
      const timer = setTimeout(() => {
        cleanup();
        this._lp = null;
        this.ngZone.run(() => {
          this._drag?.cancel();
          this._swallowNextClick = true;
          open(x, y);
          this.cdr.markForCheck();
        });
      }, LONG_PRESS_MS);
      this._lp = { id, timer, cleanup };
    });
  }

  private _cancelLongPress(): void {
    if (!this._lp) return;
    clearTimeout(this._lp.timer);
    this._lp.cleanup();
    this._lp = null;
  }

  /** Capture-phase click on the panel: swallow the click a long-press may leave behind. */
  private readonly _onPanelClickCapture = (e: MouseEvent): void => {
    if (this._swallowNextClick) {
      this._swallowNextClick = false;
      e.stopPropagation();
      e.preventDefault();
    }
  };

  // ── Press-and-hold tooltip (touch / pen) for the timeline's buttons ──

  private _tip: { id: number; timer: ReturnType<typeof setTimeout> | null; x: number; y: number } | null = null;
  private _tipHideTimer: ReturnType<typeof setTimeout> | null = null;

  /** Capture-phase pointerdown on the panel (outside the zone): a held button shows its title. */
  private readonly _onPanelPointerDownCapture = (e: PointerEvent): void => {
    this._swallowNextClick = false;   // a new press: its own click counts
    if (e.pointerType === 'mouse') return;
    const btn = (e.target as Element | null)?.closest?.('button');
    const panel = this.timelinePanelRef?.nativeElement;
    if (!btn || !panel || !panel.contains(btn)) return;
    const text = btn.getAttribute('title') || btn.getAttribute('aria-label') || '';
    if (!text) return;
    this._clearTipTimer();
    const timer = setTimeout(() => {
      if (!this._tip) return;
      this._tip.timer = null;
      const r = btn.getBoundingClientRect();
      // In the zone (once per hold): the host's raised class (floatingOpen) is the parent view's binding
      this.ngZone.run(() => {
        this.holdTip = { text, x: Math.max(4, Math.min(r.left, window.innerWidth - 244)), y: r.top - 4 };
        this._swallowNextClick = true;
        this.cdr.markForCheck();
      });
    }, LONG_PRESS_MS);
    this._tip = { id: e.pointerId, timer, x: e.clientX, y: e.clientY };
  };

  private readonly _onDocPointerMoveForTip = (e: PointerEvent): void => {
    const t = this._tip;
    if (t?.timer && e.pointerId === t.id && Math.hypot(e.clientX - t.x, e.clientY - t.y) > LONG_PRESS_SLOP_PX) this._clearTipTimer();
  };

  private readonly _onDocPointerEndForTip = (e: PointerEvent): void => {
    if (!this._tip || e.pointerId !== this._tip.id) return;
    this._clearTipTimer();
    if (this.holdTip) {
      if (this._tipHideTimer) clearTimeout(this._tipHideTimer);
      this._tipHideTimer = setTimeout(() => {
        this._tipHideTimer = null;
        this.ngZone.run(() => { this.holdTip = null; this.cdr.markForCheck(); });
      }, HOLD_TIP_LINGER_MS);
    }
  };

  private _clearTipTimer(): void {
    if (this._tip?.timer) clearTimeout(this._tip.timer);
    this._tip = null;
  }

  /** Subscriptions are live (BehaviorSubjects replay synchronously in ngOnInit — no view refresh needed then). */
  private _ready = false;

  /** The keys onKeyDown handles (Alt+, / Alt+. included). */
  private static readonly HOTKEYS = new Set([' ', ',', '.', 'Home', 'End', 'd', 'D', 'Delete', 'F5', 'F6', 'F7', 'o', 'O']);
  /** Document keydown, listened OUTSIDE the zone (zone audit item 2): as a @HostListener every key in the editor —
   *  each WASD / space auto-repeat in Play too — ran an app change detection. Enters only for a timeline key outside
   *  Play (a repeat that only claims its key stays outside), and marks this OnPush view (the HostListener did). */
  private readonly _onDocKeyDownOutsideZone = (e: KeyboardEvent): void => {
    if (this.editorState.playing || !AnimationTimelineComponent.HOTKEYS.has(e.key)) return;
    if (e.repeat && e.key !== ',' && e.key !== '.') { this.onKeyDown(e); return; }
    this.ngZone.run(() => { this.onKeyDown(e); this.cdr.markForCheck(); });
  };

  ngOnInit(): void {
    this.ngZone.runOutsideAngular(() => document.addEventListener('keydown', this._onDocKeyDownOutsideZone));
    this.subs.push(
      // Per frame of playback (emitted OUTSIDE the Angular zone: no app tick): only the playhead / current column /
      // counter move, by DOM writes, no change detection. Paused (scrub / step / click): the usual refresh.
      this.animService.currentFrame$.subscribe(f => {
        if (f === this.currentFrame) return;
        this.currentFrame = f;
        if (this.isPlaying && this._ready) this._syncFrameDom();
        else this._refresh();
      }),
      this.animService.frameCount$.subscribe(c => { this.frameCount = c; this._rebuildFrames(); this._refresh(); }),
      this.animService.fps$.subscribe(f => { this.fps = f; this._refresh(); }),
      this.animService.isPlaying$.subscribe(p => { this.isPlaying = p; this._refresh(); }),
      this.animService.loopMode$.subscribe(m => { this.loopMode = m; this._refresh(); }),
      this.animService.onionSkin$.subscribe(o => { this.onionSkin = { ...o }; this._refresh(); }),
      this.animService.timelineLayers$.subscribe(l => { this.layers = l; this._rebuildLayerRows(); this._refresh(); }),
      this.animService.playRangeStart$.subscribe(s => { this.playRangeStart = s; this._refresh(); }),
      this.animService.playRangeEnd$.subscribe(e => { this.playRangeEnd = e; this._refresh(); }),
    );
    this._ready = true;
    // The height the user dragged the timeline to last time on this device
    try {
      const saved = Number(localStorage.getItem(TIMELINE_HEIGHT_KEY));
      if (saved >= TIMELINE_MIN_H) this.setPanelHeight(saved);
    } catch { /* storage off */ }
  }

  /** Listeners that must stay outside the zone (per scroll / touchmove / pointer event) or be non-passive / capture. */
  private _viewListeners: Array<() => void> = [];

  ngAfterViewInit(): void {
    const grid = this.timelineGridRef?.nativeElement;
    const labels = this.timelineLayersRef?.nativeElement;
    const panel = this.timelinePanelRef?.nativeElement;
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Document | undefined, type: K,
      fn: (e: HTMLElementEventMap[K]) => void, opts: AddEventListenerOptions) => {
      if (!el) return;
      el.addEventListener(type, fn as EventListener, opts);
      this._viewListeners.push(() => el.removeEventListener(type, fn as EventListener, opts));
    };
    this.ngZone.runOutsideAngular(() => {
      on(grid, 'scroll', () => this.onGridVerticalScroll(), { passive: true });
      on(labels, 'scroll', () => this.onLayersScroll(), { passive: true });
      on(grid, 'touchstart', (e) => this.onGridTouchStart(e), { passive: true });
      on(grid, 'touchmove', (e) => this.onGridTouchMove(e), { passive: false });
      on(grid, 'touchend', (e) => this.onGridTouchEnd(e), { passive: true });
      on(grid, 'touchcancel', (e) => this.onGridTouchEnd(e), { passive: true });
      on(panel, 'pointerdown', this._onPanelPointerDownCapture, { capture: true });
      on(panel, 'click', this._onPanelClickCapture, { capture: true });
      on(document, 'pointermove', this._onDocPointerMoveForTip, { passive: true });
      on(document, 'pointerup', this._onDocPointerEndForTip, { passive: true });
      on(document, 'pointercancel', this._onDocPointerEndForTip, { passive: true });
    });
    this.onGridVerticalScroll();
  }

  ngOnDestroy(): void {
    this._ready = false;
    document.removeEventListener('keydown', this._onDocKeyDownOutsideZone);
    this._viewListeners.forEach(off => off());
    this._viewListeners = [];
    this._drag?.cleanup();
    this._cancelLongPress();
    this._clearTipTimer();
    if (this._tipHideTimer) clearTimeout(this._tipHideTimer);
    // The overlays above the timeline go back to their default offset (no timeline now)
    this._editorHost()?.style.removeProperty('--fm-timeline-h');
    this.subs.forEach(s => s.unsubscribe());
    // No timeline on screen = nothing to pause it from (animation turned off, the editor left): don't leave the clock
    // running in the background.
    this.animService.pausePlayback();
  }

  /** Inputs arrive as new arrays, but keyframe tracks can also change in place (auto-key records into the live
   *  mesh.keyframeTracks) — so the 3D rows are keyed on a cheap hash of every track's frames, checked here (this
   *  runs whenever the host is checked, OnPush or not). */
  ngDoCheck(): void {
    const sig = this._mesh3dSignature();
    if (this.mesh3dAllTracks !== this._mesh3dSource || sig !== this._mesh3dSig) {
      this._rebuildMesh3dRows();
      this.cdr.markForCheck();
    }
  }

  /** In the zone: mark (the app tick that follows checks this view). Outside it (engine events, drags, a paused
   *  scrub): check this view now — nothing else will. */
  private _refresh(): void {
    if (!this._ready) return;
    if (NgZone.isInAngularZone()) this.cdr.markForCheck();
    else this._detect();
  }

  /** A local check of this view (outside the zone) + the per-frame DOM it doesn't bind. */
  private _detect(): void {
    this.cdr.detectChanges();
    this._syncFrameDom();
  }

  /** After every check of this view by its parent (an app tick): keep the per-frame DOM in step. */
  ngAfterViewChecked(): void {
    this._syncFrameDom();
  }

  /** What _syncFrameDom last wrote. */
  private _domFrame = -1;
  private _domFrameWidth = -1;
  private _domFrameCount = -1;

  /** The playhead, the current-frame column (header cap + the row sections' highlights) and the "N / M" counter:
   *  written here, not bound. Per frame of playback this is all the timeline does: transform-only moves (the two
   *  columns on their own layers) + two short texts in size-contained boxes (no change detection or row repaint). */
  private _syncFrameDom(): void {
    const f = this.currentFrame;
    const fw = this.frameWidth;
    const fc = this.frameCount;
    const cap = this.curFrameCapRef?.nativeElement;
    if (f !== this._domFrame || fw !== this._domFrameWidth) {
      const col = 'translateX(' + (f - 1) * fw + 'px)';
      if (cap) cap.style.transform = col;
      const c2 = this.curCol2dRef?.nativeElement;
      if (c2) c2.style.transform = col;
      const c3 = this.curCol3dRef?.nativeElement;
      if (c3) c3.style.transform = col;
      const ph = this.playheadRef?.nativeElement;
      if (ph) ph.style.transform = this.playheadTransform;
    }
    if (f !== this._domFrame && cap) setText(cap, String(f));
    if (f !== this._domFrame || fc !== this._domFrameCount) {
      const counter = this.frameCounterRef?.nativeElement;
      if (counter) {
        const text = f + ' / ' + fc;
        setText(counter, text);
        // Its width = the text's (monospace ch), as the plain text had: set only when the digit count changes (9 → 10),
        // the only frames where the counter can move anything around it
        if (text.length !== this._domCounterLen) {
          this._domCounterLen = text.length;
          counter.style.width = text.length + 'ch';
        }
      }
    }
    this._domFrame = f;
    this._domFrameWidth = fw;
    this._domFrameCount = fc;
  }
  private _domCounterLen = -1;

  // ── View model for the template (rebuilt only when its inputs change) ─────

  /** 1..frameCount. */
  frames: number[] = [];
  /** The frame numbers' titles (index = frame - 1). */
  frameTitles: string[] = [];
  layerRows: LayerRowView[] = [];
  mesh3dRows: Mesh3dRowView[] = [];
  private _mesh3dSource: AnimationTimelineComponent['mesh3dAllTracks'] | null = null;
  private _mesh3dSig = 0;

  private _rebuildFrames(): void {
    if (this.frames.length !== this.frameCount) {
      const arr: number[] = [];
      const titles: string[] = [];
      for (let i = 1; i <= this.frameCount; i++) {
        arr.push(i);
        titles.push('Click to jump to frame ' + i + '. Drag to scrub.');
      }
      this.frames = arr;
      this.frameTitles = titles;
    }
    this._rebuildLayerRows();
    this._rebuildMesh3dRows();
  }

  private _rebuildLayerRows(): void {
    const n = this.frameCount;
    this.layerRows = this.layers.map(layer => {
      const cells: CelCellView[] = [];
      if (layer.animated) {
        for (let f = 1; f <= n; f++) {
          // the same predicates the template used to call per cell (getCelAtFrame / isCelStart / ...)
          const cel = this.getCelAtFrame(layer, f);
          const hold = !!cel && cel.frame !== f;
          cells.push({
            f,
            start: this.isCelStart(layer, f),
            hold,
            blank: !cel,
            end: !!cel && f === cel.frame + cel.duration - 1,
            cel,
            title: !cel ? CELL_TITLE_BLANK : hold ? CELL_TITLE_HOLD : CELL_TITLE_DRAWING,
          });
        }
      }
      return { layer, cells };
    });
  }

  private _rebuildMesh3dRows(): void {
    const n = this.frameCount;
    this._mesh3dSource = this.mesh3dAllTracks;
    this._mesh3dSig = this._mesh3dSignature();
    this.mesh3dRows = this.mesh3dAllTracks.map(entry => {
      const tracks = this.getTrackDefsForEntry(entry).map(def => {
        const keys = this.getTrackFrameSet(entry.tracks, def.key);
        const titles: string[] = [];
        const kfKeys: string[] = [];
        for (let f = 1; f <= n; f++) {
          const has = keys.has(f);
          titles.push(has ? def.label + ' keyframe at frame ' + f + ' — right-click or long-press to change easing' : '');
          kfKeys.push(has ? this.kfKey(entry.meshId, def.key, f) : '');
        }
        return { def, keys, titles, kfKeys };
      });
      const anyKey: boolean[] = [];
      for (let f = 1; f <= n; f++) anyKey.push(tracks.some(t => t.keys.has(f)));
      return { entry, anyKey, tracks };
    });
  }

  /** A hash of every displayed track's keyframe frames (allocation-free: it runs on every host check). */
  private _mesh3dSignature(): number {
    let h = this.mesh3dAllTracks.length | 0;
    for (const entry of this.mesh3dAllTracks) {
      for (const def of this.getTrackDefsForEntry(entry)) {
        const track: Array<{ frame: number }> | undefined = entry.tracks?.[def.key];
        h = (Math.imul(h, 31) + (track ? track.length + 1 : 0)) | 0;
        if (track) for (const kf of track) h = (Math.imul(h, 31) + (kf.frame | 0)) | 0;
      }
    }
    return h;
  }

  trackByIndex(i: number): number { return i; }
  trackById(_i: number, item: { id: string }): string { return item.id; }
  trackByRowLayerId(_i: number, row: LayerRowView): string { return row.layer.id; }
  trackByMeshRow(_i: number, row: Mesh3dRowView): string { return row.entry.meshId; }
  trackByTrackRow(_i: number, row: TrackRowView): string { return row.def.key; }
  trackByEntry(_i: number, entry: { meshId: string }): string { return entry.meshId; }
  trackByDefKey(_i: number, def: { key: string }): string { return def.key; }

  /** The playhead's x (transform — no layout per frame). */
  get playheadTransform(): string {
    return 'translateX(' + ((this.currentFrame - 1) * this.frameWidth + this.frameWidth / 2 - 1) + 'px)';
  }

  get windowHeight(): number {
    return window.innerHeight;
  }

  // ── Playback controls ─────────────────────────────────────

  goToFirstFrame(): void { this.animService.setCurrentFrame(1); }
  goToPrevFrame(): void { this.animService.prevFrame(); }
  togglePlayPause(): void { this.animService.togglePlayPause(); }
  goToNextFrame(): void { this.animService.nextFrame(); }
  goToLastFrame(): void { this.animService.setCurrentFrame(this.frameCount); }
  stopPlayback(): void { this.animService.stopPlayback(); }

  // ── Frame click / scrub ───────────────────────────────────

  onFrameClick(frame: number): void {
    this.animService.setCurrentFrame(frame);
  }

  /** The frame under a viewport x (the grid's columns, scroll included), clamped to 1..frameCount. */
  frameAtClientX(clientX: number): number {
    const grid = this.timelineGridRef?.nativeElement;
    const left = grid ? grid.getBoundingClientRect().left - grid.scrollLeft : 0;
    return Math.max(1, Math.min(this.frameCount, Math.floor((clientX - left) / this.frameWidth) + 1));
  }

  /** Scrub along the frame numbers. Mouse: relative to where the press started (as before). Touch / pen: the frame
   *  under the finger, so the playhead stays under it. */
  onFrameHeaderPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const startX = event.clientX;
    const startFrame = this.currentFrame;
    const underFinger = event.pointerType !== 'mouse';
    this._beginPointerDrag(event, {
      move: (e) => {
        const newFrame = underFinger
          ? this.frameAtClientX(e.clientX)
          : Math.max(1, Math.min(this.frameCount, startFrame + Math.round((e.clientX - startX) / this.frameWidth)));
        if (newFrame !== this.currentFrame) this.animService.setCurrentFrame(newFrame);
      },
      // The drop: the zone entry in _beginPointerDrag runs the change detection for the scrubbed frame
      up: () => {},
      cancel: () => {},
    });
  }

  onPlayRangeHandlePointerDown(event: PointerEvent, which: 'start' | 'end'): void {
    event.stopPropagation();
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const startX = event.clientX;
    const startValue = which === 'start' ? this.playRangeStart : this.playRangeEnd;
    const orig: [number, number] = [this.playRangeStart, this.playRangeEnd];
    this._beginPointerDrag(event, {
      move: (e) => {
        const dx = e.clientX - startX;
        const frameDelta = Math.round(dx / this.frameWidth);
        const newValue = Math.max(1, Math.min(this.frameCount, startValue + frameDelta));
        if (which === 'start') {
          this.animService.setPlayRange(Math.min(newValue, this.playRangeEnd - 1), this.playRangeEnd);
        } else {
          this.animService.setPlayRange(this.playRangeStart, Math.max(newValue, this.playRangeStart + 1));
        }
      },
      up: () => {},
      // The browser took the touch: back to the range it had
      cancel: () => {
        if (this.playRangeStart !== orig[0] || this.playRangeEnd !== orig[1]) this.animService.setPlayRange(orig[0], orig[1]);
      },
    });
  }

  // ── Timeline zoom (ctrl + scroll, or a two-finger pinch on the grid) ──

  onTimelineWheel(event: WheelEvent): void {
    if (event.ctrlKey) {
      event.preventDefault();
      this.frameWidth = Math.max(this.minFrameWidth, Math.min(this.maxFrameWidth,
        this.frameWidth - Math.sign(event.deltaY) * 4));
    }
  }

  private _pinch: { d0: number; fw0: number } | null = null;

  private static _touchDist(e: PinchTouchEvent): number {
    const a = e.touches[0];
    const b = e.touches[1];
    return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
  }

  /** (Grid touchstart, outside the zone.) A second finger starts a pinch: any press / drag the first one began is
   *  dropped. */
  onGridTouchStart(e: PinchTouchEvent): void {
    if (e.touches.length < 2) return;
    if (this._drag || this._lp) this.ngZone.run(() => { this._cancelPendingGestures(); this.cdr.markForCheck(); });
    this._pinch = { d0: AnimationTimelineComponent._touchDist(e), fw0: this.frameWidth };
  }

  /** (Grid touchmove, non-passive, outside the zone.) A pinch sets the frame width, keeping the frame between the
   *  fingers in place; a touch drag (cel / handle) keeps the browser from also scrolling the grid. */
  onGridTouchMove(e: PinchTouchEvent): void {
    if (this._pinch && e.touches.length >= 2) {
      if (e.cancelable !== false) e.preventDefault?.();
      const fw = pinchFrameWidth(this._pinch.fw0, this._pinch.d0, AnimationTimelineComponent._touchDist(e), this.minFrameWidth, this.maxFrameWidth);
      if (fw === this.frameWidth) return;
      const grid = this.timelineGridRef?.nativeElement;
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - (grid ? grid.getBoundingClientRect().left : 0);
      const anchor = grid ? (grid.scrollLeft + midX) / this.frameWidth : 0;
      this.frameWidth = fw;
      this._detect();
      if (grid) grid.scrollLeft = Math.max(0, anchor * fw - midX);
      return;
    }
    if (this._touchDragLock && e.cancelable !== false) e.preventDefault?.();
  }

  onGridTouchEnd(e: PinchTouchEvent): void {
    if (e.touches.length < 2) this._pinch = null;
  }

  // ── Cel interactions ──────────────────────────────────────

  getCelAtFrame(layer: TimelineLayerInfo, frame: number): CelInfo | null {
    return layer.cels.find(c => c.frame <= frame && frame < c.frame + c.duration) ?? null;
  }

  isCelStart(layer: TimelineLayerInfo, frame: number): boolean {
    return layer.cels.some(c => c.frame === frame);
  }

  isCelHold(layer: TimelineLayerInfo, frame: number): boolean {
    const cel = this.getCelAtFrame(layer, frame);
    return !!cel && cel.frame !== frame;
  }

  /** True when this frame is the last frame occupied by a cel */
  isCelEnd(layer: TimelineLayerInfo, frame: number): boolean {
    const cel = this.getCelAtFrame(layer, frame);
    return !!cel && frame === cel.frame + cel.duration - 1;
  }

  isBlankFrame(layer: TimelineLayerInfo, frame: number): boolean {
    return !this.getCelAtFrame(layer, frame);
  }

  onCellDoubleClick(layer: TimelineLayerInfo, frame: number): void {
    if (!layer.animated) return;
    if (this.isBlankFrame(layer, frame)) {
      this.animService.addCelAtFrame(layer.id, frame);
    }
  }

  /** A tap / click on a cel cell: jump there, and it becomes the selected cel (outlined; ⋯ and the cel buttons act on
   *  its layer). */
  onCellClick(layer: TimelineLayerInfo, frame: number): void {
    this.onFrameClick(frame);
    this.selectedCellLayerId = layer.id;
    this.selectedCellFrame = frame;
    this._menuTarget = { kind: 'cel', layerId: layer.id, frame };
  }

  /** A tap / click on a layer's name or static bar: ⋯ opens that layer's menu. */
  onLayerTap(layer: TimelineLayerInfo): void {
    this._menuTarget = { kind: 'layer', layerId: layer.id };
  }

  // ── Context menu ──────────────────────────────────────────

  /** Right-click on a layer label (works for both static and animated layers) */
  onLayerLabelContextMenu(event: MouseEvent, layer: TimelineLayerInfo): void {
    event.preventDefault();
    event.stopPropagation();
    this._openLayerMenuAt(event.clientX, event.clientY, layer, layer.animated);
  }

  /** Right-click on a static (non-animated) layer's bar */
  onStaticBarContextMenu(event: MouseEvent, layer: TimelineLayerInfo): void {
    event.preventDefault();
    event.stopPropagation();
    this._openLayerMenuAt(event.clientX, event.clientY, layer, false);
  }

  /** Touch / pen: long-press a layer label = its right-click menu. */
  onLayerLabelPointerDown(event: PointerEvent, layer: TimelineLayerInfo): void {
    this.startLongPress(event, (x, y) => this._openLayerMenuAt(x, y, layer, layer.animated));
  }

  /** Touch / pen: long-press a static layer's bar = its right-click menu ("Make Animated"). */
  onStaticBarPointerDown(event: PointerEvent, layer: TimelineLayerInfo): void {
    this.startLongPress(event, (x, y) => this._openLayerMenuAt(x, y, layer, false));
  }

  /** Right-click on an animated layer's per-frame cell */
  onCellContextMenu(event: MouseEvent, layer: TimelineLayerInfo, frame: number): void {
    event.preventDefault();
    event.stopPropagation();
    this._openCelMenuAt(event.clientX, event.clientY, layer, frame);
  }

  private _openLayerMenuAt(x: number, y: number, layer: TimelineLayerInfo, animated: boolean): void {
    this._cancelPendingGestures();
    this._menuTarget = { kind: 'layer', layerId: layer.id };
    this._placeContextMenu(x, y);
    this.contextMenuLayerId = layer.id;
    this.contextMenuFrame = this.currentFrame;
    this.contextMenuCelId = '';
    this.contextMenuLayerAnimated = animated;
    this.contextMenuVisible = true;
    this._clampMenusSoon();
  }

  private _openCelMenuAt(x: number, y: number, layer: TimelineLayerInfo, frame: number): void {
    this._cancelPendingGestures();
    this._menuTarget = { kind: 'cel', layerId: layer.id, frame };
    this._placeContextMenu(x, y);
    this.contextMenuLayerId = layer.id;
    this.contextMenuFrame = frame;
    const cel = this.getCelAtFrame(layer, frame);
    this.contextMenuCelId = cel?.id ?? '';
    this.contextMenuLayerAnimated = layer.animated;
    this.contextMenuVisible = true;
    this._clampMenusSoon();
  }

  private _placeContextMenu(x: number, y: number): void {
    this.contextMenuX = x;
    this.contextMenuY = y;
    this.contextMenuFlipUp = y > window.innerHeight / 2;
    this.showEasingMenu = false;
    this.showTrackMenu = false;
  }

  /** The transport bar's ⋯: the menu a right-click / long-press opens, for the cel / keyframe / layer / track tapped
   *  last (the current frame of the first animated layer when nothing was). */
  openSelectionMenu(event: MouseEvent): void {
    event.stopPropagation();
    const r = (event.currentTarget as HTMLElement | null)?.getBoundingClientRect?.();
    const x = r ? r.left : event.clientX;
    const y = r ? r.top : event.clientY;
    const t = this._resolveMenuTarget();
    if (!t) return;
    if (t.kind === 'kf') {
      this._openKfMenuAt(x, y, t.meshId, t.trackKey, t.frame, t.isCamera);
    } else if (t.kind === 'track') {
      this._openTrackMenuAt(x, y, t.meshId, t.trackKey, t.isCamera);
    } else {
      const layer = this.layers.find(l => l.id === t.layerId)!;
      if (t.kind === 'cel' && layer.animated) this._openCelMenuAt(x, y, layer, t.frame);
      else this._openLayerMenuAt(x, y, layer, layer.animated);
    }
  }

  /** The ⋯ target, if it still exists; else the first animated layer at the current frame; else the first layer. */
  private _resolveMenuTarget(): MenuTarget | null {
    const t = this._menuTarget;
    if (t) {
      if ((t.kind === 'cel' || t.kind === 'layer') && this.layers.some(l => l.id === t.layerId)) return t;
      if (t.kind === 'kf' || t.kind === 'track') {
        const entry = this.mesh3dAllTracks.find(e => e.meshId === t.meshId);
        const track: Array<{ frame: number }> | undefined = entry?.tracks?.[t.trackKey];
        if (entry && (t.kind === 'track' || track?.some(k => k.frame === t.frame))) return t;
      }
    }
    const anim = this.layers.find(l => l.animated);
    if (anim) return { kind: 'cel', layerId: anim.id, frame: this.currentFrame };
    return this.layers[0] ? { kind: 'layer', layerId: this.layers[0].id } : null;
  }

  closeContextMenu(): void {
    this.contextMenuVisible = false;
    this.showEasingMenu = false;
    this.showTrackMenu = false;
  }

  /** Keep the open menus inside the viewport (x and y), measured once they have rendered. */
  private _clampMenusSoon(): void {
    if (typeof requestAnimationFrame !== 'function') return;
    this.ngZone.runOutsideAngular(() => requestAnimationFrame(() => this.clampOpenMenus()));
  }

  clampOpenMenus(): void {
    const host = this.hostRef?.nativeElement;
    if (!host) return;
    let changed = false;
    for (const el of Array.from(host.querySelectorAll<HTMLElement>('.ctx-menu[data-menu]'))) {
      const r = el.getBoundingClientRect();
      const pos = clampMenuToViewport(r.left, r.top, r.width, r.height, window.innerWidth, window.innerHeight);
      if (Math.abs(pos.left - r.left) < 0.5 && Math.abs(pos.top - r.top) < 0.5) continue;
      if (el.dataset['menu'] === 'track') {
        this.trackMenuX = pos.left;
        this.trackMenuY = pos.top;
        this.trackMenuFlipUp = false;
      } else {
        this.contextMenuX = pos.left;
        this.contextMenuY = pos.top;
        this.contextMenuFlipUp = false;
      }
      changed = true;
    }
    if (changed) this._detect();
  }

  ctxNewCel(): void {
    this.animService.addCelAtFrame(this.contextMenuLayerId, this.contextMenuFrame);
    this.closeContextMenu();
  }

  ctxDeleteCel(): void {
    if (this.contextMenuCelId) {
      this.animService.deleteCel(this.contextMenuLayerId, this.contextMenuCelId);
    }
    this.closeContextMenu();
  }

  ctxInsertFrame(): void {
    this.animService.insertFrame(this.contextMenuFrame);
    this.closeContextMenu();
  }

  ctxDeleteFrame(): void {
    this.animService.deleteFrame(this.contextMenuFrame);
    this.closeContextMenu();
  }

  // ── Cel operations (from context menu) ────────────────────

  ctxSetCelType(type: CelType): void {
    if (this.contextMenuCelId) {
      this.animService.setCelType(this.contextMenuLayerId, this.contextMenuCelId, type);
    }
    this.closeContextMenu();
  }

  ctxDuplicateCel(): void {
    if (!this.contextMenuCelId) { this.closeContextMenu(); return; }
    this.duplicateTargetFrame = this.contextMenuFrame + 1;
    this.showDuplicatePrompt = true;
    this.closeContextMenu();
  }

  confirmDuplicate(): void {
    if (this.contextMenuCelId && this.contextMenuLayerId) {
      this.animService.duplicateCel(this.contextMenuLayerId, this.contextMenuCelId, this.duplicateTargetFrame);
    }
    this.showDuplicatePrompt = false;
  }

  cancelDuplicate(): void {
    this.showDuplicatePrompt = false;
  }

  /** The cel the open menu is for (its hold length shows in the menu). */
  get contextCel(): CelInfo | null {
    if (!this.contextMenuCelId) return null;
    return this.layers.find(l => l.id === this.contextMenuLayerId)?.cels.find(c => c.id === this.contextMenuCelId) ?? null;
  }

  /** The menu's Hold − / +: one frame shorter / longer (never into the next drawing, never past the last frame). The
   *  menu stays open so it can be tapped again. */
  ctxHoldDelta(event: Event, delta: number): void {
    event.stopPropagation();
    const layer = this.layers.find(l => l.id === this.contextMenuLayerId);
    const cel = this.contextCel;
    if (!layer || !cel) return;
    const next = layer.cels.filter(c => c.frame > cel.frame).sort((a, b) => a.frame - b.frame)[0];
    const max = next ? next.frame - cel.frame : Math.max(1, this.frameCount - cel.frame + 1);
    const dur = Math.max(1, Math.min(max, cel.duration + delta));
    if (dur !== cel.duration) this.animService.setCelDuration(layer.id, cel.id, dur);
  }

  /** "Move to Frame…": a frame-number prompt (like Duplicate to Frame…), then moveCel. */
  ctxMoveCel(): void {
    this._openCelFramePrompt('move');
  }

  /** "Swap with…": a frame-number prompt (the next drawing's frame by default), then swapCels with the cel there. */
  ctxSwapCel(): void {
    this._openCelFramePrompt('swap');
  }

  private _openCelFramePrompt(mode: 'move' | 'swap'): void {
    this._clearCelDrag();
    if (!this.contextMenuCelId) { this.closeContextMenu(); return; }
    const layer = this.layers.find(l => l.id === this.contextMenuLayerId);
    const cel = this.contextCel;
    let target = this.contextMenuFrame + 1;
    if (mode === 'swap' && layer && cel) {
      const others = layer.cels.filter(c => c.id !== cel.id).sort((a, b) => a.frame - b.frame);
      const next = others.find(c => c.frame > cel.frame) ?? others[others.length - 1];
      if (next) target = next.frame;
    }
    this.celFramePromptMode = mode;
    this.celFramePromptTarget = Math.max(1, Math.min(this.frameCount, target));
    this.showCelFramePrompt = true;
    this.closeContextMenu();
  }

  /** Swap: the other cel at the prompt's frame (null = nothing to swap with there — the button is disabled). */
  get celFramePromptSwapTarget(): CelInfo | null {
    const layer = this.layers.find(l => l.id === this.contextMenuLayerId);
    if (!layer) return null;
    const c = this.getCelAtFrame(layer, Math.round(+this.celFramePromptTarget));
    return c && c.id !== this.contextMenuCelId ? c : null;
  }

  confirmCelFrameAction(): void {
    const layerId = this.contextMenuLayerId;
    const celId = this.contextMenuCelId;
    if (layerId && celId) {
      if (this.celFramePromptMode === 'move') {
        const target = Math.max(1, Math.min(this.frameCount, Math.round(+this.celFramePromptTarget)));
        this.animService.moveCel(layerId, celId, target);
      } else {
        const other = this.celFramePromptSwapTarget;
        if (other) this.animService.swapCels(layerId, celId, other.id);
      }
    }
    this.showCelFramePrompt = false;
  }

  cancelCelFramePrompt(): void {
    this.showCelFramePrompt = false;
  }

  /** A target-frame field's −/+ (touch: the on-screen keyboard can cover the field). */
  stepFrame(value: number, delta: number): number {
    return Math.max(1, Math.min(this.frameCount, Math.round(+value || 1) + delta));
  }

  private _clearCelDrag(): void {
    this.isDragging = false;
    this.isDragSwap = false;
    this.draggingCelId = '';
    this._touchDragLock = false;
  }

  // ── Cel drag (press on a cel) ─────────────────────────────

  /** Press on a cel cell. Mouse / pen: a drag moves the drawing once it has moved 4 px (Alt = swap), as before.
   *  Touch: the drag needs a CEL_TOUCH_DRAG_DELAY_MS press first (the cel lights up), so a quick swipe still scrolls
   *  the grid. Touch / pen: a still LONG_PRESS_MS press opens the cel menu instead. */
  onCelPointerDown(event: PointerEvent, layer: TimelineLayerInfo, frame: number): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    this.startLongPress(event, (x, y) => this._openCelMenuAt(x, y, layer, frame));
    const cel = this.getCelAtFrame(layer, frame);
    if (!cel || !layer.animated) return;

    this.draggingCelId = cel.id;
    this.draggingLayerId = layer.id;
    this.draggingFromFrame = frame;
    this.dragGhostFrame = frame;
    this.isDragSwap = event.altKey;
    this.isDragging = false;

    const x0 = event.clientX;
    const y0 = event.clientY;
    const touch = event.pointerType === 'touch';
    // Pen: immediate like the mouse; the touchmove lock keeps an Android stylus from panning the grid instead
    this._touchDragLock = event.pointerType === 'pen';
    let armed = !touch;
    let armTimer: ReturnType<typeof setTimeout> | null = null;
    if (touch) {
      this.ngZone.runOutsideAngular(() => {
        armTimer = setTimeout(() => {
          armTimer = null;
          armed = true;
          this._touchDragLock = true;
          this.isDragging = true;      // the cel lights up: it is picked up
          this._detect();
        }, CEL_TOUCH_DRAG_DELAY_MS);
      });
    }
    const finish = () => {
      if (armTimer) { clearTimeout(armTimer); armTimer = null; }
      this._clearCelDrag();
    };

    this._beginPointerDrag(event, {
      move: (e) => {
        if (!armed) {
          // A swipe before the hold: the browser scrolls the grid (a pointercancel follows); never arm this press
          if (armTimer && Math.hypot(e.clientX - x0, e.clientY - y0) > LONG_PRESS_SLOP_PX) { clearTimeout(armTimer); armTimer = null; }
          return;
        }
        if (!this.isDragging && Math.abs(e.clientX - x0) > DRAG_THRESHOLD_PX) this.isDragging = true;
        if (this.isDragging) {
          const ghost = Math.max(1, Math.min(this.frameCount, this.draggingFromFrame + Math.round((e.clientX - x0) / this.frameWidth)));
          if (ghost !== this.draggingFromFrame) {
            this._cancelLongPress();
            this.contextMenuVisible = false;   // the OS long-press menu event may have opened it
          }
          this.dragGhostFrame = ghost;
          this.isDragSwap = e.altKey;
          this._detect();   // outside the zone (_beginPointerDrag): re-render this view only
        }
      },
      up: () => {
        if (this.isDragging && this.dragGhostFrame !== this.draggingFromFrame) {
          if (this.isDragSwap) {
            // Swap with whatever cel is at target frame
            const targetCel = this.getCelAtFrame(
              this.layers.find(l => l.id === this.draggingLayerId)!,
              this.dragGhostFrame
            );
            if (targetCel) {
              this.animService.swapCels(this.draggingLayerId, this.draggingCelId, targetCel.id);
            }
          } else {
            this.animService.moveCel(this.draggingLayerId, this.draggingCelId, this.dragGhostFrame);
          }
        }
        finish();
      },
      cancel: finish,
    });
  }

  // ── Hold duration drag (right edge of cel block) ──────────

  onDurationPointerDown(event: PointerEvent, layer: TimelineLayerInfo, cel: CelInfo): void {
    event.stopPropagation();
    event.preventDefault();
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    this.durationDragging = true;
    this.durationDragCelId = cel.id;
    this.durationDragLayerId = layer.id;
    this.durationDragStart = event.clientX;
    this.durationDragOriginal = cel.duration;

    // Find the next cel on this layer to cap the max duration
    const sortedCels = layer.cels
      .filter(c => c.frame > cel.frame)
      .sort((a, b) => a.frame - b.frame);
    const nextCelStart = sortedCels.length > 0 ? sortedCels[0].frame : Infinity;
    const maxDuration = nextCelStart - cel.frame; // can't overlap the next cel
    let current = cel.duration;

    this._beginPointerDrag(event, {
      move: (e) => {
        const dx = e.clientX - this.durationDragStart;
        const frameDelta = Math.round(dx / this.frameWidth);
        const newDuration = Math.max(1, Math.min(this.durationDragOriginal + frameDelta, maxDuration));
        if (newDuration === current) return;
        current = newDuration;
        this.animService.setCelDuration(this.durationDragLayerId, this.durationDragCelId, newDuration);
      },
      up: () => { this.durationDragging = false; },
      // The browser took the touch: back to the length it had
      cancel: () => {
        this.durationDragging = false;
        if (current !== this.durationDragOriginal) this.animService.setCelDuration(layer.id, cel.id, this.durationDragOriginal);
      },
    });
  }

  // ── Cel buttons (touch has no F6 / Ctrl+D / Delete) ──────

  /** The layer the cel keys / buttons act on: the selected cel's (if animated), else the first animated layer. */
  private _activeAnimLayer(): TimelineLayerInfo | undefined {
    const sel = this.layers.find(l => l.id === this.selectedCellLayerId);
    return sel?.animated ? sel : this.layers.find(l => l.animated);
  }

  /** Duplicate current cel to next frame and advance (Ctrl+D) */
  duplicateAndAdvance(): void {
    const layer = this._activeAnimLayer();
    if (!layer) return;
    const cel = this.getCelAtFrame(layer, this.currentFrame);
    if (!cel) return;
    const targetFrame = this.currentFrame + 1;
    this.animService.duplicateCel(layer.id, cel.id, targetFrame);
    this.animService.setCurrentFrame(targetFrame);
    this._followSelection(layer, targetFrame);
  }

  /** Next frame + a new blank cel there (F6). */
  newCelOnNextFrame(): void {
    const layer = this._activeAnimLayer();
    this.goToNextFrame();
    this.animService.addCelAtCurrentFrame(layer?.id ?? '');
    if (layer) this._followSelection(layer, this.animService.getCurrentFrame());
  }

  /** Delete the drawing on the current frame (Delete). */
  deleteCurrentCel(): void {
    const layer = this._activeAnimLayer();
    if (!layer) return;
    const cel = this.getCelAtFrame(layer, this.currentFrame);
    if (cel) this.animService.deleteCel(layer.id, cel.id);
  }

  /** The selection outline moves with the frame a cel key / button just went to (on the selected layer only). */
  private _followSelection(layer: TimelineLayerInfo, frame: number): void {
    if (this.selectedCellLayerId !== layer.id) return;
    this.selectedCellFrame = frame;
    this._menuTarget = { kind: 'cel', layerId: layer.id, frame };
  }

  // ── Resizable height (drag the top edge) ───────────────────

  private get _maxPanelHeight(): number {
    return Math.max(TIMELINE_MIN_H, Math.round(window.innerHeight * 0.6));
  }

  onResizePointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const panel = this.timelinePanelRef?.nativeElement;
    const h0 = panel ? panel.getBoundingClientRect().height : (this.panelHeight ?? 200);
    const before = this.panelHeight;
    const y0 = event.clientY;
    this._beginPointerDrag(event, {
      move: (e) => { this.setPanelHeight(h0 + (y0 - e.clientY)); this._detect(); },
      up: () => {
        try { if (this.panelHeight != null) localStorage.setItem(TIMELINE_HEIGHT_KEY, String(this.panelHeight)); } catch { /* storage off */ }
      },
      cancel: () => { this.setPanelHeight(before); },
    });
  }

  /** The panel's height (clamped; null = back to the stylesheet's), mirrored to --fm-timeline-h on the editor so the
   *  overlays that sit above the timeline (zoom box, mode panels, right column) follow it. */
  setPanelHeight(h: number | null): void {
    this.panelHeight = h == null ? null : Math.round(Math.max(TIMELINE_MIN_H, Math.min(this._maxPanelHeight, h)));
    const host = this._editorHost();
    if (!host) return;
    if (this.panelHeight == null) host.style.removeProperty('--fm-timeline-h');
    else host.style.setProperty('--fm-timeline-h', (this.panelHeight + TIMELINE_BORDER_PX) + 'px');
  }

  /** Where --fm-timeline-h is declared (illustration.component.scss :host). */
  private _editorHost(): HTMLElement | null {
    const el = this.hostRef?.nativeElement;
    return (el?.closest?.('app-illustration') as HTMLElement | null) ?? null;
  }

  ctxToggleLayerAnimated(): void {
    const layer = this.layers.find(l => l.id === this.contextMenuLayerId);
    if (layer) {
      this.animService.setLayerAnimated(layer.id, !layer.animated);
    }
    this.closeContextMenu();
  }

  getContextLayerAnimatedLabel(): string {
    const layer = this.layers.find(l => l.id === this.contextMenuLayerId);
    return layer?.animated ? 'Make Static' : 'Make Animated';
  }

  // ── FPS / Frame count / Loop mode ─────────────────────────

  onFpsChange(value: number): void {
    this.animService.setFps(Math.max(1, Math.min(120, +value)));
  }

  onFrameCountChange(value: number): void {
    this.animService.setFrameCount(Math.max(1, +value));
  }

  addFrames(count: number): void {
    this.animService.addFrames(count);
  }

  onLoopModeChange(mode: LoopMode): void {
    this.animService.setLoopMode(mode);
  }

  setFpsPreset(fps: number): void {
    this.animService.setFps(fps);
  }

  // ── Onion skin ────────────────────────────────────────────

  toggleOnionSkinPanel(): void {
    this.showOnionSkinPanel = !this.showOnionSkinPanel;
  }

  onOnionSkinEnabledChange(enabled: boolean): void {
    this.onionSkin.enabled = enabled;
    this.animService.setOnionSkin(this.onionSkin);
  }

  onOnionSkinBeforeChange(v: number): void {
    this.onionSkin.framesBefore = Math.round(v);
    this.animService.setOnionSkin(this.onionSkin);
  }

  onOnionSkinAfterChange(v: number): void {
    this.onionSkin.framesAfter = Math.round(v);
    this.animService.setOnionSkin(this.onionSkin);
  }

  onOnionSkinOpacityChange(v: number): void {
    this.onionSkin.opacity = v;
    this.animService.setOnionSkin(this.onionSkin);
  }

  setBeforeTint(tint: [number, number, number]): void {
    this.onionSkin.tintBefore = tint;
    this.animService.setOnionSkin(this.onionSkin);
  }

  setAfterTint(tint: [number, number, number]): void {
    this.onionSkin.tintAfter = tint;
    this.animService.setOnionSkin(this.onionSkin);
  }

  tintToRgb(tint: [number, number, number]): string {
    return `rgb(${Math.round(tint[0] * 255)}, ${Math.round(tint[1] * 255)}, ${Math.round(tint[2] * 255)})`;
  }

  tintEquals(a: [number, number, number], b: [number, number, number]): boolean {
    return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
  }

  // ── Settings panel ────────────────────────────────────────

  toggleSettingsPanel(): void {
    this.showSettingsPanel = !this.showSettingsPanel;
  }

  onPlayRangeStartChange(v: number): void {
    this.animService.setPlayRange(Math.max(1, +v), this.playRangeEnd);
  }

  onPlayRangeEndChange(v: number): void {
    this.animService.setPlayRange(this.playRangeStart, Math.min(this.frameCount, +v));
  }

  // ── Export ────────────────────────────────────────────────

  openExportDialog(): void {
    this.showExportDialog = true;
  }

  closeExportDialog(): void {
    this.showExportDialog = false;
  }

  // ── Keyboard shortcuts ────────────────────────────────────

  /** (Called by _onDocKeyDownOutsideZone.) */
  onKeyDown(event: KeyboardEvent): void {
    if (this.editorState.playing) return;   // Play mode owns the keyboard (editor hotkeys off)
    // Don't capture when typing in inputs
    const tag = (event.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    // A held key (auto-repeat): , / . (prev / next frame) and Alt+, / Alt+. (fps) keep stepping; everything else acts
    // once — Space toggled play ~30×/s, F5 / F6 added a cel per repeat. Claimed keys stay claimed (no page scroll, F5
    // reload, Ctrl+D bookmark on the repeats).
    if (event.repeat && event.key !== ',' && event.key !== '.') {
      if (event.key === ' ' || event.key === 'F5' || event.key === 'F6' || event.key === 'F7'
          || ((event.key === 'd' || event.key === 'D') && (event.ctrlKey || event.metaKey))) event.preventDefault();
      return;
    }

    switch (event.key) {
      case ' ':
        event.preventDefault();
        this.togglePlayPause();
        break;
      case ',':
        this.goToPrevFrame();
        break;
      case '.':
        this.goToNextFrame();
        break;
      case 'Home':
        this.goToFirstFrame();
        break;
      case 'End':
        this.goToLastFrame();
        break;
      case 'd':
      case 'D':
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();
          this.duplicateAndAdvance();
        }
        break;
      case 'Delete': {
        // Delete with a 3D selection in the 3D view is the editor's (routeDelete: the selected 3D items) — it must not
        // ALSO delete the current raster cel.
        if (this.editorState.scene3dPanelVisible && this.editorState.scene3dSelectedMeshId) break;
        this.deleteCurrentCel();
        break;
      }
      case 'F5':
        event.preventDefault();
        this.animService.addCelAtCurrentFrame(this._activeAnimLayer()?.id ?? '');
        break;
      case 'F6':
        event.preventDefault();
        this.newCelOnNextFrame();
        break;
      case 'F7':
        event.preventDefault();
        this.animService.insertFrame(this.currentFrame);
        break;
      case 'o':
      case 'O':
        if (!event.ctrlKey && !event.metaKey) {
          this.onionSkin.enabled = !this.onionSkin.enabled;
          this.animService.setOnionSkin(this.onionSkin);
        }
        break;
    }

    // Alt + , / Alt + . to adjust FPS
    if (event.altKey && event.key === ',') {
      this.animService.setFps(Math.max(1, this.fps - 1));
    }
    if (event.altKey && event.key === '.') {
      this.animService.setFps(Math.min(120, this.fps + 1));
    }
  }
}
