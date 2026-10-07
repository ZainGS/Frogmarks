/**
 * CSS custom properties on <html> owned by mounted components (the mode chrome's --fm-modebar-h / --fm-modestrip-w /
 * --fm-modeprops-w). Each owner sets its own value; the most recently set owner's value is the one applied, and
 * releasing an owner restores the previous one (or removes the property). So two header bars swapping in one change
 * detection (Edit Mesh → Armature) never leave the property missing or stale, whatever order Angular creates and
 * destroys them in.
 */
const stacks = new Map<string, { owner: object; value: string }[]>();

function apply(name: string): void {
  if (typeof document === 'undefined') return;
  const st = stacks.get(name);
  const style = document.documentElement.style;
  if (st && st.length) style.setProperty(name, st[st.length - 1].value);
  else style.removeProperty(name);
}

/** Set (or update) `owner`'s value for `name`. */
export function setRootVar(name: string, owner: object, value: string): void {
  let st = stacks.get(name);
  if (!st) { st = []; stacks.set(name, st); }
  const cur = st.find(e => e.owner === owner);
  if (cur) cur.value = value; else st.push({ owner, value });
  apply(name);
}

/** Drop `owner`'s value for `name` (safe when it has none). */
export function releaseRootVar(name: string, owner: object): void {
  const st = stacks.get(name);
  if (!st) return;
  const i = st.findIndex(e => e.owner === owner);
  if (i < 0) return;
  st.splice(i, 1);
  if (!st.length) stacks.delete(name);
  apply(name);
}

/** The value currently applied for `name` (specs). */
export function rootVarValue(name: string): string {
  return typeof document === 'undefined' ? '' : document.documentElement.style.getPropertyValue(name);
}
