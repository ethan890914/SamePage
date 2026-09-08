import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(
  new URL('../public/booth-background-worker.js', import.meta.url),
  'utf8',
);

function harness({ failAt = -1, emptyMask = false, unsupported = false } = {}) {
  const messages = [],
    masks = [];
  let bitmapClosed = 0,
    modelClosed = false,
    workerClosed = false,
    calls = 0;
  const segmenter = {
    getLabels: () => ['background', 'person'],
    segment(bitmap, callback) {
      if (calls++ === failAt) throw new Error('simulated inference failure');
      callback({
        confidenceMasks: [
          null,
          {
            width: 2,
            height: 1,
            getAsFloat32Array: () =>
              new Float32Array(emptyMask ? [0, 0] : [0, 1]),
          },
        ],
      });
    },
    close() {
      modelClosed = true;
    },
  };
  class Canvas {
    getContext() {
      return {
        drawImage() {},
        putImageData(image) {
          masks.push([...image.data]);
        },
      };
    }
    async convertToBlob() {
      return new Blob(['transparent portrait'], { type: 'image/png' });
    }
  }
  const self = {
    location: { origin: 'https://booth.example' },
    postMessage(message) {
      messages.push(message);
    },
    close() {
      workerClosed = true;
    },
  };
  const context = vm.createContext({
    self,
    URL,
    Blob,
    Float32Array,
    OffscreenCanvas: unsupported ? undefined : Canvas,
    ImageData: class {
      constructor(w, h) {
        this.data = new Uint8ClampedArray(w * h * 4);
      }
    },
    importScripts(url) {
      assert.equal(url, '/vendor/mediapipe/vision_bundle.js');
    },
    Vision: {
      FilesetResolver: {
        async forVisionTasks(url) {
          assert.equal(url, 'https://booth.example/vendor/mediapipe/wasm');
          return {};
        },
      },
      ImageSegmenter: {
        async createFromOptions(files, options) {
          assert.equal(options.runningMode, 'IMAGE');
          assert.equal(options.baseOptions.delegate, 'CPU');
          assert.equal(
            options.baseOptions.modelAssetPath,
            'https://booth.example/models/selfie-segmenter.tflite',
          );
          return segmenter;
        },
      },
    },
    async fetch(url) {
      assert.match(url, /^data:image\/jpeg;base64,/);
      return {
        async blob() {
          return new Blob(['original']);
        },
      };
    },
    async createImageBitmap() {
      return {
        close() {
          bitmapClosed++;
        },
      };
    },
  });
  vm.runInContext(source, context);
  return {
    self,
    messages,
    masks,
    counters: () => ({ bitmapClosed, modelClosed, workerClosed }),
  };
}

test('all eight portraits finish before publishing, with transparent backgrounds and untouched originals', async () => {
  const h = harness();
  const originals = Array.from(
    { length: 8 },
    (_, i) => `data:image/jpeg;base64,original${i}`,
  );
  const before = [...originals];
  await h.self.onmessage({ data: { type: 'process', photos: originals } });
  assert.deepEqual(originals, before);
  assert.deepEqual(
    h.messages.filter((m) => m.type === 'progress').map((m) => m.completed),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
  const complete = h.messages.at(-1);
  assert.equal(complete.type, 'complete');
  assert.equal(complete.photos.length, 8);
  assert.ok(complete.photos.every((p) => p.type === 'image/png'));
  assert.ok(h.masks.every((mask) => mask[3] === 0 && mask[7] === 255));
  assert.deepEqual(h.counters(), {
    bitmapClosed: 8,
    modelClosed: true,
    workerClosed: true,
  });
});

test('an inference failure never publishes a partially processed strip', async () => {
  const h = harness({ failAt: 3 });
  await h.self.onmessage({
    data: {
      type: 'process',
      photos: Array(8).fill('data:image/jpeg;base64,test'),
    },
  });
  assert.equal(h.messages.at(-1).type, 'failed');
  assert.equal(
    h.messages.some((m) => m.type === 'complete'),
    false,
  );
  assert.deepEqual(h.counters(), {
    bitmapClosed: 4,
    modelClosed: true,
    workerClosed: true,
  });
});

test('empty person masks and unsupported browsers report failure for original fallback', async () => {
  for (const options of [{ emptyMask: true }, { unsupported: true }]) {
    const h = harness(options);
    await h.self.onmessage({
      data: {
        type: 'process',
        photos: Array(8).fill('data:image/jpeg;base64,test'),
      },
    });
    assert.equal(h.messages.at(-1).type, 'failed');
    assert.equal(
      h.messages.some((m) => m.type === 'complete'),
      false,
    );
    assert.equal(h.counters().workerClosed, true);
  }
});

test('the vendored model is a TensorFlow Lite binary', async () => {
  const model = await readFile(
    new URL('../public/models/selfie-segmenter.tflite', import.meta.url),
  );
  assert.equal(model.subarray(4, 8).toString(), 'TFL3');
});
