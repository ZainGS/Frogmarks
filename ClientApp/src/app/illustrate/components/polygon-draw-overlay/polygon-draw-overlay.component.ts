import { Component, ElementRef, Input, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import { SceneAddService } from '../../services/scene-add.service';
import type { V3 } from '../../utils/mesh-generator';

/**
 * Add Mesh › Polygon…: the outline being drawn, over the 3D canvas — the placed points, the line to the pointer, and a
 * small bar (Undo / Done / Cancel). Points live in world space (SceneAddService.polyDraw), so the outline stays put
 * while the camera orbits: redrawn every frame outside Angular. Keys while drawing: Enter = Done, Esc = Cancel,
 * Backspace = Undo (before the editor's own shortcuts see them).
 */
@Component({
  selector: 'app-polygon-draw-overlay',
  templateUrl: './polygon-draw-overlay.component.html',
  styleUrls: ['./polygon-draw-overlay.component.scss'],
})
export class PolygonDrawOverlayComponent implements OnInit, OnDestroy {
  @Input() shapeManager: ShapeManager = null;
  @Input() canvas: HTMLCanvasElement | null = null;

  @ViewChild('svg', { static: true }) svgRef!: ElementRef<SVGSVGElement>;
  @ViewChild('line', { static: true }) lineRef!: ElementRef<SVGPolylineElement>;
  @ViewChild('rubber', { static: true }) rubberRef!: ElementRef<SVGPolylineElement>;
  @ViewChild('dots', { static: true }) dotsRef!: ElementRef<SVGGElement>;

  private _raf = 0;
  private _sig = '';

  constructor(public add: SceneAddService, private ngZone: NgZone, private host: ElementRef<HTMLElement>) {}

  get count(): number { return this.add.polyDraw?.pts.length ?? 0; }

  ngOnInit(): void {
    this.ngZone.runOutsideAngular(() => {
      window.addEventListener('keydown', this._onKey, true);
      const tick = (): void => { this._draw(); this._raf = requestAnimationFrame(tick); };
      this._raf = requestAnimationFrame(tick);
    });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this._raf);
    window.removeEventListener('keydown', this._onKey, true);
  }

  undo(): void { this.add.scene3dPolygonUndoPoint(); }
  done(): void { this.add.scene3dFinishPolygonDraw(); }
  cancel(): void { this.add.scene3dCancelPolygonDraw(); }

  private readonly _onKey = (e: KeyboardEvent): void => {
    if (!this.add.polyDraw) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    const act = e.key === 'Escape' ? () => this.cancel()
      : e.key === 'Enter' ? () => this.done()
      : (e.key === 'Backspace' || e.key === 'Delete') ? () => this.undo()
      : null;
    if (!act) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    this.ngZone.run(act);
  };

  /** Follow the canvas box and re-project the points (the camera may move); DOM writes only when something changed. */
  private _draw(): void {
    const d = this.add.polyDraw, sm = this.shapeManager, cv = this.canvas;
    if (!d || !sm || !cv) return;
    const r = cv.getBoundingClientRect();
    const proj = (p: V3): [number, number] | null => {
      const s = sm.projectWorldToScreen3D(p[0], p[1], p[2], r.width, r.height);
      return s ? [Math.round(s.x * 10) / 10, Math.round(s.y * 10) / 10] : null;
    };
    const pts = d.pts.map(proj).filter((p): p is [number, number] => !!p);
    const hover = d.hover ? proj(d.hover) : null;
    const sig = `${r.left},${r.top},${r.width},${r.height}|${pts.join(';')}|${hover ?? ''}`;
    if (sig === this._sig) return;
    this._sig = sig;
    const hs = this.host.nativeElement.style;
    hs.left = `${r.left}px`; hs.top = `${r.top}px`; hs.width = `${r.width}px`; hs.height = `${r.height}px`;
    this.lineRef.nativeElement.setAttribute('points', pts.map(p => p.join(',')).join(' '));
    const last = pts[pts.length - 1];
    this.rubberRef.nativeElement.setAttribute('points', last && hover ? `${last.join(',')} ${hover.join(',')}` : '');
    // Square point handles; the first one larger + filled once tapping it closes the outline. (Inline attributes: these
    // nodes are made here, outside the component's style scope.)
    const closable = pts.length >= 3;
    this.dotsRef.nativeElement.innerHTML = pts.map((p, i) => {
      const big = i === 0 && closable, h = big ? 5 : 3;
      return `<rect x="${p[0] - h}" y="${p[1] - h}" width="${h * 2}" height="${h * 2}" fill="${big ? '#4f7a68' : '#0a0a0a'}" stroke="#c8ede3" stroke-width="1.5"></rect>`;
    }).join('');
  }
}
