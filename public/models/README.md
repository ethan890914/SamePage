# Photo booth segmentation model

`selfie-segmenter.tflite` is Google's MediaPipe SelfieSegmenter square model
(256 × 256, float16), downloaded from the official model distribution:

https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite

SHA-256: `191ac9529ae506ee0beefa6b2c945a172dab9d07d1e802a290a4e4038226658b`

Model information: https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter

The runtime is pinned to `@mediapipe/tasks-vision@1.0.1` (Apache-2.0) in the
package lockfile. `scripts/prepare-booth-vision.mjs` copies its browser bundle
and WASM assets into the public directory before development and builds.
