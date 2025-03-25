import { Component, OnInit } from '@angular/core';
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

@Component({
  selector: 'app-board',
  standalone: false,
  templateUrl: './board.component.html',
  styleUrl: './board.component.scss'
})
export class BoardComponent implements OnInit {
  canvas: HTMLCanvasElement;
  boardUid: string | null = null;
  board: Board | null = null;

  private autoSaveSubscription!: Subscription;
  private thumbnailSaveSubscription!: Subscription;
  
  private lastSavedJSON: string = '';

  controlPanelActiveTool = '';
  shapeManager: ShapeManager = null;
  worldManager: WorldManager = null;
  isCommentPanelActive: boolean = false;
  selectedPenColor: string = "#FFFFFF";
  selectedShapeColor: string = "#FFFFFF";
  selectedTextColor: string = "#FFFFFF";
  selectedHighlightColor: string = "#FFFFFF";
  selectedPattern: string = "assets/patterns/leaves.svg";
  // colorPalette: string[] = ["red", "blue", "green", "orange", "purple"];
  cursorSelected: boolean = true;
  panHandSelected: boolean = false;

  strokeWidth: number = 2;
  selectedShapeType: ShapeType | null = null;

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
      });
    } else {
      await reinitializeWebGPURendering("webgpuCanvas").then(() => {
        // Get the singleton ShapeManager & WorldManager instances after Salsa has initialized
        this.shapeManager = ShapeManager.getInstance();
        this.worldManager = WorldManager.getInstance();
      });
    }

    this.canvas = document.getElementById("webgpuCanvas") as HTMLCanvasElement;
    this.shapeManager.setStrokeWidth(this.strokeWidth);

    this.boardUid = this.route.snapshot.paramMap.get('id');
    if (this.boardUid) {
      this.boardService.getBoardByUid(this.boardUid).subscribe(res => {
        console.log(res.resultObject);
        console.log("A");
        if (res.resultType === ResultType.Success) {
          this.board = res.resultObject;

          // Ensure previous data is cleared
          this.resetSceneState();

          if(this.board.sceneGraphData && this.board.sceneGraphData.length > 0) {
            this.setBoardSceneGraph(this.board.sceneGraphData);
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
        case "+" : // + → Zoom In
        case "=" :
            this.zoomIn();
            break;
        case "-": // - → Zoom Out
        case "_":
            this.zoomOut();
            break;
        default:
            return; // Ignore keys that are not mapped
    }

    event.preventDefault(); // Prevent default browser behavior (like spacebar scrolling)
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

      const url = URL.createObjectURL(thumbnailBlob);
      window.open(url); // Check if it displays correctly before upload

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

  ngOnDestroy(): void {
    if (this.autoSaveSubscription) {
      this.autoSaveSubscription.unsubscribe();
    }
    if(this.thumbnailSaveSubscription) {
      this.thumbnailSaveSubscription.unsubscribe();
    }

    // Ensure WebGPU is reset before switching boards
    this.resetSceneState();
  }

}
