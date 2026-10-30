import { FORMATS, MAX_BYTES, MAX_SIDE } from './config.mjs';

export function validateFile(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  if (!Object.hasOwn(FORMATS, extension))
    throw new Error('Formato no admitido. Usa una imagen JPG, PNG o WebP.');
  if (file.size === 0) throw new Error('El archivo está vacío.');
  if (file.size > MAX_BYTES) throw new Error('La imagen supera el límite de 8 MB.');
}

export function validateSize(width, height) {
  if (!(width > 0 && height > 0)) throw new Error('La imagen no tiene dimensiones válidas.');
  if (width > MAX_SIDE || height > MAX_SIDE)
    throw new Error(`La imagen supera ${MAX_SIDE} píxeles por lado.`);
}

// Convierte la salida del pipeline en recuadros con porcentajes seguros para la interfaz.
export function normalizeDetections(output) {
  const clamp = (value) => Math.min(1, Math.max(0, value));
  return output
    .filter((item) => Number.isFinite(item.score) && item.box && item.label !== 'N/A')
    .map(({ label, score, box }) => ({
      label,
      score,
      box: {
        xmin: clamp(box.xmin),
        ymin: clamp(box.ymin),
        xmax: clamp(box.xmax),
        ymax: clamp(box.ymax),
      },
    }))
    .filter(({ box }) => box.xmax > box.xmin && box.ymax > box.ymin)
    .sort((a, b) => b.score - a.score);
}

export function filterByThreshold(detections, threshold) {
  return detections.filter((item) => item.score >= threshold);
}
