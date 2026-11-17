export const MODEL_ID = 'Xenova/swin2SR-lightweight-x2-64';
export const MODEL_REVISION = '92a21aca5713f20faf9a87590cdfbdce2e34112c';
export const SCALE = 2;
export const MIN_SIDE = 16;
export const MAX_SIDE = 256;
export const MAX_BYTES = 8 * 1024 * 1024;
export const ACCEPTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export function validateFile(file) {
  if (!file || !ACCEPTED_TYPES.has(file.type))
    throw new Error('Formato no admitido. Selecciona una imagen PNG, JPEG o WebP.');
  if (file.size === 0 || file.size > MAX_BYTES)
    throw new Error('El archivo debe ocupar entre 1 byte y 8 MiB.');
}

export function validateSize(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height))
    throw new Error('No se han podido leer las dimensiones de la imagen.');
  if (Math.min(width, height) < MIN_SIDE || Math.max(width, height) > MAX_SIDE)
    throw new Error(`Cada lado debe medir entre ${MIN_SIDE} y ${MAX_SIDE} px.`);
}
