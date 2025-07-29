import { AfterViewInit, Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ResultType } from '../../../shared/models/error-result.model';
import { BoardService } from '../../../shared/services/boards/board.service';
import { Board } from '../../models/board.model';
import ShapeManager from "@zaings/salsa/shape-manager";
import WorldManager from "@zaings/salsa/world-manager";
//import startWebGPURendering from "@zaings/salsa";
import { isRendererLive, reinitializeWebGPURendering, startWebGPURendering } from "@zaings/salsa";
import { CommonModule } from '@angular/common';
import { ShapeType } from '../../../shared/enums/shape-type';
import { interval, Subscription } from 'rxjs';
import { ColorPickerComponent } from 'app/shared/components/color-picker/color-picker.component';
import { LayerTreeNode } from 'app/boards/models/layer-tree-node.model';

@Component({
  selector: 'app-board',
  standalone: false,
  templateUrl: './board.component.html',
  styleUrl: './board.component.scss'
})
export class BoardComponent implements OnInit {
  
  @ViewChild('bgColorPicker') bgColorPickerRef: ColorPickerComponent;
  @ViewChild('dotColorPicker') dotColorPickerRef: ColorPickerComponent;

  canvas: HTMLCanvasElement;
  boardUid: string | null = null;
  board: Board | null = null;
  layerTree: LayerTreeNode | null = null;
  selectedLayerIds: Set<string> = new Set();
  hoveredLayerId: string | null = null;
  private selectionChangedSubscription: { unsubscribe: () => void };
  public selectedNode: any | null = null;

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

  getBackgroundColor() { 
    this.bgColor = this.shapeManager.getBackgroundColor();
    this.bgHexInputDraft = this.bgColor;
  }

  getDotColor() { 
    this.dotColor = this.shapeManager.getDotColor();
    this.dotHexInputDraft = this.dotColor;
  }

  hoverLayer(event: MouseEvent, layer: LayerTreeNode) {
    event.stopPropagation();
    this.hoveredLayerId = layer.id;
    this.shapeManager.addSelectedNode(layer.id);
  }

  selectLayer(layer: LayerTreeNode, event?: MouseEvent) {
    event.stopPropagation();
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
    // Optionally update scene visibility
    //this.shapeManager?.setNodeVisibility(layer.id, layer.visible);
  }

