import {
  Component,
  OnInit,
  OnDestroy,
  HostListener,
  ElementRef,
  ViewChild,
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

@Component({
  selector: 'app-animation-timeline',
  standalone: false,
  templateUrl: './animation-timeline.component.html',
  styleUrl: './animation-timeline.component.scss',
})
export class AnimationTimelineComponent implements OnInit, OnDestroy {

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

  /** Sync vertical scroll from the grid to the layers column */
  onGridVerticalScroll(): void {
    if (this.timelineLayersRef?.nativeElement && this.timelineGridRef?.nativeElement) {
      this.timelineLayersRef.nativeElement.scrollTop = this.timelineGridRef.nativeElement.scrollTop;
    }
  }

  /** Forward mouse wheel on layers column to the grid so they scroll together */
  onLayersWheel(event: WheelEvent): void {
    if (this.timelineGridRef?.nativeElement) {
      this.timelineGridRef.nativeElement.scrollTop += event.deltaY;
      event.preventDefault();
    }
  }

  private subs: Subscription[] = [];

  constructor(public animService: RasterAnimationService) {}

  ngOnInit(): void {
    this.subs.push(
      this.animService.currentFrame$.subscribe(f => this.currentFrame = f),
      this.animService.frameCount$.subscribe(c => this.frameCount = c),
      this.animService.fps$.subscribe(f => this.fps = f),
      this.animService.isPlaying$.subscribe(p => this.isPlaying = p),
      this.animService.loopMode$.subscribe(m => this.loopMode = m),
      this.animService.onionSkin$.subscribe(o => this.onionSkin = { ...o }),
      this.animService.timelineLayers$.subscribe(l => this.layers = l),
      this.animService.playRangeStart$.subscribe(s => this.playRangeStart = s),
      this.animService.playRangeEnd$.subscribe(e => this.playRangeEnd = e),
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach(s => s.unsubscribe());
  }

  // ── Frame array for template ──────────────────────────────

  get frameNumbers(): number[] {
    const arr: number[] = [];
    for (let i = 1; i <= this.frameCount; i++) arr.push(i);
    return arr;
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

  onFrameHeaderMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return;
    const startX = event.clientX;
    const startFrame = this.currentFrame;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - startX;
      const frameDelta = Math.round(dx / this.frameWidth);
      const newFrame = Math.max(1, Math.min(this.frameCount, startFrame + frameDelta));
      this.animService.setCurrentFrame(newFrame);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ── Timeline zoom (ctrl + scroll) ─────────────────────────

  onTimelineWheel(event: WheelEvent): void {
    if (event.ctrlKey) {
      event.preventDefault();
      this.frameWidth = Math.max(this.minFrameWidth, Math.min(this.maxFrameWidth,
        this.frameWidth - Math.sign(event.deltaY) * 4));
    }
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

  // ── Context menu ──────────────────────────────────────────

  /** Right-click on a layer label (works for both static and animated layers) */
  onLayerLabelContextMenu(event: MouseEvent, layer: TimelineLayerInfo): void {
    event.preventDefault();
    event.stopPropagation();
    this.contextMenuX = event.clientX;
    this.contextMenuY = event.clientY;
    this.contextMenuFlipUp = event.clientY > window.innerHeight / 2;
    this.contextMenuLayerId = layer.id;
    this.contextMenuFrame = this.currentFrame;
    this.contextMenuCelId = '';
    this.contextMenuLayerAnimated = layer.animated;
    this.contextMenuVisible = true;
  }

  /** Right-click on a static (non-animated) layer's bar */
  onStaticBarContextMenu(event: MouseEvent, layer: TimelineLayerInfo): void {
    event.preventDefault();
    event.stopPropagation();
    this.contextMenuX = event.clientX;
    this.contextMenuY = event.clientY;
    this.contextMenuFlipUp = event.clientY > window.innerHeight / 2;
    this.contextMenuLayerId = layer.id;
    this.contextMenuFrame = this.currentFrame;
    this.contextMenuCelId = '';
    this.contextMenuLayerAnimated = false;
    this.contextMenuVisible = true;
  }

  /** Right-click on an animated layer's per-frame cell */
  onCellContextMenu(event: MouseEvent, layer: TimelineLayerInfo, frame: number): void {
    event.preventDefault();
    event.stopPropagation();
    this.contextMenuX = event.clientX;
    this.contextMenuY = event.clientY;
    this.contextMenuFlipUp = event.clientY > window.innerHeight / 2;
    this.contextMenuLayerId = layer.id;
    this.contextMenuFrame = frame;
    const cel = this.getCelAtFrame(layer, frame);
    this.contextMenuCelId = cel?.id ?? '';
    this.contextMenuLayerAnimated = layer.animated;
    this.contextMenuVisible = true;
  }

  closeContextMenu(): void {
    this.contextMenuVisible = false;
  }

  ctxNewCel(): void {
    console.log(`[Timeline] ctxNewCel: layerId=${this.contextMenuLayerId}, frame=${this.contextMenuFrame}, layerAnimated=${this.contextMenuLayerAnimated}`);
    const result = this.animService.addCelAtFrame(this.contextMenuLayerId, this.contextMenuFrame);
    console.log(`[Timeline] ctxNewCel result:`, result);
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
    console.log(`[Timeline] ctxSetCelType: celId=${this.contextMenuCelId}, layerId=${this.contextMenuLayerId}, type=${type}`);
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

  ctxMoveCel(): void {
    if (!this.contextMenuCelId) { this.closeContextMenu(); return; }
    // Start a drag from context menu
    this.draggingCelId = this.contextMenuCelId;
    this.draggingLayerId = this.contextMenuLayerId;
    this.draggingFromFrame = this.contextMenuFrame;
    this.isDragging = true;
    this.isDragSwap = false;
    this.closeContextMenu();
  }

  ctxSwapCel(): void {
    if (!this.contextMenuCelId) { this.closeContextMenu(); return; }
    this.draggingCelId = this.contextMenuCelId;
    this.draggingLayerId = this.contextMenuLayerId;
    this.draggingFromFrame = this.contextMenuFrame;
    this.isDragging = true;
    this.isDragSwap = true;
    this.closeContextMenu();
  }

  // ── Cel drag (mousedown on cel) ───────────────────────────

  onCelDragStart(event: MouseEvent, layer: TimelineLayerInfo, frame: number): void {
    if (event.button !== 0) return;
    const cel = this.getCelAtFrame(layer, frame);
    if (!cel || !layer.animated) return;

    this.draggingCelId = cel.id;
    this.draggingLayerId = layer.id;
    this.draggingFromFrame = frame;
    this.dragGhostFrame = frame;
    this.isDragSwap = event.altKey;

    const onMove = (e: MouseEvent) => {
      if (!this.isDragging && Math.abs(e.clientX - event.clientX) > 4) {
        this.isDragging = true;
      }
      if (this.isDragging) {
        const dx = e.clientX - event.clientX;
        this.dragGhostFrame = Math.max(1, Math.min(this.frameCount, this.draggingFromFrame + Math.round(dx / this.frameWidth)));
        this.isDragSwap = e.altKey;
      }
    };

    const onUp = (e: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
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
      this.isDragging = false;
      this.draggingCelId = '';
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ── Hold duration drag (right edge of cel block) ──────────

  onDurationDragStart(event: MouseEvent, layer: TimelineLayerInfo, cel: CelInfo): void {
    event.stopPropagation();
    event.preventDefault();
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

    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - this.durationDragStart;
      const frameDelta = Math.round(dx / this.frameWidth);
      const newDuration = Math.max(1, Math.min(this.durationDragOriginal + frameDelta, maxDuration));
      this.animService.setCelDuration(this.durationDragLayerId, this.durationDragCelId, newDuration);
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      this.durationDragging = false;
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  /** Duplicate current cel to next frame and advance (Ctrl+D) */
  duplicateAndAdvance(): void {
    const layer = this.layers.find(l => l.animated);
    if (!layer) return;
    const cel = this.getCelAtFrame(layer, this.currentFrame);
    if (!cel) return;
    const targetFrame = this.currentFrame + 1;
    this.animService.duplicateCel(layer.id, cel.id, targetFrame);
    this.animService.setCurrentFrame(targetFrame);
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

  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    // Don't capture when typing in inputs
    const tag = (event.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

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
        const layer = this.layers.find(l => l.animated);
        if (layer) {
          const cel = this.getCelAtFrame(layer, this.currentFrame);
          if (cel) {
            this.animService.deleteCel(layer.id, cel.id);
          }
        }
        break;
      }
      case 'F5':
        event.preventDefault();
        this.animService.addCelAtCurrentFrame(this.layers.find(l => l.animated)?.id ?? '');
        break;
      case 'F6':
        event.preventDefault();
        this.goToNextFrame();
        this.animService.addCelAtCurrentFrame(this.layers.find(l => l.animated)?.id ?? '');
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
