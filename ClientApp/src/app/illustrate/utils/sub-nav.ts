/**
 * One level of drill-down navigation in a big panel (City, Edit Character): a menu of buttons, each opening a view
 * with only that group's controls, and a Back button. `id` null = the menu. Templates show a group with
 * `*ngIf="nav.id === 'brows'"` and open it with `(click)="nav.open('brows', 'Brows')"`.
 */
export class SubNav {
  id: string | null = null;
  label = '';

  /** `onChange` runs after every open / close (the panels use it to scroll back to the top). */
  constructor(private onChange?: () => void) {}

  open(id: string, label: string): void {
    this.id = id;
    this.label = label;
    this.onChange?.();
  }

  close(): void {
    if (this.id === null) return;
    this.reset();
    this.onChange?.();
  }

  /** Back to the menu without the change callback (used when a parent level changes). */
  reset(): void {
    this.id = null;
    this.label = '';
  }
}

/**
 * Nested drill-down levels (Face › Eyes › Happy › Iris). `levels[0]` is the first level inside a section; opening a
 * level resets every deeper one; `back()` closes the deepest open level (false = nothing was open, so the caller
 * leaves the section). Templates use the panel's per-level getters (`cp.sub`, `cp.sub2`, …).
 */
export class NavStack {
  readonly levels: SubNav[];

  constructor(depth: number, onChange?: () => void) {
    this.levels = [];
    for (let i = 0; i < depth; i++) {
      this.levels.push(new SubNav(() => {
        for (const deeper of this.levels.slice(i + 1)) deeper.reset();
        onChange?.();
      }));
    }
  }

  /** Labels of the open levels, outermost first (the breadcrumb). */
  get crumbs(): string[] {
    const out: string[] = [];
    for (const l of this.levels) { if (!l.id) break; out.push(l.label); }
    return out;
  }

  back(): boolean {
    for (let i = this.levels.length - 1; i >= 0; i--) {
      if (this.levels[i].id) { this.levels[i].close(); return true; }
    }
    return false;
  }

  reset(): void { for (const l of this.levels) l.reset(); }
}

/** Scroll the nearest scrollable ancestor of `el` back to the top (a new view should not open half-scrolled). */
export function scrollPanelToTop(el: HTMLElement | null | undefined): void {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) { p.scrollTop = 0; return; }
  }
}
