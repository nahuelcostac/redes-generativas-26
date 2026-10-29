export function validateFile(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    throw new Error('Formato no admitido. Elige JPEG, PNG o WebP estática.');
  if (!file.size || file.size > 15 * 1024 * 1024)
    throw new Error('La imagen debe ocupar entre 1 byte y 15 MiB.');
}
export function validateDimensions(w, h) {
  if (!(w > 0 && h > 0) || w > 4096 || h > 4096 || w * h > 16000000)
    throw new Error('La imagen supera el límite de 4096 píxeles por lado o 16 megapíxeles.');
}

// Detecta APNG y WebP animadas antes de decodificar solo su primer fotograma.
export function validateAnimation(buffer, type) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const tag = (offset) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (type === 'image/png') {
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const size = view.getUint32(offset);
      if (tag(offset + 4) === 'acTL')
        throw new Error('No se admiten imágenes animadas. Elige una imagen estática.');
      offset += 12 + size;
    }
  }
  if (type === 'image/webp') {
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const size = view.getUint32(offset + 4, true);
      if (['ANIM', 'ANMF'].includes(tag(offset)))
        throw new Error('No se admiten imágenes animadas. Elige una imagen estática.');
      offset += 8 + size + (size % 2);
    }
  }
}
