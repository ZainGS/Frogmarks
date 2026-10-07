import { NotifyService, TOAST_DURATION_MS, toastConfig } from './notify.service';

/** UI review 2026-10-07 §3.6: error toasts looked exactly like success toasts and vanished faster (2 s). */
describe('NotifyService toast kinds', () => {
  it('an error toast has its own class, stays longer than a success and is announced assertively', () => {
    const err = toastConfig('error');
    const ok = toastConfig('success');
    expect(err.panelClass).toContain('fm-toast--error');
    expect(ok.panelClass).toContain('fm-toast--success');
    expect(err.duration!).toBeGreaterThan(ok.duration!);
    expect(err.duration).toBe(TOAST_DURATION_MS.error);
    expect(err.politeness).toBe('assertive');
    expect(ok.politeness).toBe('polite');
  });

  it('error() opens a red, long toast with the given action; success() a success toast', () => {
    const open = jasmine.createSpy('open').and.returnValue({ onAction: () => ({ subscribe() {} }) });
    const svc = new NotifyService({ open } as any);
    svc.error('Nope', 'Retry');
    expect(open).toHaveBeenCalledWith('Nope', 'Retry', jasmine.objectContaining({ duration: TOAST_DURATION_MS.error }));
    expect(open.calls.mostRecent().args[2].panelClass).toContain('fm-toast--error');
    svc.success('Yes');
    expect(open.calls.mostRecent().args[2].panelClass).toContain('fm-toast--success');
  });
});
