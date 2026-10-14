// One shared asset list for the native macOS and Windows builds.
import { cp, mkdir, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
const ignored = new Set(['.DS_Store', 'Thumbs.db', '__pycache__']);

export async function stageWeb(destination) {
  const manifest = JSON.parse(await readFile(new URL('./web-assets.json', import.meta.url), 'utf8'));
  for (const name of await readdir(path.join(root, 'models'))) {
    if (!name.endsWith('.glb')) continue;
    const model = await readFile(path.join(root, 'models', name));
    if (model.subarray(0, 4).toString() !== 'glTF') {
      throw new Error(`Missing model data: ${name}. Run git lfs install && git lfs pull.`);
    }
  }
  await mkdir(destination, { recursive: true });
  for (const entry of [...manifest.files, ...manifest.directories]) {
    await cp(path.join(root, entry), path.join(destination, entry), {
      recursive: true,
      filter: source => !ignored.has(path.basename(source)) && !source.endsWith('.pyc'),
    });
  }
  console.log(`Game resources staged in ${destination}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/stage-web.mjs <output-directory>');
  await stageWeb(path.resolve(process.argv[2]));
}
