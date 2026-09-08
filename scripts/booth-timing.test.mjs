import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
const source = await readFile(
  new URL('../lib/photo-booth.ts', import.meta.url),
  'utf8',
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
});
const { shotTime, takeDuration } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);
for (const seconds of [10, 12, 15]) {
  test(`${seconds}-second countdown applies to all four photos and capture lock`, () => {
    const times = [0, 1, 2, 3].map((i) => shotTime(1000, i, seconds));
    assert.equal(times[0], 1000 + seconds * 1000);
    for (let i = 1; i < 4; i++)
      assert.equal(times[i] - times[i - 1], (seconds + 1) * 1000);
    assert.equal(takeDuration(seconds), times[3]);
  });
}
