export function comparisonImages(images, example, axis) {
  return images
    .filter(
      (image) =>
        image.example === example && (axis === 'seed' ? image.steps === 1 : image.seed === 42),
    )
    .sort((a, b) => a[axis] - b[axis]);
}

export function validateManifest(data) {
  if (!data || data.schema_version !== 1 || !Array.isArray(data.images) || !data.images.length) {
    throw new Error('El catálogo no contiene imágenes válidas.');
  }
  const ids = new Set();
  for (const item of data.images) {
    if (
      !item.id ||
      ids.has(item.id) ||
      !item.example ||
      !item.title ||
      !item.prompt ||
      !/^[a-z0-9-]+\.png$/.test(item.file) ||
      !Number.isInteger(item.seed) ||
      item.seed < 0 ||
      !Number.isInteger(item.steps) ||
      item.steps < 1 ||
      item.steps > 4 ||
      item.width !== 512 ||
      item.height !== 512 ||
      !Number.isFinite(item.inference_seconds) ||
      item.inference_seconds < 0 ||
      !/^[a-f0-9]{40}$/.test(item.model_revision) ||
      item.model_id !== 'stabilityai/sd-turbo'
    )
      throw new Error('Hay un experimento con parámetros incompletos o no admitidos.');
    ids.add(item.id);
  }
  for (const example of new Set(data.images.map((image) => image.example))) {
    const group = data.images.filter((image) => image.example === example);
    const base = group[0];
    if (
      group.some(
        (item) =>
          item.prompt !== base.prompt ||
          item.model_revision !== base.model_revision ||
          item.environment?.device !== base.environment?.device ||
          item.environment?.dtype !== base.environment?.dtype,
      )
    ) {
      throw new Error('La comparación mezcla textos, modelos o dispositivos diferentes.');
    }
    for (const axis of ['seed', 'steps']) {
      const values = comparisonImages(data.images, example, axis);
      if (new Set(values.map((image) => image[axis])).size < 2) {
        throw new Error('Faltan configuraciones para comparar semillas o pasos.');
      }
    }
  }
  return data.images;
}
