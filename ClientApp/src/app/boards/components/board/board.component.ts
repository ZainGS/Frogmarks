import { Component, OnInit, ViewChild, HostListener, ElementRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ResultType } from '../../../shared/models/error-result.model';
import { BoardService } from '../../../shared/services/boards/board.service';
import { Board } from '../../models/board.model';
import ShapeManager from "@zaings/salsa/shape-manager";
import WorldManager from "@zaings/salsa/world-manager";
//import startWebGPURendering from "@zaings/salsa";
import { isRendererLive, reinitializeWebGPURendering, startWebGPURendering } from "@zaings/salsa";
import { ShapeType } from '../../../shared/enums/shape-type';
import { auditTime, distinctUntilChanged, filter, firstValueFrom, map, Subject, Subscription } from 'rxjs';
import { ColorPickerComponent } from 'app/shared/components/color-picker/color-picker.component';
import { LayerTreeNode } from 'app/boards/models/layer-tree-node.model';
import { AuthService } from 'app/shared/services/auth/auth.service';
import { NotifyService } from 'app/shared/services/notify/notify.service';
import { ArrowheadStyle, ARROWHEAD_OPTIONS } from 'app/boards/models/brush-preset.model';

@Component({
  selector: 'app-board',
  standalone: false,
  templateUrl: './board.component.html',
  styleUrl: './board.component.scss'
})

export class BoardComponent implements OnInit {
  