  toggleLock(layer: LayerTreeNode) {
    layer.locked = !layer.locked;
    // Optionally update scene lock status
    //this.shapeManager?.setNodeLocked(layer.id, layer.locked);
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
  console.log(color);
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

  showPenColorPicker: boolean = false;
  customPenColor: string = "#fff";
  penColorPalette: string[] = [
    "#000000", // Black
    "#E74C3C", // Red
    "#F39C12", // Orange
    "#F1C40F", // Yellow
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


  constructor(private route: ActivatedRoute,
              private boardService: BoardService,
              private router: Router,) { }

  async ngOnInit() {

    // Ensure WebGPU only initializes if not already running
    if (!isRendererLive) {
      await startWebGPURendering("webgpuCanvas").then(() => {
        // Get the singleton ShapeManager & WorldManager instances after Salsa has initialized
        this.shapeManager = ShapeManager.getInstance();
        this.worldManager = WorldManager.getInstance();
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
        });

        this.shapeManager.interactionService.onSceneGraphChanged.subscribe(() => {
          const currentSceneJSON = this.shapeManager.getSceneGraphJSON();
          const parsed = JSON.parse(currentSceneJSON);
          this.layerTree = this.buildLayerTree(parsed.root);
          console.log("UPDATED");
        });

      });
    } else {
      await reinitializeWebGPURendering("webgpuCanvas").then(() => {
        // Get the singleton ShapeManager & WorldManager instances after Salsa has initialized
        this.shapeManager = ShapeManager.getInstance();
        this.worldManager = WorldManager.getInstance();
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
          console.log("UPDATED");
        });
      });
    }

    this.canvas = document.getElementById("webgpuCanvas") as HTMLCanvasElement;
    this.shapeManager.setStrokeWidth(this.strokeWidth);

    this.boardUid = this.route.snapshot.paramMap.get('id');
    if (this.boardUid) {
      this.boardService.getBoardByUid(this.boardUid).subscribe(res => {
        if (res.resultType === ResultType.Success) {
          this.board = res.resultObject;
          this.boardTitle = res.resultObject.name;
          // Ensure previous data is cleared
          this.resetSceneState();

          if(this.board.sceneGraphData && this.board.sceneGraphData.length > 0) {
            this.setBoardSceneGraph(this.board.sceneGraphData);
            const rawSceneGraph = JSON.parse(this.board.sceneGraphData);
            this.layerTree = this.buildLayerTree(rawSceneGraph.root); // Top-level
          }
          

          // Initialize autosave:
          this.startAutoSave();
        }
      });
    }

    // Track mouse movement for preview
    document.addEventListener("mousemove", (event: MouseEvent) => {
      if (event.target !== this.canvas) return;
      if (this.selectedShapeType) {
          this.shapeManager.updatePreviewShapePosition(event);
      }
    });

    // On click, confirm the preview shape as a real shape
    document.addEventListener("click", (event: MouseEvent) => {
      if (event.target !== this.canvas) return;
      if (this.selectedShapeType) {
        this.shapeManager.confirmPreviewShape();
          this.shapeManager.setPreviewShape(this.selectedShapeType, event);
      }
    });

    // Listen for hotkeys
    window.addEventListener("keydown", this.handleHotkeys.bind(this));

    document.addEventListener('mousedown', this.handleBgColorPickerClick.bind(this));
    
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
    if(this.shapeManager.isTextDrawingInProgress()) return;
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
    this.shapeManager.setHighlightColor(this.highlightColorMapping.get(this.selectedHighlightColor));
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
    } else {
      this.setPreviewShapeSelected(null, event);
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
      default:
        break;
    }
  }

  downloadCanvasViewAsPng() {
    const canvas = document.getElementById("webgpuCanvas") as HTMLCanvasElement;
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
    if (currentJSON !== this.lastSavedJSON) {
      this.lastSavedJSON = currentJSON; // Update last saved JSON
      console.log(this.board);
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

  setBoardSceneGraph(sceneGraphJSON: string) {
    this.shapeManager.setSceneGraphJSON(sceneGraphJSON);
  }

  private startAutoSave() {
    
    // Avoid multiple subscriptions
    if (this.autoSaveSubscription) {
      this.autoSaveSubscription.unsubscribe();
    }
    if (this.thumbnailSaveSubscription) {
        this.thumbnailSaveSubscription.unsubscribe();
    }

    // Autosave scene every 2 seconds
    this.autoSaveSubscription = interval(2000).subscribe(() => {
      this.saveBoardIfChanged();
    });

    // Thumbnail save every 1 minute (if changes detected)
    this.thumbnailSaveSubscription = interval(60000).subscribe(() => {
      this.saveThumbnailIfChanged();
    });
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

  async saveThumbnail() {

    const canvas = document.getElementById("webgpuCanvas") as HTMLCanvasElement;
    if (!canvas) {
        console.error("Canvas element not found!");
        return;
    }

    requestAnimationFrame(async () => {
      const thumbnailBlob = await this.getThumbnailBlob(canvas);

      // const url = URL.createObjectURL(thumbnailBlob);
      // window.open(url); // Check if it displays correctly before upload

      this.boardService.uploadThumbnail(this.boardUid, thumbnailBlob).subscribe(res => {
        console.log(res);
      });
    });
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
    return {
      id: data.id, // || generateRandomId(),
      type: data.type || 'Unknown',
      name: data.name || data.type || 'Untitled',
      visible: data.visible !== false,
      locked: data.locked,
      children: Array.isArray(data.children) ? data.children.map(child => this.buildLayerTree(child)) : []
    };
  }

  boardTitle: string = '';
  updateBoardTitle() {
    /// todo: make an API call to update the board title
  }

  trackById(index: number, item: LayerTreeNode): string {
    return item.id;
  }

  ngOnDestroy(): void {
    if (this.autoSaveSubscription) {
      this.autoSaveSubscription.unsubscribe();
    }
    if(this.thumbnailSaveSubscription) {
      this.thumbnailSaveSubscription.unsubscribe();
    }
    if (this.selectionChangedSubscription) {
      this.selectionChangedSubscription.unsubscribe();
    }

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

  get xFormatted(): number {
    return parseFloat(this.selectedNode?.x?.toFixed(2) || '0');
  }
  set xFormatted(val: number) {
    if (this.selectedNode) this.selectedNode.x = val;
  }

  get yFormatted(): number {
    return parseFloat(this.selectedNode?.y?.toFixed(2) || '0');
  }
  set yFormatted(val: number) {
    if (this.selectedNode) this.selectedNode.y = val;
  }

}
