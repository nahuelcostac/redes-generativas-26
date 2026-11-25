import { env, pipeline, RawImage } from '@huggingface/transformers';
import { MODEL_ID, MODEL_REVISION, SCALE } from './config.js';

env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;
let upscaler;

async function loadModel() {
  if (upscaler) return { pipeline: upscaler, reused: true };
  self.postMessage({ type: 'status', message: 'Descargando y preparando Swin2SR…' });
  upscaler = await pipeline('image-to-image', MODEL_ID, {
    revision: MODEL_REVISION,
    dtype: 'fp32',
    device: 'wasm',
    progress_callback: (event) => {
      if (event.status === 'progress')
        self.postMessage({ type: 'progress', value: event.progress, file: event.file });
    },
  });
  return { pipeline: upscaler, reused: false };
}

self.onmessage = async ({ data }) => {
  try {
    const { width, height, pixels } = data;
    if (pixels.byteLength !== width * height * 4)
      throw new Error('Los datos de imagen no coinciden con sus dimensiones.');
    const loadingStarted = performance.now();
    const loaded = await loadModel();
    const loadingMs = performance.now() - loadingStarted;
    self.postMessage({ type: 'status', message: 'Aplicando superresolución…' });
    const rgba = new Uint8ClampedArray(pixels);
    const rgb = new Uint8ClampedArray(width * height * 3);
    for (let source = 0, target = 0; source < rgba.length; source += 4, target += 3)
      rgb.set(rgba.subarray(source, source + 3), target);
    const inferenceStarted = performance.now();
    const result = await loaded.pipeline(new RawImage(rgb, width, height, 3));
    const inferenceMs = performance.now() - inferenceStarted;
    const targetWidth = width * SCALE;
    const targetHeight = height * SCALE;
    if (result.width < targetWidth || result.height < targetHeight)
      throw new Error('El modelo ha devuelto unas dimensiones inesperadas.');
    const output = new Uint8ClampedArray(targetWidth * targetHeight * 4);
    for (let y = 0; y < targetHeight; y++)
      for (let x = 0; x < targetWidth; x++) {
        const source = (y * result.width + x) * result.channels;
        const target = (y * targetWidth + x) * 4;
        output[target] = result.data[source];
        output[target + 1] = result.data[source + 1];
        output[target + 2] = result.data[source + 2];
        output[target + 3] = 255;
      }
    self.postMessage(
      {
        type: 'result',
        width: targetWidth,
        height: targetHeight,
        pixels: output.buffer,
        loadingMs,
        inferenceMs,
        reused: loaded.reused,
      },
      [output.buffer],
    );
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
