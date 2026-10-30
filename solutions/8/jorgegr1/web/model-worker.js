import { env, AutoModel, AutoProcessor, RawImage } from '@huggingface/transformers';
env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;
const model = 'briaai/RMBG-1.4';
const revision = '2ceba5a5efaec153162aedea169f76caf9b46cf8';
let network, processor;
self.onmessage = async ({ data }) => {
  try {
    const loadStart = performance.now();
    if (!network) {
      self.postMessage({ type: 'loading' });
      const options = {
        revision,
        progress_callback: (progress) => self.postMessage({ type: 'progress', progress }),
      };
      // AutoModel permite cargar el grafo ONNX de BRIA sin ejecutar su código Python.
      network = await AutoModel.from_pretrained(model, {
        ...options,
        dtype: 'fp32',
        device: 'wasm',
      });
      processor = await AutoProcessor.from_pretrained(model, options);
    }
    const loadMs = performance.now() - loadStart;
    self.postMessage({ type: 'processing' });
    const start = performance.now();
    const image = new RawImage(new Uint8ClampedArray(data.buffer), data.width, data.height, 4);
    const { pixel_values } = await processor(image);
    const outputs = await network({ input: pixel_values });
    const tensor = Object.values(outputs)[0];
    const values = tensor.data;
    let min = Infinity,
      max = -Infinity;
    for (const value of values) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    const bytes = Uint8ClampedArray.from(
      values,
      (value) => (255 * (value - min)) / (max - min || 1),
    );
    const mask = await new RawImage(bytes, tensor.dims.at(-1), tensor.dims.at(-2), 1).resize(
      data.width,
      data.height,
    );
    const result = image.clone();
    result.putAlpha(mask);
    const pixels = new Uint8ClampedArray(result.data);
    self.postMessage(
      {
        type: 'result',
        buffer: pixels.buffer,
        width: result.width,
        height: result.height,
        loadMs,
        inferenceMs: performance.now() - start,
        model,
        revision,
      },
      [pixels.buffer],
    );
  } catch (error) {
    self.postMessage({ type: 'error', message: String(error.message || error) });
  }
};
