// Converts all PNG stamps to WebP (lossless) and deletes the originals.
// Run once: node scripts/convert-stamps-to-webp.mjs
import sharp from 'sharp';
import { readdir, unlink } from 'fs/promises';
import { join, basename, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const stampsDir = join(__dirname, '..', 'src', 'assets', 'stamps');

async function convertDir(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      await convertDir(fullPath);
    } else if (entry.name.endsWith('.png')) {
      const webpPath = fullPath.replace(/\.png$/, '.webp');
      await sharp(fullPath).webp({ lossless: true, quality: 100 }).toFile(webpPath);
      await unlink(fullPath);
      const rel = fullPath.replace(stampsDir, 'stamps');
      console.log(`  ${basename(fullPath)} → ${basename(webpPath)}`);
    }
  }
}

console.log('Converting stamps PNG → WebP (lossless)…');
await convertDir(stampsDir);
console.log('Done. Update stamp paths in board.component.ts and illustration.component.ts (.png → .webp).');
