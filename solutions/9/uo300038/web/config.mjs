export const MODEL_ID = 'Xenova/detr-resnet-50';
export const MODEL_REVISION = '8be7ab59ff663484ee9ba2e8d8f267330d5ad03e';
export const MODEL_DTYPE = 'q8';
export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_SIDE = 4096;
export const MIN_SIDE = 32;
export const FORMATS = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
// El modelo se ejecuta una vez con este umbral. El control deslizante solo filtra el resultado.
export const INFERENCE_THRESHOLD = 0.1;
export const DEFAULT_THRESHOLD = 0.7;
export const EXAMPLES = {
  gato: 'gato.jpg',
  calle: 'calle.jpg',
  mesa: 'mesa.jpg',
};
