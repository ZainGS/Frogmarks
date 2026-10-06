import {
  applyStoredExperiments, EXP_DIRTY_COMPOSITING_KEY, ExperimentalEngineApi, ExperimentalSettingsService,
  SALSA_LOSS_TIMES_KEY, SALSA_SAFE_MODE_KEY,
} from './experimental-settings.service';

type Diagnostics = ReturnType<NonNullable<ExperimentalEngineApi['getGpuDiagnostics3D']>>;
type Smoothing = 'off' | 'light' | 'normal';

/** A stand-in engine with every Experimental API, backed by plain fields. */
function makeEngine(init: { prediction?: boolean; dirty?: boolean; smoothing?: Smoothing; safeMode?: boolean } = {}) {
  const state = { prediction: init.prediction ?? false, dirty: init.dirty ?? false, smoothing: init.smoothing ?? 'light' };
  const diagnostics = {
    zzz: 'rest', tier: 'mobile', reasons: ['Android UA'], safeMode: init.safeMode ?? false, caps: { gpuDriven: false },
    adapter: { vendor: 'qualcomm' }, gpuName: 'adreno', canvas: { width: 1600, height: 1000 }, lastLoss: null,
  } as unknown as Diagnostics;
  const sm = {
    setStrokePrediction: jasmine.createSpy('setStrokePrediction').and.callFake((on: boolean) => { state.prediction = on; }),
    getStrokePrediction: jasmine.createSpy('getStrokePrediction').and.callFake(() => state.prediction),
    setRasterDirtyCompositing: jasmine.createSpy('setRasterDirtyCompositing').and.callFake((on: boolean) => { state.dirty = on; }),
    getRasterDirtyCompositing: jasmine.createSpy('getRasterDirtyCompositing').and.callFake(() => state.dirty),
    setTouchSmoothing: jasmine.createSpy('setTouchSmoothing').and.callFake((m: Smoothing) => { state.smoothing = m; }),
    getTouchSmoothing: jasmine.createSpy('getTouchSmoothing').and.callFake(() => state.smoothing),
    runStrokePredictionSelfTest: jasmine.createSpy('runStrokePredictionSelfTest')
      .and.resolveTo({ ok: true, errors: [], cases: [], summary: 'round: ok\npencil: ok' }),
    getGpuDiagnostics3D: jasmine.createSpy('getGpuDiagnostics3D').and.returnValue(diagnostics),
  };
  return { sm, state };
}

/** The service with the browser seams replaced: no real confirm, no real reload. */
function makeService(url = 'https://app.test/illustrate/5?x=1') {
  const svc = new ExperimentalSettingsService();
  spyOn(svc, 'currentUrl').and.returnValue(url);
  const confirm = spyOn(svc, 'confirmReload').and.returnValue(true);
  const reload = spyOn(svc, 'reloadPage');
  return { svc, confirm, reload };
}

