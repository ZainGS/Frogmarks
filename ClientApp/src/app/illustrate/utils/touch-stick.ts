/**
 * Virtual-stick math for the Play touch overlay (mobile-parity TOUCH-4). Pure, unit-tested (touch-stick.spec.ts).
 */

/** Radial dead zone: |v| < dz → 0; else rescale (|v| − dz)/(1 − dz), clamped to 1, keeping the direction.
 *  (Same curve as Salsa's game/gamepad-input.ts radialDeadzone, which the package doesn't export.) */
export function radialDeadzone(x: number, y: number, dz: number): [number, number] {
  const m = Math.hypot(x, y);
  if (m <= dz || m < 1e-9) return [0, 0];
  const k = Math.min(1, (m - dz) / Math.max(1e-6, 1 - dz)) / m;
  return [x * k, y * k];
}

/** A finger offset (px from the stick centre, screen axes: +x right, +y DOWN) → the knob position clamped to the
 *  base radius, and the Play intent { forward, right } ∈ [-1, 1] (finger up = forward). */
export function stickFromOffset(dx: number, dy: number, radiusPx: number, deadzone = 0.12):
  { knobX: number; knobY: number; forward: number; right: number } {
  const r = Math.max(1, radiusPx);
  const m = Math.hypot(dx, dy);
  const s = m > r ? r / m : 1;
  const knobX = dx * s, knobY = dy * s;
  const [x, y] = radialDeadzone(knobX / r, knobY / r, deadzone);
  return { knobX, knobY, forward: y === 0 ? 0 : -y, right: x };
}
