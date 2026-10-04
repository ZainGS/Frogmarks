import { Injectable, OnDestroy, NgZone } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { IllustrationComponent } from '../components/illustration/illustration.component';

/** Exactly the editor state the stats overlay uses. */
export type SceneStatsHost = Pick<IllustrationComponent, 'shapeManager'>;

/**
 * 3D scene stats overlay: polled engine stats (draw calls, triangles, frame time, memory) while visible, and the
 * budget warning colour. Component-scoped (provided by IllustrationComponent). Bodies moved verbatim from
 * illustration.component (refactor-plan 2.9H).
 */
@Injectable()
export class SceneStatsService implements OnDestroy {
  private host!: SceneStatsHost;
  constructor(private ngZone: NgZone) {}
  bind(host: SceneStatsHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }

  ngOnDestroy(): void {
    clearInterval(this._statsInterval);
  }

  // Performance stats HUD
  scene3dStatsVisible = false;
  scene3dStats: any = null;
  private _statsInterval: any = null;

  scene3dToggleStats(): void {
    this.scene3dStatsVisible = !this.scene3dStatsVisible;
    if (this.scene3dStatsVisible) {
      this.scene3dStats = this.shapeManager.getRenderStats3D() ?? null;
      this.scene3dBudgetWarning = this.shapeManager.getSceneBudget3D()?.warning ?? null;   // Salsa step 3: budgets
      this._statsSig = this._scene3dStatsSig(this.scene3dStats);
      // Salsa step 2: poll OUTSIDE Angular's zone (a zone timer ran a full change detection 4x a second) and re-enter
      // it only when a value the HUD shows changed (at the HUD's own rounding).
      this._statsInterval = this.ngZone.runOutsideAngular(() => setInterval(() => {
        const s = this.shapeManager.getRenderStats3D() ?? null;
        const bw: string | null = this.shapeManager.getSceneBudget3D()?.warning ?? null;   // Salsa step 3: over-budget line
        const sig = this._scene3dStatsSig(s);
        if (sig === this._statsSig && bw === this.scene3dBudgetWarning) return;
        this._statsSig = sig;
        this.ngZone.run(() => { this.scene3dStats = s; this.scene3dBudgetWarning = bw; });
      }, 250));
    } else {
      clearInterval(this._statsInterval);
      this._statsInterval = null;
      this.scene3dStats = null;
      this.scene3dBudgetWarning = null;
      this._statsSig = '';
    }
  }

  /** Salsa step 3 (docs/ui/performance.md §Budgets): getSceneBudget3D().warning — 'Over budget: 6.1 M tris (3.0 M tris), …', or null. */
  scene3dBudgetWarning: string | null = null;
  private _statsSig = '';

  /** The stats HUD's displayed values (template rounding: fps integer, frame ms 1 dp, MB 1 dp). */
  private _scene3dStatsSig(s: any): string {
    if (!s) return '';
    return [Math.round(s.fps ?? 0), (s.frameMs ?? 0).toFixed(1), s.triangles, s.vertices, s.objects, ((s.geometryBytes ?? 0) / 1048576).toFixed(1),
      s.gpStrokes, s.gpuName, JSON.stringify(s.byCategory ?? null), JSON.stringify(s.drawn ?? null), s.drawCalls?.total].join('|');
  }

  scene3dStatsBudgetColor(tris: number): string {
    if (tris < 100_000) return '#4caf50';
    if (tris < 300_000) return '#ff9800';
    return '#f44336';
  }
}
