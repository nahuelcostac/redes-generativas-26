import { env, pipeline } from '@huggingface/transformers';

env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;
const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';
const REVISION = '7e3d5398ff67a776281d0a27b2d47a964d5bfffb';
let extractor;

self.addEventListener('message', async ({ data }) => {
  if (data.type !== 'embed') return;
  const send = (type, detail = {}) => self.postMessage({ id: data.id, type, ...detail });
  try {
    let loadMs = 0;
    if (!extractor) {
      send('phase', { phase: 'loading' });
      const started = performance.now();
      extractor = await pipeline('feature-extraction', MODEL, {
        revision: REVISION,
        dtype: 'q8',
        device: 'wasm',
        progress_callback(progress) {
          send('progress', { progress });
        },
      });
      loadMs = performance.now() - started;
    }
    const reused = loadMs === 0;
    send('phase', { phase: 'embedding', loadMs, reused });
    const started = performance.now();
    const documents = await extractor(data.documents, { pooling: 'mean', normalize: true });
    const query = await extractor(data.query, { pooling: 'mean', normalize: true });
    send('complete', {
      documentVectors: documents.tolist(),
      queryVector: query.tolist()[0],
      loadMs,
      inferenceMs: performance.now() - started,
      reused,
    });
  } catch (error) {
    extractor = null;
    send('error', { message: error?.message || String(error) });
  }
});
