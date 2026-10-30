import { env, pipeline, RawImage } from '@huggingface/transformers';
import { MODEL, REVISION, SCALE, tiles } from './config.mjs';

env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;
let upscaler;
let busy = false;

self.onmessage = async ({ data }) => {
  if (busy) return;
  busy = true;
  try {
    const blocks = tiles(data.width, data.height);
    if (data.buffer.byteLength !== data.width * data.height * 4)
      throw new Error('Los píxeles de entrada no coinciden con sus dimensiones.');
    const loadingStart = performance.now();
    if (!upscaler) {
      self.postMessage({ type: 'loading' });
      upscaler = await pipeline('image-to-image', MODEL, {
        revision: REVISION,
        dtype: 'fp32',
        device: 'wasm',
        progress_callback: (progress) => self.postMessage({ type: 'progress', progress }),
      });
    }
    const loadMs = performance.now() - loadingStart;
    const start = performance.now();
    const input = new Uint8ClampedArray(data.buffer);
    const width = data.width * SCALE;
    const height = data.height * SCALE;
    const output = new Uint8ClampedArray(width * height * 4);
    for (let index = 0; index < blocks.length; index++) {
      self.postMessage({ type: 'processing', completed: index, total: blocks.length });
      const block = blocks[index];
      const rgb = new Uint8ClampedArray(block.width * block.height * 3);
      for (let y = 0; y < block.height; y++) {
        for (let x = 0; x < block.width; x++) {
          const source = ((block.top + y) * data.width + block.left + x) * 4;
          rgb.set(input.subarray(source, source + 3), (y * block.width + x) * 3);
        }
      }
      const result = await upscaler(new RawImage(rgb, block.width, block.height, 3));
      // El procesador rellena a múltiplos de 8. Se recortan el relleno y el margen.
      if (result.width < block.width * SCALE || result.height < block.height * SCALE)
        throw new Error('El modelo ha devuelto unas dimensiones inesperadas.');
      const offsetX = (block.x - block.left) * SCALE;
      const offsetY = (block.y - block.top) * SCALE;
      for (let y = 0; y < block.coreHeight * SCALE; y++) {
        for (let x = 0; x < block.coreWidth * SCALE; x++) {
          const source = ((offsetY + y) * result.width + offsetX + x) * result.channels;
          const target = ((block.y * SCALE + y) * width + block.x * SCALE + x) * 4;
          output.set(result.data.subarray(source, source + 3), target);
          output[target + 3] = 255;
        }
      }
    }
    self.postMessage(
      {
        type: 'result',
        buffer: output.buffer,
        width,
        height,
        loadMs,
        inferenceMs: performance.now() - start,
      },
      [output.buffer],
    );
  } catch (error) {
    self.postMessage({ type: 'error', message: String(error.message || error) });
  } finally {
    busy = false;
  }
};
