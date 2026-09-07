import { readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'Interactive script exists');
new vm.Script(script);
// Exercise the actual simulation transitions without running a browser.
const element = {
  setAttribute() {},
  addEventListener() {},
  focus() {},
  classList: { add() {} },
  querySelector() {
    return element;
  },
};
const context = vm.createContext({
  document: {
    getElementById() {
      return element;
    },
    querySelector() {
      return element;
    },
    querySelectorAll() {
      return [];
    },
  },
});
vm.runInContext(script, context);
vm.runInContext(
  `
  action('connect'); action('push');
  if (client !== 1 || !connected) throw Error('Connected push failed');
  action('connect'); action('push');
  if (client !== 1 || server !== 2) throw Error('Offline isolation failed');
  action('connect');
  if (client !== 2) throw Error('Reconnect snapshot failed');
  reset(); mode='poll'; action('push');
  if (client !== 0) throw Error('Polling updated without a request');
  action('poll'); if (client !== 1) throw Error('Poll did not synchronize');
  selectTab(1); action('alice'); action('bob');
  if (!logs[0].message.includes('activity_started')) throw Error('Ready coordination failed');
  reset(); bobRoom='B'; action('alice'); action('bob');
  if (logs.some(e=>e.message.includes('activity_started'))) throw Error('Room isolation failed');
  action('offline'); const before=ready.Bob; action('bob');
  if (ready.Bob !== before) throw Error('Offline action accepted');
  selectTab(2); action('increment'); action('save'); action('increment'); action('sleep');
  if (memory !== null || saved !== 1) throw Error('Hibernation failed');
  action('wake');
  if (memory !== 1 || wakes !== 2 || sleeping) throw Error('Storage restoration failed');
`,
  context,
);
mkdirSync(new URL('./dist/', import.meta.url), { recursive: true });
copyFileSync(
  new URL('./index.html', import.meta.url),
  new URL('./dist/index.html', import.meta.url),
);
console.log(
  'Static build complete. Connection, polling, room isolation, and storage recovery checks passed.',
);