describe('ExperimentalSettingsService (editor › Experimental menu)', () => {
  const KEYS = [EXP_DIRTY_COMPOSITING_KEY, SALSA_SAFE_MODE_KEY, SALSA_LOSS_TIMES_KEY];
  let saved: Array<string | null>;
  beforeEach(() => { saved = KEYS.map((k) => localStorage.getItem(k)); KEYS.forEach((k) => localStorage.removeItem(k)); });
  afterEach(() => KEYS.forEach((k, i) => {
    const v = saved[i];
    if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
  }));

  describe('toggles', () => {
    it('refresh reads the current values from the engine', () => {
      const { svc } = makeService();
      const { sm } = makeEngine({ prediction: true, dirty: true, smoothing: 'normal' });
      svc.refresh(sm);
      expect(svc.strokePrediction).toBeTrue();
      expect(svc.dirtyCompositing).toBeTrue();
      expect(svc.touchSmoothing).toBe('normal');
      expect(svc.safeMode).toBeFalse();
    });

    it('stroke prediction flips the engine setting and stores nothing itself (Salsa persists it)', () => {
      const { svc } = makeService();
      const { sm } = makeEngine();
      svc.toggleStrokePrediction(sm);
      expect(sm.setStrokePrediction).toHaveBeenCalledOnceWith(true);
      expect(svc.strokePrediction).toBeTrue();
      svc.toggleStrokePrediction(sm);
      expect(sm.setStrokePrediction.calls.mostRecent().args).toEqual([false]);
      expect(svc.strokePrediction).toBeFalse();
      expect(localStorage.getItem(EXP_DIRTY_COMPOSITING_KEY)).toBeNull();
    });

    it('fast compositing flips the engine setting and remembers it per machine', () => {
      const { svc } = makeService();
      const { sm } = makeEngine();
      svc.toggleDirtyCompositing(sm);
      expect(sm.setRasterDirtyCompositing).toHaveBeenCalledOnceWith(true);
      expect(svc.dirtyCompositing).toBeTrue();
      expect(localStorage.getItem(EXP_DIRTY_COMPOSITING_KEY)).toBe('1');
      svc.toggleDirtyCompositing(sm);
      expect(sm.setRasterDirtyCompositing.calls.mostRecent().args).toEqual([false]);
      expect(svc.dirtyCompositing).toBeFalse();
      expect(localStorage.getItem(EXP_DIRTY_COMPOSITING_KEY)).toBeNull();
    });

    it('fast compositing still switches when storage throws', () => {
      const { svc } = makeService();
      const { sm } = makeEngine();
      spyOn(Storage.prototype, 'setItem').and.throwError('blocked');
      expect(() => svc.toggleDirtyCompositing(sm)).not.toThrow();
      expect(sm.setRasterDirtyCompositing).toHaveBeenCalledOnceWith(true);
      expect(svc.dirtyCompositing).toBeTrue();
    });

    it('finger smoothing passes the mode through; "Brush setting" is the engine value "normal"', () => {
      const { svc } = makeService();
      const { sm } = makeEngine();
      expect(svc.smoothingOptions.map((o) => o.value)).toEqual(['off', 'light', 'normal']);
      expect(svc.smoothingOptions.find((o) => o.value === 'normal')?.label).toBe('Brush setting');
      svc.setTouchSmoothing(sm, 'normal');
      expect(sm.setTouchSmoothing).toHaveBeenCalledOnceWith('normal');
      expect(svc.touchSmoothing).toBe('normal');
      svc.setTouchSmoothing(sm, 'off');
      expect(svc.touchSmoothing).toBe('off');
    });
  });

  describe('re-apply after the renderer boots', () => {
    it('turns fast compositing back on when it was stored', () => {
      localStorage.setItem(EXP_DIRTY_COMPOSITING_KEY, '1');
      const { sm } = makeEngine();
      applyStoredExperiments(sm);
      expect(sm.setRasterDirtyCompositing).toHaveBeenCalledOnceWith(true);
    });

    it('a toggle in one session is re-applied in the next', () => {
      const first = makeEngine();
      makeService().svc.toggleDirtyCompositing(first.sm);
      const next = makeEngine();   // a reload: the engine is back at its default (off)
      applyStoredExperiments(next.sm);
      expect(next.state.dirty).toBeTrue();
    });

    it('leaves the engine default alone when nothing is stored, or it was turned off again', () => {
      const { sm } = makeEngine();
      applyStoredExperiments(sm);
      expect(sm.setRasterDirtyCompositing).not.toHaveBeenCalled();
      const { svc } = makeService();
      svc.toggleDirtyCompositing(sm);
      svc.toggleDirtyCompositing(sm);
      sm.setRasterDirtyCompositing.calls.reset();
      applyStoredExperiments(sm);
      expect(sm.setRasterDirtyCompositing).not.toHaveBeenCalled();
    });

    it('does not throw on an older engine, a missing engine, a throwing engine or blocked storage', () => {
      localStorage.setItem(EXP_DIRTY_COMPOSITING_KEY, '1');
      expect(() => applyStoredExperiments({})).not.toThrow();
      expect(() => applyStoredExperiments(null)).not.toThrow();
      expect(() => applyStoredExperiments(undefined)).not.toThrow();
      expect(() => applyStoredExperiments({ setRasterDirtyCompositing: () => { throw new Error('boom'); } })).not.toThrow();
      spyOn(Storage.prototype, 'getItem').and.throwError('blocked');
      const { sm } = makeEngine();
      expect(() => applyStoredExperiments(sm)).not.toThrow();
      expect(sm.setRasterDirtyCompositing).not.toHaveBeenCalled();
    });
  });

  describe('a Salsa dist without the APIs', () => {
    it('hides every engine item and every action is a no-op', async () => {
      const { svc } = makeService();
      for (const sm of [{}, null, undefined]) {
        svc.refresh(sm);
        expect([svc.hasStrokePrediction, svc.hasDirtyCompositing, svc.hasTouchSmoothing, svc.hasSelfTest, svc.hasGpuInfo])
          .toEqual([false, false, false, false, false]);
        expect(() => {
          svc.toggleStrokePrediction(sm);
          svc.toggleDirtyCompositing(sm);
          svc.setTouchSmoothing(sm, 'off');
          svc.showGpuInfo(sm);
        }).not.toThrow();
        await svc.runPredictionSelfTest(sm);
      }
      expect(svc.dialog).toBeNull();
      expect(localStorage.getItem(EXP_DIRTY_COMPOSITING_KEY)).toBeNull();
    });

    it('shows only the items whose API exists', () => {
      const { svc } = makeService();
      const { sm } = makeEngine();
      svc.refresh({ setStrokePrediction: sm.setStrokePrediction, getStrokePrediction: sm.getStrokePrediction });
      expect(svc.hasStrokePrediction).toBeTrue();
      expect([svc.hasDirtyCompositing, svc.hasTouchSmoothing, svc.hasSelfTest, svc.hasGpuInfo]).toEqual([false, false, false, false]);
      svc.refresh({ setRasterDirtyCompositing: sm.setRasterDirtyCompositing });   // a setter without its getter
      expect(svc.hasDirtyCompositing).toBeFalse();
      svc.refresh(sm);
      expect([svc.hasStrokePrediction, svc.hasDirtyCompositing, svc.hasTouchSmoothing, svc.hasSelfTest, svc.hasGpuInfo])
        .toEqual([true, true, true, true, true]);
    });
  });

  describe('actions', () => {
    it('the self-test shows the verdict and the summary', async () => {
      const { svc } = makeService();
      const { sm } = makeEngine();
      const run = svc.runPredictionSelfTest(sm);
      expect(svc.dialog?.busy).toBeTrue();
      await run;
      expect(svc.dialog?.busy).toBeFalse();
      expect(svc.dialog?.text).toContain('PASS');
      expect(svc.dialog?.text).toContain('round: ok\npencil: ok');
    });

    it('the self-test reports a failure, its GPU errors, a missing device and a throw', async () => {
      const { svc } = makeService();
      const { sm } = makeEngine();
      sm.runStrokePredictionSelfTest.and.resolveTo({ ok: false, errors: ['validation: bad bind group'], cases: [], summary: 'round: 12 texels differ' });
      await svc.runPredictionSelfTest(sm);
      expect(svc.dialog?.text).toContain('FAIL');
      expect(svc.dialog?.text).toContain('round: 12 texels differ');
      expect(svc.dialog?.text).toContain('validation: bad bind group');
      sm.runStrokePredictionSelfTest.and.resolveTo(null);
      await svc.runPredictionSelfTest(sm);
      expect(svc.dialog?.text).toContain('no GPU device');
      sm.runStrokePredictionSelfTest.and.rejectWith(new Error('device lost'));
      await svc.runPredictionSelfTest(sm);
      expect(svc.dialog?.text).toContain('device lost');
      expect(svc.dialog?.busy).toBeFalse();
    });

    it('GPU info shows the whole diagnostics object, the key fields first', () => {
      const { svc } = makeService();
      const { sm } = makeEngine();
      svc.showGpuInfo(sm);
      const shown = JSON.parse(svc.dialog?.text ?? '{}');
      expect(Object.keys(shown).slice(0, 8)).toEqual(['tier', 'reasons', 'safeMode', 'caps', 'adapter', 'gpuName', 'canvas', 'lastLoss']);
      expect(shown.tier).toBe('mobile');
      expect(shown.canvas).toEqual({ width: 1600, height: 1000 });
      expect(shown.zzz).toBe('rest');
      svc.closeDialog();
      expect(svc.dialog).toBeNull();
    });

    it('Copy puts the dialog text on the clipboard', async () => {
      const { svc } = makeService();
      const { sm } = makeEngine();
      const write = spyOn(navigator.clipboard, 'writeText').and.resolveTo();
      svc.showGpuInfo(sm);
      await svc.copyDialog();
      expect(write).toHaveBeenCalledOnceWith(svc.dialog?.text ?? '');
      expect(svc.dialog?.copied).toBeTrue();
    });
  });

  describe('safe mode', () => {
    it('on: stores the Salsa flag and reloads', () => {
      const { svc, reload } = makeService();
      svc.toggleSafeMode(makeEngine().sm);
      expect(JSON.parse(localStorage.getItem(SALSA_SAFE_MODE_KEY) ?? 'null').manual).toBeTrue();
      expect(reload).toHaveBeenCalledOnceWith('https://app.test/illustrate/5?x=1');
    });

    it('off: clears the flag and the loss history, and reloads', () => {
      localStorage.setItem(SALSA_SAFE_MODE_KEY, '{"at":1}');
      localStorage.setItem(SALSA_LOSS_TIMES_KEY, '[1,2]');
      const { svc, reload } = makeService();
      svc.refresh(makeEngine().sm);
      expect(svc.safeMode).toBeTrue();
      svc.toggleSafeMode(makeEngine().sm);
      expect(localStorage.getItem(SALSA_SAFE_MODE_KEY)).toBeNull();
      expect(localStorage.getItem(SALSA_LOSS_TIMES_KEY)).toBeNull();
      expect(reload).toHaveBeenCalledOnceWith('https://app.test/illustrate/5?x=1');
    });

    it('off with ?salsaSafe=1 in the URL: takes the switch off the URL, keeps the other parameters', () => {
      const { svc, reload } = makeService('https://app.test/illustrate/5?x=1&salsaSafe=1');
      svc.refresh({});
      expect(svc.safeMode).toBeTrue();
      svc.toggleSafeMode({});
      expect(localStorage.getItem(SALSA_SAFE_MODE_KEY)).toBeNull();
      expect(reload).toHaveBeenCalledOnceWith('https://app.test/illustrate/5?x=1');
    });

    it('on with a stale ?salsaSafe=0 in the URL: drops it, so the stored flag is not cleared at start-up', () => {
      const { svc, reload } = makeService('https://app.test/illustrate/5?salsaSafe=0');
      svc.toggleSafeMode({});
      expect(localStorage.getItem(SALSA_SAFE_MODE_KEY)).not.toBeNull();
      expect(reload).toHaveBeenCalledOnceWith('https://app.test/illustrate/5');
    });

    it('reads "on" from the engine when the crash-loop guard tripped this session', () => {
      const { svc } = makeService();
      svc.refresh(makeEngine({ safeMode: true }).sm);
      expect(svc.safeMode).toBeTrue();
    });

    it('on with storage blocked: falls back to ?salsaSafe=1 for the next load', () => {
      const { svc, reload } = makeService();
      spyOn(Storage.prototype, 'setItem').and.throwError('blocked');
      svc.toggleSafeMode({});
      expect(reload).toHaveBeenCalledOnceWith('https://app.test/illustrate/5?x=1&salsaSafe=1');
    });

    it('does nothing when the reload is declined', () => {
      const { svc, confirm, reload } = makeService();
      confirm.and.returnValue(false);
      svc.toggleSafeMode({});
      expect(localStorage.getItem(SALSA_SAFE_MODE_KEY)).toBeNull();
      expect(reload).not.toHaveBeenCalled();
    });
  });
});
