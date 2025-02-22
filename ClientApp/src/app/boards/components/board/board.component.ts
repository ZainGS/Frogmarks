import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ResultType } from '../../../shared/models/error-result.model';
import { BoardService } from '../../../shared/services/boards/board.service';
import { Board } from '../../models/board.model';
import ShapeManager from "@zaings/salsa/shape-manager";
import WorldManager from "@zaings/salsa/world-manager";
//import startWebGPURendering from "@zaings/salsa";
import { startWebGPURendering } from "@zaings/salsa";
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-board',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './board.component.html',
  styleUrl: './board.component.scss'
})
export class BoardComponent implements OnInit {
  boardUid: string | null = null;
  board: Board | null = null;
  controlPanelActiveTool = '';
  shapeManager: ShapeManager = null;
  worldManager: WorldManager = null;
  isCommentPanelActive: boolean = false;
  selectedPenColor: string = "#FFFFFF";
  selectedShapeColor: string = "#FFFFFF";
  selectedTextColor: string = "#FFFFFF";
  // colorPalette: string[] = ["red", "blue", "green", "orange", "purple"];
  cursorSelected: boolean = true;
  panHandSelected: boolean = false;

  colorPalette: string[] = [
    "#000000", // Black
    "#E74C3C", // Red
    "#F39C12", // Orange
    "#F1C40F", // Yellow
    "#2ECC71", // Green
    "#3498DB", // Blue
    "#9B59B6", // Purple
    "#FFFFFF"  // White
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
              private boardService: BoardService) { }

  async ngOnInit() {
    await startWebGPURendering("myCanvas").then(() => {
      // Get the singleton ShapeManager & WorldManager instances after Salsa has initialized
      this.shapeManager = ShapeManager.getInstance();
      this.worldManager = WorldManager.getInstance();
    });

    this.boardUid = this.route.snapshot.paramMap.get('id');

    if (this.boardUid) {
      this.boardService.getBoardByUid(this.boardUid).subscribe(res => {
        if (res.resultType === ResultType.Success) {
          this.board = res.resultObject;
        }
      });
    }
  }

  selectCursor(cursor: string) {
    switch(cursor) {
      case('cursor'):
          this.cursorSelected = true;
          this.panHandSelected = false;
          this.setActiveTool('');
        return;
      case('panhand'):
        this.cursorSelected = false;
        this.panHandSelected = true;
        this.setActiveTool('');
        return;
      default:
        return;

    }
  }

  setPenColor(color: string) {
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

  setActiveTool(activeTool: string) {
    if(activeTool != this.controlPanelActiveTool)
    {
      this.controlPanelActiveTool = activeTool;
      if(this.controlPanelActiveTool != "") {
        this.cursorSelected = false;
        this.panHandSelected = false;
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

    if(this.controlPanelActiveTool == 'drawing:eraser')
    {
      this.shapeManager.enableEraserTool();
    }
    else {
      this.shapeManager.disableEraserTool();
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
        console.log("test123");
        break;
    }
  }

}
