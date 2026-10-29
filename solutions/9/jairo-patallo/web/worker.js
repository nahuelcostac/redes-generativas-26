import { pipeline, env } from '@huggingface/transformers';
import { MODEL_ID, MODEL_REVISION, MIN_SCORE } from './config.mjs';
import { normalizeDetections } from './detections.mjs';

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
        dtype: 'q8',
        device: 'wasm',
        progress_callback: (progress) => send('progress', { progress }),
      });
      loadMs = performance.now() - start;
    }
    send('phase', { phase: 'detecting', loadMs, reused });
    const start = performance.now();
    // Se guardan las detecciones con puntuación baja. La interfaz aplica el umbral.
    const output = await detector(image, { threshold: MIN_SCORE, percentage: true });
    send('complete', {
      detections: normalizeDetections(output),
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
