export const MODEL = 'Xenova/swin2SR-lightweight-x2-64';
export const REVISION = '92a21aca5713f20faf9a87590cdfbdce2e34112c';
export const SCALE = 2;
export const MAX_SIDE = 256;
export const MIN_SIDE = 8;
export const MAX_BYTES = 5 * 1024 * 1024;
export const TILE_SIZE = 64;
export const HALO = 8;
export const FORMATS = ['image/png', 'image/jpeg', 'image/webp'];

export function validateFile(file) {
  if (!file || !FORMATS.includes(file.type))
    throw new Error('Formato no admitido. Selecciona una imagen PNG, JPEG o WebP.');
  if (file.size === 0 || file.size > MAX_BYTES)
    throw new Error('El archivo debe ocupar entre 1 byte y 5 MiB.');
}

export function validateDimensions(width, height) {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    Math.min(width, height) < MIN_SIDE ||
    Math.max(width, height) > MAX_SIDE
  )
    throw new Error(
      'Cada lado debe medir entre 8 y 256 píxeles. Reduce la imagen antes de cargarla.',
    );
}

// Cada bloque conserva un margen de contexto y aporta solo su zona central.
export function tiles(width, height) {
  validateDimensions(width, height);
  const result = [];
  for (let y = 0; y < height; y += TILE_SIZE) {
    for (let x = 0; x < width; x += TILE_SIZE) {
      const left = Math.max(0, x - HALO);
      const top = Math.max(0, y - HALO);
      const right = Math.min(width, x + TILE_SIZE + HALO);
      const bottom = Math.min(height, y + TILE_SIZE + HALO);
      result.push({
        x,
        y,
        left,
        top,
        width: right - left,
        height: bottom - top,
        coreWidth: Math.min(TILE_SIZE, width - x),
        coreHeight: Math.min(TILE_SIZE, height - y),
      });
    }
  }
  return result;
}

export function psnr(actual, expected) {
  if (actual.length !== expected.length || actual.length === 0 || actual.length % 4 !== 0)
    throw new Error('Las imágenes de comparación deben tener las mismas dimensiones RGBA.');
  let error = 0;
  for (let i = 0; i < actual.length; i += 4)
    for (let c = 0; c < 3; c++) error += (actual[i + c] - expected[i + c]) ** 2;
  const mse = error / ((actual.length / 4) * 3);
  return mse === 0 ? Infinity : 10 * Math.log10(255 ** 2 / mse);
}
