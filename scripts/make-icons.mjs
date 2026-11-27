// Renders the app icon (a white rupee mark on the primary emerald) to the PNG sizes the manifest names,
// and writes src/app/icon.svg, the same mark for the browser tab.
// Run with: node scripts/make-icons.mjs   (uses sharp, a dev dependency)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PRIMARY = '#047857'; // --color-primary in src/app/globals.css

// The rupee sign drawn as strokes on a 512 grid, centred on (256, 256).
const MARK =
  'M170 140 H342 M170 208 H342 M190 140 H232 C326 140 326 276 232 276 H190 L330 396';

function svg({ scale, rounded }) {
  // Scale around the centre, then nudge up so the mark's bounding box (y 122..414) sits on the middle.
  const t = `translate(256 256) scale(${scale}) translate(-256 -${256 + 12})`;
  const bg = rounded
    ? `<rect width="512" height="512" rx="112" fill="${PRIMARY}"/>`
    : `<rect width="512" height="512" fill="${PRIMARY}"/>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">` +
    `${bg}<g transform="${t}"><path d="${MARK}" fill="none" stroke="#ffffff" stroke-width="36" ` +
    `stroke-linecap="round" stroke-linejoin="round"/></g></svg>`
  );
}

const any = svg({ scale: 1.2, rounded: true });
// The mark stays well inside the central 80% safe zone of a maskable icon.
const maskable = svg({ scale: 1, rounded: false });

mkdirSync(join(root, 'public', 'icons'), { recursive: true });
writeFileSync(join(root, 'src', 'app', 'icon.svg'), any + '\n');
await sharp(Buffer.from(any)).resize(192, 192).png().toFile(join(root, 'public', 'icons', 'icon-192.png'));
await sharp(Buffer.from(any)).resize(512, 512).png().toFile(join(root, 'public', 'icons', 'icon-512.png'));
await sharp(Buffer.from(maskable)).resize(512, 512).png().toFile(join(root, 'public', 'icons', 'icon-maskable-512.png'));
console.log('icons written');
