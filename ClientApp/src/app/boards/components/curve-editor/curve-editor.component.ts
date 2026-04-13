import {
  Component,
  Input,
  Output,
  EventEmitter,
  ElementRef,
  ViewChild,
  AfterViewInit,
} from '@angular/core';

/**
 * CurveEditorComponent
 * --------------------
 * A ~150×100 interactive curve editor for pressure dynamics.
 * Points are in 0-1 space on both axes.  Users can:
 *  - click to add a point
 *  - drag to move a point
 *  - right-click to delete (minimum 2 points kept)
 */
@Component({
  selector: 'app-curve-editor',
  standalone: false,
  template: `
    <div class="curve-wrap">
      <canvas #curveCanvas
              [width]="width" [height]="height"
              (mousedown)="onMouseDown($event)"
              (mousemove)="onMouseMove($event)"
              (mouseup)="onMouseUp($event)"
              (mouseleave)="onMouseUp($event)"
              (contextmenu)="onRightClick($event)">
      </canvas>
      <div class="curve-presets">
        <button (click)="setLinear()" title="Linear">Linear</button>
        <button (click)="setConstant()" title="Constant (flat)">Const</button>
      </div>
    </div>
  `,
  styles: [`
    .curve-wrap {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    canvas {
      background: #1e1e1e;
      border: 1px solid #555;
      border-radius: 3px;
      cursor: crosshair;
    }
    .curve-presets {
      display: flex;
      gap: 4px;
    }
    .curve-presets button {
      background: #333;
      color: #ccc;
      border: 1px solid #555;
      border-radius: 3px;
      font-size: 9px;
      padding: 2px 6px;
      cursor: pointer;
    }
    .curve-presets button:hover {
      background: #444;
    }
  `],
})
export class CurveEditorComponent implements AfterViewInit {
  @Input() points: { x: number; y: number }[] = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  @Output() pointsChange = new EventEmitter<{ x: number; y: number }[]>();
  @ViewChild('curveCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  readonly width = 150;
  readonly height = 100;
  private readonly PAD = 6;
  private dragging: number | null = null;

  ngAfterViewInit(): void {
    this.draw();
  }

  // ── Quick presets ──────────────────────────────────────────

  setLinear(): void {
    this.points = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    this.emit();
  }

  setConstant(): void {
    this.points = [{ x: 0, y: 1 }, { x: 1, y: 1 }];
    this.emit();
  }

  // ── Mouse handling ─────────────────────────────────────────

  onMouseDown(e: MouseEvent): void {
    e.preventDefault();
    const [mx, my] = this.eventToNorm(e);
    // Check if clicking near an existing point
    const idx = this.findNearPoint(mx, my);
    if (idx >= 0) {
      this.dragging = idx;
    } else {
      // Add new point
      this.points.push({ x: mx, y: my });
      this.sortPoints();
      this.dragging = this.findNearPoint(mx, my);
      this.emit();
    }
  }

  onMouseMove(e: MouseEvent): void {
    if (this.dragging === null) return;
    e.preventDefault();
    const [mx, my] = this.eventToNorm(e);
    this.points[this.dragging] = { x: clamp01(mx), y: clamp01(my) };
    this.sortPoints();
    this.dragging = this.findNearPoint(mx, my);
    this.draw();
  }

  onMouseUp(_e: MouseEvent): void {
    if (this.dragging !== null) {
      this.dragging = null;
      this.emit();
    }
  }

  onRightClick(e: MouseEvent): void {
    e.preventDefault();
    if (this.points.length <= 2) return;
    const [mx, my] = this.eventToNorm(e);
    const idx = this.findNearPoint(mx, my);
    if (idx >= 0) {
      this.points.splice(idx, 1);
      this.emit();
    }
  }

  // ── Drawing ────────────────────────────────────────────────

  private draw(): void {
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const w = this.width;
    const h = this.height;
    const pad = this.PAD;

    ctx.clearRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const x = pad + (w - 2 * pad) * (i / 4);
      ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, h - pad); ctx.stroke();
      const y = pad + (h - 2 * pad) * (i / 4);
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke();
    }

    // Curve line
    if (this.points.length >= 2) {
      ctx.strokeStyle = '#b87fd9';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < this.points.length; i++) {
        const px = pad + this.points[i].x * (w - 2 * pad);
        const py = h - pad - this.points[i].y * (h - 2 * pad);
        i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // Points
    for (let i = 0; i < this.points.length; i++) {
      const px = pad + this.points[i].x * (w - 2 * pad);
      const py = h - pad - this.points[i].y * (h - 2 * pad);
      ctx.fillStyle = i === this.dragging ? '#fff' : '#b87fd9';
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Helpers ────────────────────────────────────────────────

  private eventToNorm(e: MouseEvent): [number, number] {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const pad = this.PAD;
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const nx = clamp01((cx - pad) / (this.width - 2 * pad));
    const ny = clamp01(1 - (cy - pad) / (this.height - 2 * pad));
    return [nx, ny];
  }

  private findNearPoint(nx: number, ny: number): number {
    const threshold = 0.08;
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < this.points.length; i++) {
      const dx = this.points[i].x - nx;
      const dy = this.points[i].y - ny;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < threshold && d < bestDist) { bestDist = d; best = i; }
    }
    return best;
  }

  private sortPoints(): void {
    this.points.sort((a, b) => a.x - b.x);
  }

  private emit(): void {
    this.sortPoints();
    this.draw();
    this.pointsChange.emit([...this.points]);
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
