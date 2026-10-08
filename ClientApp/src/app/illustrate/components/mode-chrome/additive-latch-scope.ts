/**
 * The engine's additive-select latch (sm.setAdditiveSelect3D) is shared by the modes that turn it on for touch / pen:
 * Edit Mesh (on while its chrome is mounted on a touch device) and the Armature (set per press). On a direct switch
 * between them both are mounted for a moment, in either order, so each one saving "the latch before me" and putting it
 * back on leave restored the OTHER mode's value — the latch could stay on after leaving every mode. Here the first
 * owner records the latch as it was, the owners set it freely, and the last one to leave puts that value back.
 */
type LatchApi = { setAdditiveSelect3D?(on: boolean): void; getAdditiveSelect3D?(): boolean };

interface LatchScope { owners: Set<object>; baseline: boolean }

const scopes = new WeakMap<object, LatchScope>();

/** Join the latch scope on `sm` (an engine without the latch: false, nothing to do). Idempotent per owner. */
export function acquireAdditiveLatch(sm: object | null | undefined, owner: object): boolean {
  const api = sm as LatchApi | null | undefined;
  if (!sm || typeof api?.setAdditiveSelect3D !== 'function') return false;
  let s = scopes.get(sm);
  if (!s) {
    s = { owners: new Set(), baseline: !!api.getAdditiveSelect3D?.() };
    scopes.set(sm, s);
  }
  s.owners.add(owner);
  return true;
}

/** Leave the scope; the last owner out puts the latch back as it was before the first one joined. */
export function releaseAdditiveLatch(sm: object | null | undefined, owner: object): void {
  const s = sm ? scopes.get(sm) : undefined;
  if (!sm || !s || !s.owners.delete(owner)) return;
  if (s.owners.size > 0) return;
  scopes.delete(sm);
  (sm as LatchApi).setAdditiveSelect3D?.(s.baseline);
}

/** How many modes hold the latch on `sm` (tests / leak checks). */
export function additiveLatchOwners(sm: object | null | undefined): number {
  return (sm && scopes.get(sm)?.owners.size) || 0;
}
