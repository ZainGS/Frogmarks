/**
 * The Shell's keyboard path (UI review 2026-10-07 §3 #25). The Shell is one WebGPU canvas: nothing on it can take
 * keyboard focus, so there was no keyboard way into Illustrator or Settings. StudioComponent renders these items as
 * real buttons in a strip that stays hidden until it holds focus (Tab from the top of the page shows it); they are
 * also what a screen reader reads (they replace the old offscreen, non-interactive ARIA list).
 */

export type ShellKeyAction =
  | { type: 'system'; id: string; systemKey?: string }
  | { type: 'import' }
  | { type: 'cart'; id: string }
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
      out.push({ key: 'c:' + slot.id, label: 'Cart: ' + (slot.name || 'Untitled'), action: { type: 'cart', id: slot.id } });
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
