#!/usr/bin/env node
// Generates the web app manifest icons (src/manifest.webmanifest) from the brand icon in src/assets/favicon:
//   src/assets/icons/icon-192.png, icon-512.png            purpose "any": the round purple "f" on transparency
//   src/assets/icons/icon-maskable-192.png, -512.png       purpose "maskable": full-bleed purple square, the "f"
//                                                           scaled into the 80 % safe zone (Android crops it to its
//                                                           launcher shape: circle / squircle / rounded square)
// The PNGs are committed; re-run only when the source icon changes: `node scripts/generate-pwa-icons.mjs`.
// Uses sharp (a devDependency).
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const SRC = 'src/assets/favicon/android-chrome-512x512.png';
const OUT = 'src/assets/icons';
/** The brand purple of the source circle (sampled: rgb(170, 85, 255)). */
const PURPLE = { r: 170, g: 85, b: 255, alpha: 1 };
/** Maskable: the source circle is drawn at this fraction of the icon. The glyph reaches 0.34 of the source size from
 *  the centre, so at 0.88 it stays within 0.30 — well inside the 0.40 safe-zone radius the spec guarantees. The
 *  circle's own edge (purple on purple) is invisible. */
const MASKABLE_SCALE = 0.88;

mkdirSync(OUT, { recursive: true });

for (const size of [192, 512]) {
  await sharp(SRC).resize(size, size, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(`${OUT}/icon-${size}.png`);

  const inner = Math.round(size * MASKABLE_SCALE);
  // Flatten onto purple BEFORE resizing: resizing the transparent original leaves a dark fringe on the circle's edge.
  const glyph = await sharp(SRC).flatten({ background: PURPLE }).resize(inner, inner, { kernel: 'lanczos3' }).png().toBuffer();
  const off = Math.round((size - inner) / 2);
  await sharp({ create: { width: size, height: size, channels: 4, background: PURPLE } })
    .composite([{ input: glyph, left: off, top: off }])
    .flatten({ background: PURPLE })
    .png({ compressionLevel: 9 })
    .toFile(`${OUT}/icon-maskable-${size}.png`);
  console.log(`icons: ${size}px any + maskable`);
}
