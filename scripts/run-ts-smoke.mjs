import { build } from 'esbuild';
import { unlink } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const entryPoint = process.argv[2];
if (!entryPoint) throw new Error('Pass a smoke-test entry point.');

const outfile = `/tmp/same-page-${process.pid}-${Date.now()}.mjs`;
try {
  await build({
    entryPoints: [entryPoint],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node22',
    logLevel: 'warning',
  });
  await import(pathToFileURL(outfile).href);
} finally {
  await unlink(outfile).catch(() => undefined);
}
