/**
 * The mesh inspector's typed Transform fields. A number input's model is null (or a non-number) while the text is not
 * a number yet: a lone "-" while typing a negative, a cleared field, "1e". Applying that as 0 snapped the mesh to the
 * origin / flattened it mid-typing — only whole numbers are committed; blur puts the real value back.
 */

/** The field's number, or null while it isn't one. */
export function transformFieldValue(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** All three fields as numbers, or null when any isn't one (yet). `nonZero` (scale): a 0 also waits — it is what
 *  "0.5" passes through while typing, and a zero scale collapses the mesh. */
export function transformVec3(x: unknown, y: unknown, z: unknown, opts: { nonZero?: boolean } = {}): [number, number, number] | null {
  const v = [transformFieldValue(x), transformFieldValue(y), transformFieldValue(z)];
  if (v.some(n => n === null || (opts.nonZero && n === 0))) return null;
  return v as [number, number, number];
}
