/**
 * The Shell's keyboard path (UI review 2026-10-07 §3 #25). The Shell is one WebGPU canvas: nothing on it can take
 * keyboard focus, so there was no keyboard way into Illustrator or Settings. StudioComponent renders these items as
 * real buttons in a strip that stays hidden until it holds focus (Tab from the top of the page shows it); they are
 * also what a screen reader reads (they replace the old offscreen, non-interactive ARIA list).
 */

export type ShellKeyAction =
  | { type: 'system'; id: string; systemKey?: string }
  | { type: 'import' }
  /** The cart's sheet (Play / Remove). */
  | { type: 'cart'; id: string }
  /** Play the cart (the Shell's launch → the Player). */
  | { type: 'cart-play'; id: string }
  | { type: 'back' }
  | { type: 'new' }
  | { type: 'project'; id: string };

export interface ShellKeyItem {
  /** Stable key (ngFor identity). */
  key: string;
  label: string;
  action: ShellKeyAction;
}

export interface ShellKeySlot { id: string; name?: string; type?: string; systemKey?: string }
export interface ShellKeyProject { id: string; name?: string }

export interface ShellKeyInput {
  mode: 'shell' | 'illustrations' | string;
  dashboardKind?: 'illustration' | 'packaging' | string;
  slots: readonly ShellKeySlot[];
  projects: readonly ShellKeyProject[];
  /** The engine can open the .frogcart picker from a button (newer Salsa builds). Default true. */
  canImport?: boolean;
  /** The engine can launch carts (Salsa shell.launchSupported): each cart gets Play + Options. Default true. */
  canPlay?: boolean;
}

/** The buttons for the current Shell view, in the order the Shell shows its tiles / chips / cards. */
export function shellKeyItems(s: ShellKeyInput): ShellKeyItem[] {
  if (s.mode === 'illustrations') {
    const pkg = s.dashboardKind === 'packaging';
    return [
      { key: 'back', label: '‹ Back to home', action: { type: 'back' } },
      { key: 'new', label: pkg ? '+ New Product Packaging' : '+ New Project', action: { type: 'new' } },
      ...s.projects.map(p => ({ key: 'p:' + p.id, label: 'Open “' + (p.name || 'Untitled') + '”', action: { type: 'project' as const, id: p.id } })),
    ];
  }
  const out: ShellKeyItem[] = [];
  s.slots.forEach((slot, i) => {
    if (slot.type === 'system') {
      out.push({ key: 's:' + slot.id, label: slot.name || slot.id, action: { type: 'system', id: slot.id, systemKey: slot.systemKey } });
    } else {
      const name = slot.name || 'Untitled';
      if (s.canPlay !== false) {
        out.push({ key: 'c:' + slot.id, label: 'Play “' + name + '”', action: { type: 'cart-play', id: slot.id } });
        out.push({ key: 'co:' + slot.id, label: 'Options for “' + name + '”', action: { type: 'cart', id: slot.id } });
      } else {
        out.push({ key: 'c:' + slot.id, label: 'Cart: ' + name, action: { type: 'cart', id: slot.id } });
      }
    }
    // The Shell puts its Import tile right after the first app (Illustrator).
    if (i === 0 && s.canImport !== false) out.push({ key: 'import', label: 'Import a FrogCart…', action: { type: 'import' } });
  });
  if (!s.slots.length && s.canImport !== false) out.push({ key: 'import', label: 'Import a FrogCart…', action: { type: 'import' } });
  return out;
}

/** Same ids + labels → the same strip (no change detection needed). */
export function shellKeySignature(items: readonly ShellKeyItem[]): string {
  return items.map(i => i.key + '\u0001' + i.label).join('\u0002');
}
