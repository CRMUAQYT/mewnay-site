// Converts the app screens captured by Mewnay-app/mobile/store-screens/video/render.js
// (its VIDEO_CACHE folder) into the WebP textures the site loads:
//   node tools/textures.mjs <video-cache-dir>
// Needs ffmpeg on PATH.
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cache = process.argv[2];
if (!cache) throw new Error('usage: node tools/textures.mjs <video-cache-dir>');
for (const lang of ['ru', 'kk', 'en']) {
  const from = join(cache, lang);
  const to = join(root, 'assets', 'tex', lang);
  mkdirSync(to, { recursive: true });
  copyFileSync(join(from, 'meta.json'), join(to, 'meta.json'));
  for (const file of readdirSync(from).filter((f) => f.endsWith('.png') && f !== 'card-night.png')) {
    const big = ['app', 'home', 'lock'].includes(file.replace('.png', ''));
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(from, file), '-vf', `scale=iw*${big ? '2/3' : '2/3'}:-1:flags=lanczos`, '-c:v', 'libwebp', '-quality', big ? '84' : '88', '-compression_level', '6', join(to, file.replace('.png', '.webp'))]);
  }
  console.log(lang, readdirSync(to).length, 'files');
}