  private routeSub?: Subscription;
  @ViewChild('webgpuCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  @ViewChild('bgColorPicker') bgColorPickerRef: ColorPickerComponent;
  @ViewChild('dotColorPicker') dotColorPickerRef: ColorPickerComponent;
  @ViewChild('shapeColorPicker') shapeColorPickerRef: ColorPickerComponent;
  @ViewChild('boardShell', { static: true }) boardShellRef!: ElementRef<HTMLDivElement>;

  // Close on any document click, scroll, resize, or Escape
  @HostListener('document:click')
  onDocClick() { this.closeContextMenu(); }
  
  @HostListener('window:scroll')
  onWinScroll() { this.closeContextMenu(); }
  
  @HostListener('window:resize')
  onWinResize() { this.closeContextMenu(); }
  
  @HostListener('document:keydown.escape')
  onEsc() { this.closeContextMenu(); }

  // State flags
  uiHidden = false;
  isFullscreen = false;
  layerTreeHidden = false;

  // Hide/show all UI chrome you wrap in a top-level container
  toggleUI(force?: boolean) {
    this.notifyService.success("Press the X button to toggle UI");
    this.uiHidden = typeof force === 'boolean' ? force : !this.uiHidden;
    if (this.uiHidden) this.closeContextMenu(); // keep menus tidy when hiding UI
  }

  toggleLayerTree() {
    this.layerTreeHidden = !this.layerTreeHidden;
    this.closeContextMenu();
  }

  // Fullscreen toggle (container -> fullscreen; falls back to documentElement)
  async toggleFullscreen() {
    const el: any =
      this.boardShellRef?.nativeElement ??
      this.canvasRef?.nativeElement ??
      document.documentElement;

    try {
      const isActive =
        !!document.fullscreenElement ||
        // Safari (older)
        !!(document as any).webkitFullscreenElement;

      if (!isActive) {
        if (el.requestFullscreen) {
          await el.requestFullscreen();
        } else if (el.webkitRequestFullscreen) {
          el.webkitRequestFullscreen(); // Safari
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if ((document as any).webkitExitFullscreen) {
          (document as any).webkitExitFullscreen(); // Safari
        }
      }
    } catch (err) {
      console.error('Fullscreen toggle failed:', err);
    }
  }

  // Keep isFullscreen in sync with browser state
  @HostListener('document:fullscreenchange')
  onFullscreenChange() {
    this.isFullscreen = !!document.fullscreenElement;
  }

  @HostListener('document:webkitfullscreenchange')
  onFullscreenChangeWebkit() {
    this.isFullscreen = !!(document as any).webkitFullscreenElement;
  }

  canvas: HTMLCanvasElement;
  boardUid: string | null = null;
  board: Board | null = null;
  layerTree: LayerTreeNode | null = null;
  selectedLayerIds: Set<string> = new Set();
  hoveredLayerId: string | null = null;

  // Arrowhead defaults for new lines
  arrowheadStart: ArrowheadStyle = 'none';
  arrowheadEnd: ArrowheadStyle = 'triangle';
  arrowheadSize = 6;
  arrowheadOptions = ARROWHEAD_OPTIONS;

  onArrowheadChange(): void {
    this.shapeManager.setDefaultArrowheads?.(this.arrowheadStart, this.arrowheadEnd);
  }

  // Polygon tool
  defaultPolygonSides = 6;
  polygonPresets: string[] = [];

  onPolygonSidesChange(sides: number): void {
    this.defaultPolygonSides = +sides;
    (this.shapeManager as any).defaultPolygonSides = this.defaultPolygonSides;
  }

  placePresetPolygon(preset: string): void {
    this.shapeManager.createPresetPolygon?.(0, 0, 0.5, 0.5, preset as any, { r: 0, g: 0, b: 0, a: 1 }, 1);
  }

  loadPolygonPresets(): void {
    this.polygonPresets = (ShapeManager as any).PolygonPresets || [];
  }

  private selectionChangedSubscription: { unsubscribe: () => void };
  public selectedNode: any | null = null;

  contextMenu = {
    visible: false,
    x: 0,
    y: 0
  };

  closeContextMenu() {
    if (this.contextMenu.visible) {
      this.contextMenu.visible = false;
    }
  }
  
  openBoardMenu(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();

    if(this.contextMenu.visible == true) {
      this.closeContextMenu();
      return;
    }

    const clickX = event.clientX;
    const clickY = event.clientY;

    // Optional: keep menu within viewport
    const menuWidth = 220;  // match CSS
    const menuHeight = 44;  // approx for one item
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const x = Math.min(285, vw - menuWidth - 8);
    const y = Math.min(8, vh - menuHeight - 8);

    this.contextMenu = { visible: true, x, y };
  }

  private autoSaveSubscription!: Subscription;
  private thumbnailSaveSubscription!: Subscription;
  
  private lastSavedJSON: string = '';

  controlPanelActiveTool = '';
  shapeManager: ShapeManager = null;
  worldManager: WorldManager = null;
  isCommentPanelActive: boolean = false;
  selectedPenColor: string = "#9B59B6";
  selectedShapeColor: string = "#FFFFFF";
  selectedTextColor: string = "#FFFFFF";
  selectedHighlightColor: string = "#DAB6FC";
  selectedPattern: string = "assets/patterns/leaves.svg";
  // colorPalette: string[] = ["red", "blue", "green", "orange", "purple"];
  cursorSelected: boolean = true;
  panHandSelected: boolean = false;

  selectedStamp: string = "assets/stamps/star.png"; // Default stamp
  selectedStampColor: string = "#FFFFFF";
  selectedStampSize: number = 0.10;
  stampPalette: string[] = [
    "assets/stamps/star.png",
    "assets/stamps/heart.png", 
    "assets/stamps/check.png",
    "assets/stamps/arrow.png",
    "assets/stamps/circle.png",
    "assets/stamps/x.png",
    "assets/stamps/thumbs_up.png",
    "assets/stamps/icecream/icecream_strawberry.png"
  ];

  iceCreamStamps: string[] = [
    "assets/stamps/icecream/icecream_chocolate.png",
    "assets/stamps/icecream/icecream_chocolate2.png", 
    "assets/stamps/icecream/icecream_matcha.png",
    "assets/stamps/icecream/icecream_matcha2.png",
    "assets/stamps/icecream/icecream_strawberry.png",
    "assets/stamps/icecream/icecream_strawberry2.png",
    "assets/stamps/icecream/icecream_vanilla.png",
    "assets/stamps/icecream/icecream_vanilla2.png"
  ];

getRandomIceCreamStamp(): string {
  const randomIndex = Math.floor(Math.random() * this.iceCreamStamps.length);
  return this.iceCreamStamps[randomIndex];
}

setStamp(stamp: string) {
  // Check if this is the ice cream stamp that should randomize
  if (stamp.startsWith("assets/stamps/icecream")) {
    // Use a random ice cream instead
    const randomIceCream = this.getRandomIceCreamStamp();
    this.selectedStamp = randomIceCream;
    this.shapeManager.setStampTexture(randomIceCream);
    this.stampPalette[7] = this.selectedStamp;
  } else {
    this.selectedStamp = stamp;
    this.shapeManager.setStampTexture(stamp);
  }
}

setStampColor(color: string) {
  this.selectedStampColor = color;
  this.shapeManager.setStampColor(color);
}

setStampSize(size: number) {
  this.selectedStampSize = size;
  this.shapeManager.setStampSize(size);
}

  strokeWidth: number = 2;
  selectedShapeType: ShapeType | null = null;

  // Background color picker
  showBgColorPicker: boolean = false;
  bgColor: string = "#fff";
  bgHexInputDraft: string = this.bgColor.replace('#', '');
  // Dot color picker
  showDotColorPicker: boolean = false;
  dotColor: string = "#fff";
  dotHexInputDraft: string = this.dotColor.replace('#', '');
  // Nodes fill color picker
  showShapeColorPicker: boolean = false;
  shapeColor: string = "#fff";
  shapeHexInputDraft: string = this.bgColor.replace('#', '');


  // SDF Text properties
  selectedSDFTextColor: string = "#FFFFFF";
  selectedSDFTextOutlineColor: string = "#000000";
  selectedSDFTextFontSize: number = 120;
  selectedSDFTextFont: string = "Arial";
  selectedSDFTextThreshold: number = 0.485;
  selectedSDFTextSmoothing: number = 1;
  selectedSDFTextOutlineWidth: number = 0;

  // Add SDF text color picker states
  showSDFTextColorPicker: boolean = false;
  showSDFTextOutlineColorPicker: boolean = false;

  getBackgroundColor() { 
    this.bgColor = this.shapeManager.getBackgroundColor();
    this.bgHexInputDraft = this.bgColor;
  }

  getDotColor() { 
    this.dotColor = this.shapeManager.getDotColor();
    this.dotHexInputDraft = this.dotColor;
  }

  public layerSearchTerm: string = "";
  public get filteredLayers(): LayerTreeNode[] {
    //return this.filterLayers([this.layerTree]);
    return this.filterLayers(this.layerTree?.children ?? []);
  }

  filterLayers(layers: LayerTreeNode[] | undefined): LayerTreeNode[] {
    if (!layers) return [];
    if (!this.layerSearchTerm || this.layerSearchTerm.trim() === '') {
      return layers;
    }

    const term = this.layerSearchTerm.toLowerCase();

    const matches = (layer: LayerTreeNode): boolean =>
      layer.name.toLowerCase().includes(term);

    const filterRecursively = (nodes: LayerTreeNode[]): LayerTreeNode[] => {
      return nodes
        .map(node => {
          const filteredChildren = node.children ? filterRecursively(node.children) : [];
          if (matches(node) || filteredChildren.length) {
            return { ...node, children: filteredChildren };
          }
          return null;
        })
        .filter(Boolean) as LayerTreeNode[];
    };

    return filterRecursively(layers);
  }

  hoverLayer(event: MouseEvent, layer: LayerTreeNode) {
    event.stopPropagation();
    this.hoveredLayerId = layer.id;
    this.shapeManager.addSelectedNode(layer.id);
  }

  selectLayer(layer: LayerTreeNode, event?: MouseEvent) {
    event.stopPropagation();
    this.closeContextMenu();
    const isCtrl = event?.ctrlKey || event?.metaKey;

    if (!isCtrl) {
      // Replace selection
      for (const id of this.selectedLayerIds) {
        this.shapeManager.deselectNode(id);
      }
      this.selectedLayerIds.clear();
    }

    if (this.selectedLayerIds.has(layer.id)) {
      this.selectedLayerIds.delete(layer.id);
      this.shapeManager.deselectNode(layer.id);
    } else {
      this.selectedLayerIds.add(layer.id);
      this.shapeManager.addSelectedNode(layer.id);
    }
  }

  unhoverLayer(event: MouseEvent, layer: LayerTreeNode) {
    event.stopPropagation();
    if (!this.selectedLayerIds.has(layer.id)) {
      if (this.hoveredLayerId === layer.id) {
        this.hoveredLayerId = null;
      }
      this.shapeManager.deselectNode(layer.id);
    }
  }

  toggleVisibility(layer: LayerTreeNode) {
    layer.visible = !layer.visible;
    this.shapeManager?.setNodeVisibility(layer.id, layer.visible);
  }

  toggleLock(layer: LayerTreeNode) {
    layer.locked = !layer.locked;
    this.shapeManager?.setNodeLocked(layer.id, layer.locked);
  }

  openBgColorPicker() {
    if (!this.showBgColorPicker) {
      setTimeout(() => {
        this.showBgColorPicker = true;
        setTimeout(() => {
          if (this.bgColorPickerRef) {
            this.bgColorPickerRef.setColor(this.bgColor.startsWith('#') ? this.bgColor : '#' + this.bgColor);
          }
        });
      }, 0);
    } else {
      this.showBgColorPicker = false;
    }
  }
  
  openDotColorPicker() {
    if (!this.showDotColorPicker) {
      setTimeout(() => {
        this.showDotColorPicker = true;
        setTimeout(() => {
          if (this.dotColorPickerRef) {
            this.dotColorPickerRef.setColor(this.dotColor.startsWith('#') ? this.dotColor : '#' + this.dotColor);
          }
        });
      }, 0);
    } else {
      this.showDotColorPicker = false;
    }
  }

  openShapeColorPicker() {
    if (!this.showShapeColorPicker) {
      setTimeout(() => {
        this.showShapeColorPicker = true;
        setTimeout(() => {
          if (this.shapeColorPickerRef) {
            this.shapeColorPickerRef.setColor(this.shapeColor.startsWith('#') ? this.shapeColor : '#' + this.shapeColor);
          }
        });
      }, 0);
    } else {
      this.showShapeColorPicker = false;
    }
  }

  onShapeHexInputChange(value: string) {
    this.shapeHexInputDraft = value;
  }
  onBgHexInputChange(value: string) {
    this.bgHexInputDraft = value;
  }
  onDotHexInputChange(value: string) {
    this.dotHexInputDraft = value;
  }

  onHexInputEnter(event: Event) {
    (event.target as HTMLInputElement).blur();
  }

  onBgHexInputBlur() {
    const raw = this.bgHexInputDraft.trim();
    const hex = '#' + raw;

    const isValidHex = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(hex);

    if (isValidHex) {
      this.bgColor = hex;
      this.bgHexInputDraft = raw;
      this.onBgColorSelected(hex);
    } else {
      // Revert input field to last valid color
      this.bgHexInputDraft = this.bgColor.replace('#', '');
    }
  }
  onDotHexInputBlur() {
    const raw = this.dotHexInputDraft.trim();
    const hex = '#' + raw;

    const isValidHex = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(hex);

    if (isValidHex) {
      this.dotColor = hex;
      this.dotHexInputDraft = raw;
      this.onDotColorSelected(hex);
    } else {
      // Revert input field to last valid color
      this.dotHexInputDraft = this.dotColor.replace('#', '');
    }
  }
  onShapeHexInputBlur(layerId: string) {
    const raw = this.shapeHexInputDraft.trim();
    const hex = '#' + raw;

    const isValidHex = /^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/.test(hex);

    if (isValidHex) {
      this.shapeHexInputDraft = raw;
      this.onNodeFillColorSelected(layerId, hex);
    } else {
      // Revert input field to last valid color - convert RGBA to hex
      const rgba = this.shapeManager.getNodeFillColor(layerId);
      this.shapeHexInputDraft = this.rgbaToHex(rgba);
    }
  }

  // Add this helper method to your component
  private rgbaToHex(rgba: {r: number, g: number, b: number, a: number}): string {
    const toHex = (value: number) => {
      // Convert from 0-1 range to 0-255 range
      const scaled = Math.round(value * 255);
      const hex = scaled.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    
    return `${toHex(rgba.r)}${toHex(rgba.g)}${toHex(rgba.b)}`;
  }


onBgColorSelected(color: string) {
  this.bgColor = color;
  this.bgHexInputDraft = color.replace('#', ''); // keep in sync
  let r = 255, g = 255, b = 255, a = 1.0;

  if (typeof color === "string") {
    if (color.startsWith('#')) {
      const hex = color.replace('#', '');
      if (hex.length === 3) {
        // Handle short hex (#RGB)
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
      } else if (hex.length === 6) {
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
      } else if (hex.length === 8) {
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
        a = parseInt(hex.substring(6, 8), 16) / 255;
      }
    } else if (color.startsWith('rgb')) {
      // Handles rgb(...) or rgba(...)
      const values = color.match(/\d+(\.\d+)?/g);
      if (values && (values.length === 3 || values.length === 4)) {
        r = parseInt(values[0]);
        g = parseInt(values[1]);
        b = parseInt(values[2]);
        if (values.length === 4) {
          a = parseFloat(values[3]);
        }
      }
    } else {
      // Try to convert named colors or hsl to rgb
      const ctx = document.createElement("canvas").getContext("2d");
      ctx.fillStyle = color;
      const computed = ctx.fillStyle;
      if (computed.startsWith('rgb')) {
        const values = computed.match(/\d+(\.\d+)?/g);
        if (values && (values.length === 3 || values.length === 4)) {
          r = parseInt(values[0]);
          g = parseInt(values[1]);
          b = parseInt(values[2]);
          if (values.length === 4) {
            a = parseFloat(values[3]);
          }
        }
      }
    }
  }

  if (this.shapeManager) {
    // console.log(`Background color set to: rgba(${r}, ${g}, ${b}, ${a})`);
    this.shapeManager.setBackgroundColor(r/255, g/255, b/255, a);
  }
}

onDotColorSelected(color: string) {
  this.dotColor = color;
  this.dotHexInputDraft = color.replace('#', ''); // keep in sync
  let r = 255, g = 255, b = 255, a = 1.0;

  if (typeof color === "string") {
    if (color.startsWith('#')) {
      const hex = color.replace('#', '');
      if (hex.length === 3) {
        // Handle short hex (#RGB)
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
      } else if (hex.length === 6) {
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
      } else if (hex.length === 8) {
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
        a = parseInt(hex.substring(6, 8), 16) / 255;
      }
    } else if (color.startsWith('rgb')) {
      // Handles rgb(...) or rgba(...)
      const values = color.match(/\d+(\.\d+)?/g);
      if (values && (values.length === 3 || values.length === 4)) {
        r = parseInt(values[0]);
        g = parseInt(values[1]);
        b = parseInt(values[2]);
        if (values.length === 4) {
          a = parseFloat(values[3]);
        }
      }
    } else {
      // Try to convert named colors or hsl to rgb
      const ctx = document.createElement("canvas").getContext("2d");
      ctx.fillStyle = color;
      const computed = ctx.fillStyle;
      if (computed.startsWith('rgb')) {
        const values = computed.match(/\d+(\.\d+)?/g);
        if (values && (values.length === 3 || values.length === 4)) {
          r = parseInt(values[0]);
          g = parseInt(values[1]);
          b = parseInt(values[2]);
          if (values.length === 4) {
            a = parseFloat(values[3]);
          }
        }
      }
    }
  }

  if (this.shapeManager) {
    this.shapeManager.setDotColor(r/255, g/255, b/255, a);
  }
}

onNodeFillColorSelected(layerId: string, color: string) {
  this.shapeColor = color;
  this.shapeHexInputDraft = color.replace('#', ''); // keep in sync
  let r = 255, g = 255, b = 255, a = 1.0;

  if (typeof color === "string") {
    if (color.startsWith('#')) {
      const hex = color.replace('#', '');
      if (hex.length === 3) {
        // Handle short hex (#RGB)
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
      } else if (hex.length === 6) {
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
      } else if (hex.length === 8) {
        r = parseInt(hex.substring(0, 2), 16);
        g = parseInt(hex.substring(2, 4), 16);
        b = parseInt(hex.substring(4, 6), 16);
        a = parseInt(hex.substring(6, 8), 16) / 255;
      }
    } else if (color.startsWith('rgb')) {
      // Handles rgb(...) or rgba(...)
      const values = color.match(/\d+(\.\d+)?/g);
      if (values && (values.length === 3 || values.length === 4)) {
        r = parseInt(values[0]);
        g = parseInt(values[1]);
        b = parseInt(values[2]);
        if (values.length === 4) {
          a = parseFloat(values[3]);
        }
      }
    } else {
      // Try to convert named colors or hsl to rgb
      const ctx = document.createElement("canvas").getContext("2d");
      ctx.fillStyle = color;
      const computed = ctx.fillStyle;
      if (computed.startsWith('rgb')) {
        const values = computed.match(/\d+(\.\d+)?/g);
        if (values && (values.length === 3 || values.length === 4)) {
          r = parseInt(values[0]);
          g = parseInt(values[1]);
          b = parseInt(values[2]);
          if (values.length === 4) {
            a = parseFloat(values[3]);
          }
        }
      }
    }
  }

  if (this.shapeManager) {
    this.shapeManager.setNodeFillColor(layerId, {r: r/255, g: g/255, b: b/255, a: a});
  }
}

  showPenColorPicker: boolean = false;
  customPenColor: string = "#fff";
  penColorPalette: string[] = [
    "#000000", // Black
    "#E74C3C", // Red
    "#F39C12", // Orange
    "#ffff00", // Yellow
    "#2ECC71", // Green
    "#3498DB", // Blue
    "#9B59B6", // Purple
    "#FFFFFF",  // White
  ];

  highlightColorPalette: string[] = [
    "#A8A8A8", // Pastel Gray (soft black)
    "#FFADAD", // Pastel Red
    "#FFD6A5", // Pastel Orange
    "#FDFFB6", // Pastel Yellow
    "#CAFFBF", // Pastel Green
    "#a0fdff", // Pastel Blue
    "#DAB6FC", // Pastel Purple
    "#FFFFFF"  // White
  ];

  highlightColorMapping: Map<string, string> = new Map([
    ["#A8A8A8", "#828282"], // Pastel Gray → Stronger Gray
    ["#FFADAD", "#ff80dd"], // Pastel Red → Bolder Soft Red
    ["#FFD6A5", "#FFB766"], // Pastel Orange → Vibrant Orange
    ["#FDFFB6", "#03ff9e"], // Pastel Yellow → Rich Yellow // Why does GREEN appear as YELLOW :(
    ["#CAFFBF", "#8EEA87"], // Pastel Green → Lush Green
    ["#a0fdff", "#59faff"], // Pastel Blue → Vivid Sky Blue
    ["#DAB6FC", "#B48CF9"], // Pastel Purple → Vibrant Lavender
    ["#FFFFFF", "#FFFFFF"]  // White → White
  ]);

  patternPalette: string[] = [
    "assets/patterns/webp/checker.webp",
    "assets/patterns/webp/flowers.webp",
    //"assets/patterns/webp/hearts.webp",
    "assets/patterns/webp/leaves.webp",
    "assets/patterns/webp/plaid.webp",
    //"assets/patterns/webp/skulls.webp",
    "assets/patterns/webp/plaid-2.webp",
    "assets/patterns/webp/polka.webp",
    //"assets/patterns/webp/memphis.webp",
    "assets/patterns/webp/caution-tape.webp",
    "assets/patterns/webp/plants.webp"
];

//   colorPalette: string[] = [
//     "#FFB6C1", // Light Pink
//     "#FFDAB9", // Peach Puff
//     "#FAE3D9", // Soft Coral
//     "#FFDAC1", // Light Apricot
//     "#E2F0CB", // Light Sage Green
//     "#B5EAD7", // Soft Mint
//     "#C7CEEA", // Lavender Mist
//     "#D4A5A5", // Dusty Rose
//     "#A2D2FF", // Baby Blue
//     "#E6E6FA"  // Lavender
// ];


  private onMouseMove!: (e: MouseEvent) => void;
  private onClick!: (e: MouseEvent) => void;
  private onKeyDown!: (e: KeyboardEvent) => void;
  private onDocMousedown!: (e: MouseEvent) => void;

  private sceneChanged$ = new Subject<string>();

  constructor(private route: ActivatedRoute,
              private boardService: BoardService,
              private router: Router,
              private authService: AuthService,
              private notifyService: NotifyService) { }

  ngOnInit() {
    // React whenever /board/:id changes (same component instance)
    this.routeSub = this.route.paramMap.pipe(
      map(p => p.get('id')),
      filter((id): id is string => !!id),
      distinctUntilChanged()
    ).subscribe((boardUid) => {
      this.initForBoard(boardUid);
    });
  }

  private async initForBoard(boardUid: string) {
    this.isLoading = true;
    this.boardUid = boardUid;

    // IMPORTANT: clean up prior board state when switching ids in-place
    this.autoSaveSubscription?.unsubscribe();
    this.thumbnailSaveSubscription?.unsubscribe();
    this.selectionChangedSubscription?.unsubscribe();
    this.resetSceneState();
    this.lastSavedThumbnailJSON = '';
    this.lastThumbnailTime = 0;

    // Ensure WebGPU only initializes if not already running
    if (!isRendererLive) {
      await startWebGPURendering("webgpuCanvas").then(() => {
        // Get the singleton ShapeManager & WorldManager instances after Salsa has initialized
        this.shapeManager = ShapeManager.getInstance();
        this.worldManager = WorldManager.getInstance();
        this.loadPolygonPresets();

        // Loading screen state:
        this.markLoaded('renderer');
        // One-time scene-applied signal (fires after setSceneGraphJSON or any scene change)
        const sceneAppliedOnce = this.shapeManager.interactionService.onSceneGraphChanged
          .subscribe(() => {
            this.markLoaded('sceneApplied');
            sceneAppliedOnce.unsubscribe();
            if(!this.board.isCustomThumbnail) {
              this.saveThumbnail();
            }
          });

        this.selectionChangedSubscription = this.shapeManager.interactionService.onSelectionChanged.subscribe((selectedIds: string[]) => {
          if(this.selectedLayerIds.has(this.hoveredLayerId)) {
            this.selectedLayerIds = new Set(selectedIds);
            const selectedId = this.selectedLayerIds.values().next().value;
            this.selectedNode = this.getNodeById(selectedId);
          } else {
            selectedIds = selectedIds.filter(id => id !== this.hoveredLayerId);
            this.selectedLayerIds = new Set(selectedIds);
            const selectedId = this.selectedLayerIds.values().next().value;
            this.selectedNode = this.getNodeById(selectedId);
          }

          if(selectedIds.length == 1) {
            var nodeColor = this.rgbaToHex(this.shapeManager.getNodeFillColor(selectedIds[0]));
            this.shapeColor = '#'+nodeColor;
            this.shapeHexInputDraft = nodeColor; // keep in sync
          }
        });

        this.shapeManager.interactionService.onSceneGraphChanged.subscribe(() => {
          const currentSceneJSON = this.shapeManager.getSceneGraphJSON();
          const parsed = JSON.parse(currentSceneJSON);
          this.layerTree = this.buildLayerTree(parsed.root);
          this.sceneChanged$.next(currentSceneJSON);
        });

      });
    } else {
      await reinitializeWebGPURendering("webgpuCanvas").then(() => {
        // Get the singleton ShapeManager & WorldManager instances after Salsa has initialized
        this.shapeManager = ShapeManager.getInstance();
        this.worldManager = WorldManager.getInstance();
        this.loadPolygonPresets();

        // Loading screen state:
        this.markLoaded('renderer');
        // One-time scene-applied signal (fires after setSceneGraphJSON or any scene change)
        const sceneAppliedOnce = this.shapeManager.interactionService.onSceneGraphChanged
          .subscribe(() => {
            this.markLoaded('sceneApplied');
            sceneAppliedOnce.unsubscribe();
            if(!this.board.isCustomThumbnail) {
              this.saveThumbnail();
            }
          });

        this.selectionChangedSubscription = this.shapeManager.interactionService.onSelectionChanged.subscribe((selectedIds: string[]) => {
          if(this.selectedLayerIds.has(this.hoveredLayerId)) {
            this.selectedLayerIds = new Set(selectedIds);
          } else {
            selectedIds = selectedIds.filter(id => id !== this.hoveredLayerId);
            this.selectedLayerIds = new Set(selectedIds);
          }
        });

        this.shapeManager.interactionService.onSceneGraphChanged.subscribe(() => {
          const currentSceneJSON = this.shapeManager.getSceneGraphJSON();
          const parsed = JSON.parse(currentSceneJSON);
          this.layerTree = this.buildLayerTree(parsed.root);
          this.sceneChanged$.next(currentSceneJSON);
        });
      });
    }

    this.canvas = this.canvasRef.nativeElement;
    this.shapeManager.setStrokeWidth(this.strokeWidth);

    this.boardUid = this.route.snapshot.paramMap.get('id');
    if (this.boardUid) {
      this.boardService.getBoardByUid(this.boardUid).subscribe(async res => {
        if (res.resultType === ResultType.Success) {
          this.board = res.resultObject;
          this.boardTitle = res.resultObject.name;
          // Ensure previous data is cleared
          this.resetSceneState();

          if(this.board.sceneGraphData && this.board.sceneGraphData.length > 0) {
            // Await the scene loading so textures are loaded before proceeding
            await this.setBoardSceneGraph(this.board.sceneGraphData);
            
            const rawSceneGraph = JSON.parse(this.board.sceneGraphData);
            console.log(rawSceneGraph);
            this.layerTree = this.buildLayerTree(rawSceneGraph.root); // Top-level

            // Fallback: if no event within a frame, consider applied
            requestAnimationFrame(() => this.markLoaded('sceneApplied'));
          } else {
            // No scene → still mark as applied
            requestAnimationFrame(() => this.markLoaded('sceneApplied'));
          }
          

          // Initialize autosave:
          this.autoSaveSubscription = this.sceneChanged$
            .pipe(
              auditTime(1000),
              distinctUntilChanged()
            )
            .subscribe(json => { 
              if (!this.board) return;
              if (json !== this.lastSavedJSON) {
                this.lastSavedJSON = json;
                this.boardService.saveBoard(this.board!.id, json).subscribe();
              }
            });

          // thumbnail: at most once per 60s if changed
          this.thumbnailSaveSubscription = this.sceneChanged$
            .pipe(auditTime(5000))
            .subscribe(() => {
              if(!this.board.isCustomThumbnail) {
                this.saveThumbnailIfChanged();
              }
            });

          this.markLoaded('board');
        }
      });

      // Set initial SDF text properties after shapeManager is initialized
      if (this.shapeManager) {
        this.setSDFTextColor(this.selectedSDFTextColor);
        this.setSDFTextOutlineColor(this.selectedSDFTextOutlineColor);
        this.setSDFTextFontSize(this.selectedSDFTextFontSize);
        this.setSDFTextFont(this.selectedSDFTextFont);
        this.setSDFTextThreshold(this.selectedSDFTextThreshold);
        this.setSDFTextSmoothing(this.selectedSDFTextSmoothing);
        this.setSDFTextOutlineWidth(this.selectedSDFTextOutlineWidth);

        // Initialize stamp settings
        this.setStamp(this.selectedStamp);
        this.setStampColor(this.selectedStampColor);
        this.setStampSize(this.selectedStampSize);
      }
    } else {
      // No board id; fail-safe so you don’t get stuck
      this.markLoaded('board');
      requestAnimationFrame(() => this.markLoaded('sceneApplied'));
    }

    // Track mouse movement for preview
    this.onMouseMove = (event: MouseEvent) => {
      if (event.target !== this.canvas) return;
      if (this.selectedShapeType) this.shapeManager.updatePreviewShapePosition(event);
    };
    document.addEventListener("mousemove", this.onMouseMove);

    // On click, confirm the preview shape as a real shape
    this.onClick = (event: MouseEvent) => {
      if (event.target !== this.canvas) return;
      if (this.selectedShapeType) {
        this.shapeManager.confirmPreviewShape();
        this.shapeManager.setPreviewShape(this.selectedShapeType, event);
      }
    };
    document.addEventListener("click", this.onClick);

    // Listen for hotkeys
    this.onKeyDown = this.handleHotkeys.bind(this);
    window.addEventListener("keydown", this.onKeyDown);

    this.onDocMousedown = this.handleBgColorPickerClick.bind(this);
    document.addEventListener('mousedown', this.onDocMousedown);
    
    this.getBackgroundColor();
    this.getDotColor();

    this.setShapeColor("#9B59B6");
    this.setHighlightColor("#DAB6FC");
    this.setPenColor("#9B59B6");
  }

  handleBgColorPickerClick(event: MouseEvent) {
  const picker = document.querySelector('app-color-picker');
  const square = document.querySelector('.left-panel-bg-square');
  if (
    this.showBgColorPicker &&
    picker &&
    !picker.contains(event.target as Node) &&
    square &&
    !square.contains(event.target as Node)
  ) {
    this.showBgColorPicker = false;
  }
}


  handleHotkeys(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    const isEditable = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    if (isEditable || this.shapeManager.isTextDrawingInProgress() || this.shapeManager.isSDFTextDrawingInProgress()) return;
    switch (event.key) {
        case "Escape": // Esc → Cursor (Selection Tool)
            this.selectCursor("cursor");
            break;
        case "v": // V → Cursor (Selection Tool)
            this.selectCursor("cursor");
            break;
        case "h": // H → Hand (Panning)
            this.selectCursor("panhand");
            break;
        case "l": // L → Connector (Line Tool)
            this.setActiveTool("connector");
            break;
        case "t": // T → Text Tool
            this.setActiveTool("text");
            break;
        case "T": // Capital T → SDF Text Tool (Shift + T)
            if (event.shiftKey) {
                this.setActiveTool("sdftext");
            } else {
                this.setActiveTool("text");
            }
            break;
        case "p": // P → Pen (Scribble)
            this.setActiveTool("drawing:pen");
            break;
        case "e": // E → Eraser
            this.setActiveTool("drawing:eraser");
            break;
        case "i": // I → Highlighter
            this.setActiveTool("drawing:highlighter");
            break;
        case "s":
            this.setActiveTool("section");
            break;
        case "+" : // + → Zoom In
        case "=" :
            this.zoomIn();
            break;
        case "-": // - → Zoom Out
        case "_":
            this.zoomOut();
            break;
        case "Delete":
            this.layerTree.children = this.pruneDeletedLayers(this.layerTree.children, this.selectedLayerIds);
            this.shapeManager.deleteSelectedShapes();
            break;
        case "f": // F -> toggle fullscreen
          this.toggleFullscreen();
          break;
        case "x": // x -> toggle UI chrome
          this.toggleUI();
          break;
        case "m": // M → Stamp Tool
          this.setActiveTool("stamp");
          break;
        default:
            return; // Ignore keys that are not mapped
    }

    event.preventDefault(); // Prevent default browser behavior (like spacebar scrolling)
  }

  private pruneDeletedLayers(
    nodes: LayerTreeNode[],
    selectedIds: Set<string>
  ): LayerTreeNode[] {
    return nodes
      .map(node => ({
        ...node,
        children: this.pruneDeletedLayers(node.children, selectedIds)
      }))
      .filter(node => !selectedIds.has(node.id));
  }

  // SDF Text color and styling methods
  setSDFTextColor(color: string) {
    this.selectedSDFTextColor = color;
    this.shapeManager.setSDFTextColor(color);
  }

  setSDFTextOutlineColor(color: string) {
    this.selectedSDFTextOutlineColor = color;
    this.shapeManager.setSDFTextOutlineColor(color);
  }

  setSDFTextFontSize(size: number) {
    this.selectedSDFTextFontSize = size;
    this.shapeManager.setSDFTextFontSize(size);
  }

  setSDFTextFont(font: string) {
    this.selectedSDFTextFont = font;
    this.shapeManager.setSDFTextFont(font);
  }

  setSDFTextThreshold(threshold: number) {
    this.selectedSDFTextThreshold = threshold;
    this.shapeManager.setSDFTextThreshold(threshold);
  }

  setSDFTextSmoothing(smoothing: number) {
    this.selectedSDFTextSmoothing = smoothing;
    this.shapeManager.setSDFTextSmoothing(smoothing);
  }

  setSDFTextOutlineWidth(width: number) {
    this.selectedSDFTextOutlineWidth = width;
    this.shapeManager.setSDFTextOutlineWidth(width);
  }

  // Color picker methods for SDF text
  openSDFTextColorPicker() {
    this.showSDFTextColorPicker = !this.showSDFTextColorPicker;
    if (this.showSDFTextColorPicker) {
      this.showSDFTextOutlineColorPicker = false;
    }
  }

  openSDFTextOutlineColorPicker() {
    this.showSDFTextOutlineColorPicker = !this.showSDFTextOutlineColorPicker;
    if (this.showSDFTextOutlineColorPicker) {
      this.showSDFTextColorPicker = false;
    }
  }

  onSDFTextColorSelected(color: string) {
    this.setSDFTextColor(color);
    this.showSDFTextColorPicker = false;
  }

  onSDFTextOutlineColorSelected(color: string) {
    this.setSDFTextOutlineColor(color);
    this.showSDFTextOutlineColorPicker = false;
  }

  // Font options for SDF text
  sdfTextFonts: string[] = [
    "Arial",
    "Helvetica",
    "Times New Roman",
    "Courier New",
    "Verdana",
    "Georgia",
    "Palatino",
    "Garamond",
    "Bookman",
    "Comic Sans MS",
    "Trebuchet MS",
    "Arial Black",
    "Impact"
  ];

  // Font size options
  sdfTextFontSizes: number[] = [8, 10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72];

  //

  selectCursor(cursor: string) {
    switch(cursor) {
      case('cursor'):
          this.cursorSelected = true;
          this.panHandSelected = false;
          this.shapeManager.disablePanningTool();
          this.setActiveTool('');
        return;
      case('panhand'):
        this.cursorSelected = false;
        this.panHandSelected = true;
        this.setActiveTool('');

        this.shapeManager.enablePanningTool();
        return;
      default:
        return;

    }
  }

  setStrokeWidth(width: number) {
    this.strokeWidth = width;
    this.shapeManager.setStrokeWidth(width);
  }

  setPenColor(color: string) {
    this.showPenColorPicker = false;
    this.selectedPenColor = color;
    this.shapeManager.setStrokeColor(color);
  }

  onColorPickerSelection(color: string) {
    this.selectedPenColor = color;
    this.shapeManager.setStrokeColor(color);
  }

  setShapeColor(color: string) {
    this.selectedShapeColor = color;
    this.shapeManager.setShapeColor(color);
  }

  setTextColor(color: string) {
    this.selectedTextColor = color;
    this.shapeManager.setTextColor(color);
  }

  setHighlightColor(color: string) {
    this.selectedHighlightColor = color;
    const mapped = this.highlightColorMapping.get(color) ?? color;
    this.shapeManager.setHighlightColor(mapped);
  }

  setPattern(pattern: string) {
    this.selectedPattern = pattern;
    this.shapeManager.setPattern(this.selectedPattern);
  }

  setActiveTool(activeTool: string, event?: MouseEvent) {
    if(activeTool != this.controlPanelActiveTool)
    {
      this.controlPanelActiveTool = activeTool;
      if(this.controlPanelActiveTool != "") {
        this.cursorSelected = false;
        this.panHandSelected = false;
        this.shapeManager.disablePanningTool();
      }
    }
    else {
      // this.controlPanelActiveTool = '';
      //this.shapeManager.disableLineDrawing();
      //this.shapeManager.disableTextDrawing();
      //this.shapeManager.disableScribbleDrawing();
    }

    if(this.controlPanelActiveTool == 'connector')
    {
      this.shapeManager.setDefaultArrowheads?.(this.arrowheadStart, this.arrowheadEnd);
      this.shapeManager.enableLineDrawing();
    }
    else {
      this.shapeManager.disableLineDrawing();
    }

    if(this.controlPanelActiveTool == 'text')
    {
      this.shapeManager.enableTextDrawing();
    }
    else {
      this.shapeManager.disableTextDrawing();
    }

    if(this.controlPanelActiveTool == 'drawing:pen')
    {
      this.shapeManager.enableScribbleDrawing();
    }
    else {
      this.shapeManager.disableScribbleDrawing();
    }

    if(this.controlPanelActiveTool == 'drawing:highlighter')
    {
      this.shapeManager.enableHighlightDrawing();
    }
    else {
      this.shapeManager.disableHighlightDrawing();
    }

    if(this.controlPanelActiveTool == 'drawing:eraser')
    {
      this.shapeManager.enableEraserTool();
    }
    else {
      this.shapeManager.disableEraserTool();
    }

    if(this.controlPanelActiveTool == 'drawing:pattern')
    {
      this.shapeManager.enablePatternDrawing();
    }
    else {
      this.shapeManager.disablePatternDrawing();
    }
    
    if (this.controlPanelActiveTool === 'section') {
      this.shapeManager.enableSectionDrawing();
    } else {
      this.shapeManager.disableSectionDrawing();
    }
    
    // Shapes
    if(this.controlPanelActiveTool == 'shape:square') {
      this.setPreviewShapeSelected(ShapeType.Rectangle, event);
    } else if(this.controlPanelActiveTool == 'shape:circle') {
      this.setPreviewShapeSelected(ShapeType.Circle, event);
    } else if(this.controlPanelActiveTool == 'shape:triangle') {
      this.setPreviewShapeSelected(ShapeType.Triangle, event);
    } else if(this.controlPanelActiveTool == 'shape:polygon') {
      (this.shapeManager as any).defaultPolygonSides = this.defaultPolygonSides;
      this.setPreviewShapeSelected(ShapeType.Polygon, event);
    } else {
      this.setPreviewShapeSelected(null, event);
    }

    // Freeform polygon drawing
    this.controlPanelActiveTool === 'polygon:freeform'
      ? this.shapeManager.enablePolygonDrawing?.()
      : this.shapeManager.disablePolygonDrawing?.();

    if(this.controlPanelActiveTool == 'sdftext') {
      this.shapeManager.enableSDFTextDrawing();
    } else {
      this.shapeManager.disableSDFTextDrawing();
    }

    if(this.controlPanelActiveTool == 'stamp')
    {
      this.shapeManager.enableStampDrawing();
    }
    else {
      this.shapeManager.disableStampDrawing();
    }

  }

  zoomIn() {
    this.worldManager.zoomIn();
  }

  zoomOut() {
    this.worldManager.zoomOut();
  }

  spawnShape(shape: string) {
    switch(shape) {
      case 'circle':
        this.shapeManager.createCircle(0, 0, .5, { r: 0, g: 0, b: 0, a: 1 }, 1);
        break;
      case 'rectangle':
        this.shapeManager.createRectangle(0, 0, .5, .5, { r: 0, g: 0, b: 0, a: 1 }, 1);
        break;
      case 'triangle':
        this.shapeManager.createTriangle(0, 0, .5, .5, { r: 0, g: 0, b: 0, a: 1 }, 1);
        break;
      case 'stickynote':
        this.shapeManager.createStickyNote(0, 0, "Type anything!", { r: 1, g: 1, b: 0.56, a: 1 }, "Zain S.");
        break;
      case 'polygon':
        this.shapeManager.createRegularPolygon?.(0, 0, 0.3, this.defaultPolygonSides, { r: 0, g: 0, b: 0, a: 1 }, 1);
        break;
      default:
        break;
    }
  }

  downloadCanvasViewAsPng() {
    const canvas = this.canvas;
    if (!canvas) {
        console.error("Canvas element not found!");
        return;
    }

    const image = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.href = image;
    link.download = "frogmarks_snapshot.png";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Shape Preview
  // Called when a shape is selected in Frogmarks
  setPreviewShapeSelected(shapeType: ShapeType, event: MouseEvent) {
    this.selectedShapeType = shapeType;
    this.shapeManager.setPreviewShape(shapeType, event);
  }

  openColorPicker() {
    this.showPenColorPicker == false ? this.showPenColorPicker = true : this.showPenColorPicker = false;
  } 

  // In the future, you can setup your WebSocket comms here.
  private saveBoardIfChanged() {
    const currentJSON = this.shapeManager.getSceneGraphJSON();
    if (!this.board) return;
    if (currentJSON !== this.lastSavedJSON) {
      this.lastSavedJSON = currentJSON; // Update last saved JSON
      this.boardService.saveBoard(this.board.id, currentJSON).subscribe(() => {
        console.log('Board auto-saved.');
      });
    }
  }

  loadBoardSceneGraph() {
    this.boardService.loadBoardSceneGraph(this.board.id).subscribe(res => {
      this.shapeManager.setSceneGraphJSON(res);
    });
  }

  async setBoardSceneGraph(sceneGraphJSON: string) {
    await this.shapeManager.setSceneGraphJSON(sceneGraphJSON);
  }

  lastThumbnailTime = 0;
  THUMBNAIL_UPDATE_INTERVAL = 60000; // 60 seconds
  lastSavedThumbnailJSON = '';
  private saveThumbnailIfChanged() {
    const currentSceneGraphJSON = this.shapeManager.getSceneGraphJSON();
    const now = Date.now();

    if (currentSceneGraphJSON !== this.lastSavedThumbnailJSON) {
        console.log("SceneGraph changed, updating thumbnail...");
        this.saveThumbnail();
        this.lastSavedThumbnailJSON = currentSceneGraphJSON; // Update snapshot
        this.lastThumbnailTime = now;
    } else {
        console.log("No changes detected, skipping thumbnail update.");
    }
  }

  // async saveThumbnail() {
  //   const canvas = this.canvas;
  //   if (!canvas) return;

  //   // Wait until a fully rendered frame is on-screen
  //   await (this.shapeManager as any)['webgpuRenderer'].waitForFrameSettled();
  //   // or expose a wrapper on ShapeManager if you prefer

  //   const thumbnailBlob = await this.getThumbnailBlob(canvas);
  //   this.boardService.uploadThumbnail(this.boardUid, thumbnailBlob).subscribe();
  //   // const url = URL.createObjectURL(thumbnailBlob);
  //   // window.open(url); // Check if it displays correctly before upload
  // }

    async saveThumbnail() {
      if (!this.boardUid) return;
      const blob = await this.shapeManager.captureThumbnailBlob(300);
      this.boardService.uploadThumbnail(this.boardUid, blob).subscribe();
    }

  private async getThumbnailBlob(canvas: HTMLCanvasElement): Promise<Blob> {
    if (!canvas) {
        console.error("Canvas element not found!");
        return null;
    }

    return new Promise<Blob>((resolve, reject) => {
        // Scale down the canvas to a smaller thumbnail size
        const thumbnailCanvas = document.createElement("canvas");
        const ctx = thumbnailCanvas.getContext("2d");

        if (!ctx) {
            console.error("Failed to get canvas 2D context!");
            reject(null);
            return;
        }

        const thumbnailWidth = 300;  // Adjust size as needed
        const aspectRatio = canvas.width > 0 ? canvas.height / canvas.width : 1;
        const thumbnailHeight = Math.round(thumbnailWidth * aspectRatio);

        thumbnailCanvas.width = thumbnailWidth;
        thumbnailCanvas.height = thumbnailHeight;

        // Draw the original canvas onto the smaller thumbnail canvas
        ctx.drawImage(canvas, 0, 0, thumbnailWidth, thumbnailHeight);

        // Convert to PNG blob
        thumbnailCanvas.toBlob(blob => {
            if (!blob) {
                console.error("Failed to generate thumbnail blob!");
                reject(null);
            } else {
                resolve(blob);
            }
        }, "image/png", 0.8); // Adjust compression quality if needed
    });
  }

  returnToDashboard() {
    this.router.navigate(['/dashboard']);
  }

  resetSceneState() {
    if(this.shapeManager) {
      this.shapeManager.clear();
    }
    if(this.worldManager) {
      this.worldManager.resetWorldState();
    }
  }

  buildLayerTree(data: any): LayerTreeNode {
    const isSticky = data.type === 'Sticky Note';

    return {
      id: data.id,
      type: data.type || 'Unknown',
      name: data.name || data.type || 'Untitled',
      visible: data.visible !== false,
      locked: data.locked,
      // Hide children for StickyNote in the layer panel
      children: isSticky
        ? []
        : Array.isArray(data.children) ? data.children.map(c => this.buildLayerTree(c)) : []
    };
  }

  boardTitle: string = '';
  updateBoardTitle() {
    this.boardService.renameBoard(this.board.id, this.boardTitle).subscribe(() => {});
  }

  trackById(index: number, item: LayerTreeNode): string {
    return item.id;
  }

  ngOnDestroy(): void {
    this.routeSub?.unsubscribe();

    if (this.autoSaveSubscription) {
      this.autoSaveSubscription.unsubscribe();
    }
    if(this.thumbnailSaveSubscription) {
      this.thumbnailSaveSubscription.unsubscribe();
    }
    if (this.selectionChangedSubscription) {
      this.selectionChangedSubscription.unsubscribe();
    }

    if (this.onMouseMove) document.removeEventListener("mousemove", this.onMouseMove);
    if (this.onClick) document.removeEventListener("click", this.onClick);
    if (this.onKeyDown) window.removeEventListener("keydown", this.onKeyDown);
    if (this.onDocMousedown) document.removeEventListener("mousedown", this.onDocMousedown);

    // Ensure WebGPU is reset before switching boards
    this.resetSceneState();
  }

  getNodePosition(nodeId: string) {
    return this.shapeManager.getNodePosition(nodeId);
  }

  setNodePosition(nodeId: string, x?: number, y?: number) {
    this.shapeManager.setNodePosition(nodeId, x, y);
  }

  getNodeById(nodeId: string): any {
    return this.shapeManager.getNodeById(nodeId);
  }

  onNameBlur(layer: LayerTreeNode) {
    layer.name = layer.name.trim();
    this.shapeManager.setNodeName(layer.id, layer.name);
  }

  onEnter(input: HTMLInputElement, layer: LayerTreeNode) {
    this.onNameBlur(layer); // or pass in layer if available
    input.blur();
  }

  updateSDFText(change: Partial<{
    text: string;
    font: string;
    fontSize: number;
    lineHeight: number;
    fill: string;
    outline: string;
    outlineWidth: number;
    threshold: number;
    smoothing: number;
  }>) {
    
    if (!this.selectedNode) return;
    // push the change to the engine first
    this.shapeManager.updateSDFText(this.selectedNode.id, change);
    // now reflect it locally in the side-panel model
    const type = this.selectedNode.getType?.();
    if (type === 'Sticky Note') {
      if (change.text !== undefined) this.selectedNode.text.text = change.text;
      // update other props carefully if you expose them
    } else {
      Object.assign(this.selectedNode, change);
    }
  }

  openColorPickerFor(kind: 'fill' | 'outline'): void {
    if (kind === 'fill') {
      this.openSDFTextColorPicker();
    } else {
      this.openSDFTextOutlineColorPicker();
    }
  }

  isLoading = true;
  private loadingState = {
    renderer: false,
    board: false,
    sceneApplied: false,
  };

  private markLoaded(key: keyof typeof this.loadingState) {
    this.loadingState[key] = true;
    if (Object.values(this.loadingState).every(Boolean)) {
      this.isLoading = false;
    }
  }

  onTextChange(val: string) {
    if (!this.selectedNode) return;

    // Update engine (handles StickyNote & plain SDFText paths)
    this.shapeManager.updateSDFText(this.selectedNode.id, { text: val });

    // Keep side-panel model in sync without breaking references
    const type = this.selectedNode.getType?.();
    if (type === 'Sticky Note') {
      // DO NOT do: this.selectedNode.text = val;
      this.selectedNode.text.text = val; // update the child’s string
    } else {
      this.selectedNode.text = val; // plain SDFText node
    }
  }

  newBoardButtonClicked(): void {
    this.closeContextMenu();
    let newBoard: Board = {
      id: 0, // Assuming you need an initial id
      name: 'Untitled Board', // Default name or handle name input
      description: '', // Default description or handle description input
      teamId: this.board.teamId
    };

    this.boardService.createBoard(newBoard).subscribe((res: any) => {
      if (res.resultType === ResultType.Success) {
        this.router.navigate(['/board', res.resultObject.uuid]);
        this.saveThumbnailIfChanged();
      } else {
        this.notifyService.error('There was an error creating a new board :(');
      }
    }, (error) => {
      this.notifyService.error('There was an error creating a new board :(');
      console.error(error);
    });
  }

  duplicateBoardButtonClicked(): void {
    this.closeContextMenu();
    if (!this.board) { 
      this.notifyService.error('No board loaded to duplicate.');
      return;
    }

    const payload = {
      name: `Copy of ${this.board.name}`,
      teamId: this.board.teamId,
      copyThumbnail: false // let the new board generate its own thumbnail after first render
    };

    this.boardService.duplicateBoard(this.board.id, payload).subscribe({
      next: (res: any) => {
        if (res.resultType === ResultType.Success) {
          const newUuid = res.resultObject.uuid;
          this.router.navigate(['/board', newUuid]);
        } else {
          this.notifyService.error('There was an error duplicating the board :(');
        }
      },
      error: (err) => {
        console.error(err);
        this.notifyService.error('There was an error duplicating the board :(');
      }
    });
  }

  async setCurrentViewAsThumbnail() {
    if (!this.boardUid || !this.board || !this.shapeManager) return;

    try {
      const blob = await this.shapeManager.captureThumbnailBlob(300);
      await firstValueFrom(this.boardService.uploadThumbnail(this.boardUid, blob, true));
      this.lastSavedThumbnailJSON = this.shapeManager.getSceneGraphJSON();
      this.notifyService.success('Thumbnail updated to the current view.');
    } catch (e) {
      console.error(e);
      this.notifyService.error('Could not set the thumbnail. Try again.');
    } finally {
      this.closeContextMenu();
    }
  }

}
