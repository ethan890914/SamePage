import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const source = fileURLToPath(
  new URL('../node_modules/@mediapipe/tasks-vision/', import.meta.url),
);
const target = fileURLToPath(
  new URL('../public/vendor/mediapipe/', import.meta.url),
);
await mkdir(join(target, 'wasm'), { recursive: true });
await copyFile(
  join(source, 'vision_bundle.js'),
  join(target, 'vision_bundle.js'),
);
for (const name of await readdir(join(source, 'wasm'))) {
  if (name.endsWith('.js') || name.endsWith('.wasm'))
    await copyFile(join(source, 'wasm', name), join(target, 'wasm', name));
}
