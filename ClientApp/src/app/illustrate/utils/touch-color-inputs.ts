/**
 * Touch / pen taps on a native colour input (`<input type="color">`) apply the current picker colour instead of
 * opening the platform dialog. Android's dialog only offers preset swatches, so an exact colour can't be picked
 * there; with this a tap copies the colour from the persistent colour picker (ring / square / hex) into the input.
 * Mouse clicks still open the normal desktop picker.
 *
 * The input gets the new value plus bubbling `input` and `change` events, so `(input)`, `(change)` and `ngModel`
 * bindings all see it exactly as if the user had picked it. Returns the uninstall function.
 */
export function installTouchColorInputs(getColor: () => string | null | undefined, doc: Document = document): () => void {
  let lastPointer = '';
  let lastPointerAt = 0;
  const onPointerDown = (e: PointerEvent): void => { lastPointer = e.pointerType; lastPointerAt = e.timeStamp; };
  const onClick = (e: MouseEvent): void => {
    const input = e.target as HTMLInputElement | null;
    if (!input || input.tagName !== 'INPUT' || input.type !== 'color' || input.disabled) return;
    // a click within 1.5 s of a touch / pen press (label taps forward a synthetic click to the input)
    if ((lastPointer !== 'touch' && lastPointer !== 'pen') || e.timeStamp - lastPointerAt > 1500) return;
    const hex = toColorInputHex(getColor());
    if (!hex) return;
    e.preventDefault(); // no platform dialog
    if (input.value.toLowerCase() === hex) return;
    input.value = hex;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };
  doc.addEventListener('pointerdown', onPointerDown, true);
  doc.addEventListener('click', onClick, true);
  return () => {
    doc.removeEventListener('pointerdown', onPointerDown, true);
    doc.removeEventListener('click', onClick, true);
  };
}

/** `#rgb` / `#rrggbb` / `#rrggbbaa` (any case) → the `#rrggbb` lowercase form a colour input holds; else null. */
export function toColorInputHex(c: string | null | undefined): string | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec((c ?? '').trim());
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
  return '#' + h.slice(0, 6);
}
