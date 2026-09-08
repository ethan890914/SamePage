/* global Vision */
// A classic worker keeps synchronous segmentation off the UI thread and supports
// MediaPipe's importScripts-based WASM loader. Assets are served by this app.
let busy = false;
self.onmessage = async ({ data }) => {
  if (
    busy ||
    data?.type !== 'process' ||
    !Array.isArray(data.photos) ||
    data.photos.length !== 8
  )
    return;
  busy = true;
  let segmenter;
  try {
    if (typeof OffscreenCanvas === 'undefined')
      throw new Error('offscreen_canvas_unavailable');
    importScripts('/vendor/mediapipe/vision_bundle.js');
    const files = await Vision.FilesetResolver.forVisionTasks(
      new URL('/vendor/mediapipe/wasm', self.location.origin).href,
    );
    segmenter = await Vision.ImageSegmenter.createFromOptions(files, {
      baseOptions: {
        modelAssetPath: new URL(
          '/models/selfie-segmenter.tflite',
          self.location.origin,
        ).href,
        delegate: 'CPU',
      },
      runningMode: 'IMAGE',
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    });
    const labels = segmenter.getLabels();
    const results = [];
    for (let index = 0; index < data.photos.length; index++) {
      const url = data.photos[index];
      if (
        typeof url !== 'string' ||
        !url.startsWith('data:image/jpeg;base64,') ||
        url.length > 1_000_000
      )
        throw new Error('invalid_photo');
      const bitmap = await createImageBitmap(await (await fetch(url)).blob());
      try {
        const canvas = new OffscreenCanvas(600, 600);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('canvas_unavailable');
        ctx.drawImage(bitmap, 0, 0, 600, 600);
        segmenter.segment(bitmap, (result) => {
          const masks = result.confidenceMasks;
          const personIndex = labels.indexOf('person');
          const mask =
            masks?.[
              personIndex >= 0 ? personIndex : masks.length === 1 ? 0 : 1
            ];
          if (!mask) throw new Error('person_mask_unavailable');
          const values = mask.getAsFloat32Array();
          const alpha = new ImageData(mask.width, mask.height);
          let foreground = 0;
          for (let p = 0; p < values.length; p++) {
            const confidence = Number.isFinite(values[p]) ? values[p] : 0;
            const t = Math.min(1, Math.max(0, (confidence - 0.25) / 0.5));
            const opacity = t * t * (3 - 2 * t);
            alpha.data[p * 4 + 3] = Math.round(opacity * 255);
            foreground += opacity;
          }
          // Do not replace originals with an empty cutout if detection failed.
          if (foreground / values.length < 0.01)
            throw new Error('person_not_found');
          const matte = new OffscreenCanvas(mask.width, mask.height);
          matte.getContext('2d').putImageData(alpha, 0, 0);
          ctx.globalCompositeOperation = 'destination-in';
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(matte, 0, 0, 600, 600);
        });
        results.push(await canvas.convertToBlob({ type: 'image/png' }));
      } finally {
        bitmap.close();
      }
      self.postMessage({ type: 'progress', completed: index + 1 });
    }
    self.postMessage({ type: 'complete', photos: results });
  } catch {
    self.postMessage({ type: 'failed' });
  } finally {
    segmenter?.close();
    self.close();
  }
};
