import { Injectable, OnDestroy, NgZone } from '@angular/core';
import ShapeManager from '@zaings/salsa/shape-manager';
import type { IllustrationComponent } from '../components/illustration/illustration.component';
import { NotifyService } from 'app/shared/services/notify/notify.service';

/** Exactly the editor state the engine status readouts use. */
export type EngineStatusHost = Pick<IllustrationComponent, 'shapeManager'>;

/**
 * Engine status readouts: the shader warm-up / worker-job pill, the GPU device-lost / recovered / failed banner
 * (Salsa docs/ui/device-recovery.md), and the deferred save / export notice. Component-scoped (provided by
 * IllustrationComponent). Bodies moved verbatim from illustration.component (refactor-plan 2.9H).
 */
@Injectable()
export class EngineStatusService implements OnDestroy {
  private host!: EngineStatusHost;
  constructor(private ngZone: NgZone, private notifyService: NotifyService) {}
  bind(host: EngineStatusHost): void { this.host = host; }
  private get shapeManager(): ShapeManager { return this.host.shapeManager; }

  ngOnDestroy(): void {
    this.teardown();
  }

  /** Before each boot (a doc switch re-boots on the same instance) and on destroy: drop every engine listener. */
  teardown(): void {
    for (const u of this._engineStatusUnsubs) { try { u(); } catch { /* ignore */ } }
    this._engineStatusUnsubs = [];
    clearTimeout(this._deviceBannerTimer); this._deviceBannerTimer = null;
  }

  engineStatusText = '';
  private _pipeStatus: { compiled: number; total: number; waiting: boolean } = { compiled: 0, total: 0, waiting: false };
  private _jobStatus: { active: boolean; label: string; done: number; total: number } = { active: false, label: '', done: 0, total: 0 };
  private _engineStatusUnsubs: Array<() => void> = [];
  private _updateEngineStatus(): void {
    let txt = '';
    if (this._pipeStatus.waiting) txt = `Preparing shaders… ${this._pipeStatus.compiled}/${this._pipeStatus.total}`;
    else if (this._jobStatus.active) txt = this._jobStatus.total > 1 ? `${this._jobStatus.label}… ${this._jobStatus.done}/${this._jobStatus.total}` : `${this._jobStatus.label}…`;
    if (txt !== this.engineStatusText) this.ngZone.run(() => { this.engineStatusText = txt; });
  }

  /** Engine boot: start listening (pipeline warm-up, worker jobs, device status, deferred saves). */
  subscribe(): void {
    const sm = this.shapeManager;
    const u1 = sm.onPipelineWarmup3D((st: any) => {
      // Only while a DRAW is waiting on a shader — the idle background warm-up must not flash the pill on every load.
      this._pipeStatus = { compiled: st?.compiled ?? 0, total: st?.total ?? 0, waiting: (st?.waitingDraws ?? 0) > 0 };
      this._updateEngineStatus();
    });
    const u2 = sm.onWorkerJobProgress3D((p: any) => {
      const fg = (p?.jobs ?? []).filter((j: any) => j.priority !== 'background');
      this._jobStatus = { active: !!p?.active && fg.length > 0, label: fg[0]?.label ?? 'Working', done: p?.done ?? 0, total: p?.total ?? 0 };
      this._updateEngineStatus();
    });
    for (const u of [u1, u2]) if (typeof u === 'function') this._engineStatusUnsubs.push(u);
    this._subscribeDeviceStatus();
  }

  // The engine recovers by itself (new device, document restored from its CPU snapshot); this only tells the user.
  /** null = hidden; 'recovering' while lost / recovering; 'recovered' briefly after; 'failed' until reload. */
  deviceBanner: null | 'recovering' | 'recovered' | 'failed' = null;

  /** What the last recovery couldn't bring back (shown with 'recovered'), or why it failed. */
  deviceBannerDetail: string[] = [];
  private _deviceBannerTimer: any = null;

  private _subscribeDeviceStatus(): void {
    const sm = this.shapeManager;
    const off = sm.onDeviceStatusChange((info: any) => this.ngZone.run(() => this._onDeviceStatus(info)));
    if (typeof off === 'function') this._engineStatusUnsubs.push(off);
    // A save / export asked for during Play (or while the device recovers) waits — say so instead of looking stuck.
    const off2 = sm.onPersistDeferred((info: any) => this.ngZone.run(() => this._onPersistDeferred(info)));
    if (typeof off2 === 'function') this._engineStatusUnsubs.push(off2);
    this._engineStatusUnsubs.push(() => { clearTimeout(this._deviceBannerTimer); this._deviceBannerTimer = null; });
    const now = sm.getDeviceStatus();
    if (now && now.status !== 'ok' && now.status !== 'initializing') this._onDeviceStatus(now);
  }

  private _onDeviceStatus(info: any): void {
    clearTimeout(this._deviceBannerTimer); this._deviceBannerTimer = null;
    const st = info?.status;
    if (st === 'lost' || st === 'recovering') { this.deviceBanner = 'recovering'; this.deviceBannerDetail = []; return; }
    if (st === 'failed' || st === 'unavailable') {
      this.deviceBanner = 'failed';
      this.deviceBannerDetail = info?.message ? [String(info.message)] : [];
      return;
    }
    if (st === 'ok' && this.deviceBanner) {
      this.deviceBanner = 'recovered';
      this.deviceBannerDetail = Array.isArray(info?.unrecovered) ? info.unrecovered.slice() : [];
      // Brief when everything came back; longer when there is something to read.
      this._deviceBannerTimer = setTimeout(() => this.ngZone.run(() => { this.deviceBanner = null; this.deviceBannerDetail = []; }),
        this.deviceBannerDetail.length ? 8000 : 2500);
    }
  }

  deviceBannerReload(): void { window.location.reload(); }

  deviceBannerDismiss(): void { clearTimeout(this._deviceBannerTimer); this._deviceBannerTimer = null; this.deviceBanner = null; this.deviceBannerDetail = []; }

  private _onPersistDeferred(info: any): void {
    const what = info?.kind === 'export' ? 'Export' : 'Save';
    const until = info?.reason === 'device-lost' ? 'once the graphics device has recovered'
      : info?.reason === 'player' ? 'when you leave Player mode'
      : info?.reason === 'ui-preview' ? 'when you leave the UI preview'
      : 'when you stop Play';
    this.notifyService.success(`${what} will finish ${until}`);
  }
}
