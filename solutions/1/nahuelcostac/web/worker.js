import { pipeline, env } from '@huggingface/transformers';
import { MODEL_ID, MODEL_REVISION } from './config.mjs';

env.allowLocalModels = false;
// GitHub Pages no necesita cabeceras de aislamiento para un único hilo WASM.
env.backends.onnx.wasm.numThreads = 1;
let transcriber = null;
let busy = false;

self.addEventListener('message', async ({ data }) => {
  if (busy || data.type !== 'transcribe') return;
  busy = true;
  const { id, audio } = data;
  const send = (type, details = {}) => self.postMessage({ id, type, ...details });
  try {
    let loadMs = 0;
    const reused = Boolean(transcriber);
    if (!transcriber) {
      send('phase', { phase: 'loading' });
      const start = performance.now();
      transcriber = await pipeline('automatic-speech-recognition', MODEL_ID, {
        revision: MODEL_REVISION,
        dtype: 'q8',
        device: 'wasm',
        progress_callback: (progress) => send('progress', { progress }),
      });
      loadMs = performance.now() - start;
    }
    send('phase', { phase: 'transcribing', loadMs, reused });
    const start = performance.now();
    const output = await transcriber(audio, {
      language: 'spanish',
      task: 'transcribe',
      do_sample: false,
      max_new_tokens: 256,
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: false,
    });
    send('complete', {
      text: output.text.trim(),
      loadMs,
      inferenceMs: performance.now() - start,
      reused,
    });
  } catch (error) {
    transcriber = null;
    send('error', { message: error?.message || String(error) });
  } finally {
    busy = false;
  }
});
