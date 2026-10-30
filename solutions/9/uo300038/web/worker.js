import { pipeline, env, RawImage } from '@huggingface/transformers';
import { MODEL_ID, MODEL_REVISION, MODEL_DTYPE, INFERENCE_THRESHOLD } from './config.mjs';

env.allowLocalModels = false;
// GitHub Pages no necesita cabeceras de aislamiento para un único hilo WASM.
env.backends.onnx.wasm.numThreads = 1;
let detector = null;
let busy = false;

self.addEventListener('message', async ({ data }) => {
  if (busy || data.type !== 'detect') return;
  busy = true;
  const { id, image } = data;
  const send = (type, details = {}) => self.postMessage({ id, type, ...details });
  try {
    let loadMs = 0;
    const reused = Boolean(detector);
    if (!detector) {
      send('phase', { phase: 'loading' });
      const start = performance.now();
      detector = await pipeline('object-detection', MODEL_ID, {
        revision: MODEL_REVISION,
        dtype: MODEL_DTYPE,
        device: 'wasm',
        progress_callback: (progress) => send('progress', { progress }),
      });
      loadMs = performance.now() - start;
    }
    send('phase', { phase: 'detecting', loadMs, reused });
    const start = performance.now();
    const raw = await RawImage.fromBlob(image);
    const detections = await detector(raw.rgb(), {
      threshold: INFERENCE_THRESHOLD,
      percentage: true,
    });
    send('complete', {
      detections,
      loadMs,
      inferenceMs: performance.now() - start,
      reused,
    });
  } catch (error) {
    detector = null;
    send('error', { message: error?.message || String(error) });
  } finally {
    busy = false;
  }
});
