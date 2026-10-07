import { installShellEscapeGuard } from './shell-escape-guard';

describe('installShellEscapeGuard (a dialog Escape must not reach the Shell window listener)', () => {
  let target: HTMLElement;
  let extra: HTMLElement[];
  let reachedWindow: string[];
  let onWindowKey: (e: KeyboardEvent) => void;
  let uninstall: () => void;
  let hostOpen: boolean;
  let hostClosed: number;

  beforeEach(() => {
    target = document.createElement('div');
    document.body.appendChild(target);
    extra = [];
    reachedWindow = [];
    hostOpen = false;
    hostClosed = 0;
    onWindowKey = (e: KeyboardEvent) => reachedWindow.push(e.key);
    window.addEventListener('keydown', onWindowKey);
    uninstall = installShellEscapeGuard(document, {
      hostModalOpen: () => hostOpen,
      closeHostModal: () => { hostClosed++; hostOpen = false; },
    });
  });

  afterEach(() => {
    uninstall();
    window.removeEventListener('keydown', onWindowKey);
    target.remove();
    for (const el of extra) el.remove();
  });

  const press = (key = 'Escape', from: HTMLElement = target) => {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    from.dispatchEvent(e);
    return e;
  };

  it('lets a plain Escape through when nothing modal is open (the Shell grid → home still works)', () => {
    press();
    expect(reachedWindow).toEqual(['Escape']);
  });

  it('stops an Escape a dialog consumed (defaultPrevented)', () => {
    const consume = (e: Event) => e.preventDefault();
    document.body.addEventListener('keydown', consume);   // where the CDK overlay keyboard dispatcher listens
    try { press(); } finally { document.body.removeEventListener('keydown', consume); }
    expect(reachedWindow).toEqual([]);
  });

  it('stops any Escape while a modal (aria-modal / CDK backdrop) is open', () => {
    const dlg = document.createElement('div');
    dlg.setAttribute('aria-modal', 'true');
    document.body.appendChild(dlg); extra.push(dlg);
    press();
    expect(reachedWindow).toEqual([]);
    dlg.removeAttribute('aria-modal');
    dlg.className = 'cdk-overlay-backdrop cdk-overlay-backdrop-showing';
    press();
    expect(reachedWindow).toEqual([]);
  });

  it('closes the host modal on Escape and consumes it', () => {
    hostOpen = true;
    const e = press();
    expect(hostClosed).toBe(1);
    expect(e.defaultPrevented).toBeTrue();
    expect(reachedWindow).toEqual([]);
  });

  it('other keys pass; uninstall removes the guard', () => {
    press('a');
    expect(reachedWindow).toEqual(['a']);
    hostOpen = true;
    uninstall();
    uninstall = () => {};
    press();
    expect(hostClosed).toBe(0);
    expect(reachedWindow).toEqual(['a', 'Escape']);
  });
});
