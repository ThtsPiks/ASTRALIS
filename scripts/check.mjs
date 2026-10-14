// Portable syntax and packaged-resource check. Does not launch the game.
import { readdir, readFile, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { root } from './stage-web.mjs';

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const groups = await Promise.all(entries.map(e => e.isDirectory()
    ? walk(path.join(directory, e.name)) : [path.join(directory, e.name)]));
  return groups.flat();
}
const files = (await Promise.all(['src', 'vendor', 'electron', 'scripts'].map(d => walk(path.join(root, d))))).flat();
let failed = 0;
let checked = 0;
for (const file of files.filter(f => /\.(m?js)$/.test(f))) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  checked++;
  if (result.status !== 0) { console.error(path.relative(root, file), result.stderr); failed++; }
}
const exists = async file => stat(file).then(s => s.isFile()).catch(() => false);
const requirements = new Set();
for (const file of files.filter(f => f.endsWith('.js'))) {
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/(?:from\s*|import\s*\(\s*)['"](\.[^'"]+)['"]/g)) {
    requirements.add(path.resolve(path.dirname(file), match[1].split('?')[0]));
  }
  for (const match of source.matchAll(/['"]((?:models|guide|ui)\/[\w./-]+\.(?:glb|jpg|png))(?:\?[^'"]*)?['"]/g)) {
    requirements.add(path.join(root, match[1]));
  }
}
const fonts = await readFile(path.join(root, 'vendor/fonts.css'), 'utf8');
for (const match of fonts.matchAll(/url\(['"]?([^)'"\s]+)/g)) requirements.add(path.join(root, 'vendor', match[1]));
for (const file of requirements) {
  if (!await exists(file)) { console.error(`Missing resource: ${path.relative(root, file)}`); failed++; }
}
for (const file of await walk(path.join(root, 'models'))) {
  if (file.endsWith('.glb') && (await readFile(file)).subarray(0, 4).toString() !== 'glTF') {
    console.error(`Missing Git LFS content: ${path.basename(file)}`); failed++;
  }
}
if (failed) process.exit(1);
console.log(`OK: ${checked} JavaScript files; ${requirements.size} local imports/resources; Git LFS models.`);
