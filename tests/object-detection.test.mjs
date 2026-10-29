import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countByLabel,
  filterByThreshold,
  labelEs,
  normalizeDetections,
  validateDimensions,
  validateFile,
} from '../solutions/9/uo300038/web/detections.mjs';

test('acepta JPEG, PNG y WebP y rechaza otros formatos, archivos vacíos y grandes', () => {
  assert.doesNotThrow(() => validateFile({ name: 'FOTO.JPG', type: 'image/jpeg', size: 1000 }));
  assert.doesNotThrow(() => validateFile({ name: 'a.png', type: 'image/png', size: 1000 }));
  assert.doesNotThrow(() => validateFile({ name: 'a.webp', type: '', size: 1000 }));
  assert.throws(() => validateFile({ name: 'a.gif', type: 'image/gif', size: 10 }), /Formato/);
  assert.throws(() => validateFile({ name: 'texto.txt', type: 'text/plain', size: 10 }), /Formato/);
  assert.throws(() => validateFile({ name: 'sin-extension', type: '', size: 10 }), /Formato/);
  assert.throws(() => validateFile({ name: 'falso.png', type: 'text/plain', size: 10 }), /Formato/);
  assert.throws(() => validateFile({ name: 'a.jpg', type: 'image/jpeg', size: 0 }), /vacío/);
  assert.throws(
    () => validateFile({ name: 'a.jpg', type: 'image/jpeg', size: 10 * 1024 * 1024 + 1 }),
    /10 MB/,
  );
});

test('limita la resolución de entrada', () => {
  assert.doesNotThrow(() => validateDimensions(4096, 32));
  assert.throws(() => validateDimensions(4097, 1000), /demasiado grande/);
  assert.throws(() => validateDimensions(1000, 31), /demasiado pequeña/);
  assert.throws(() => validateDimensions(0, 0), /tamaño/);
});

test('normaliza, recorta y ordena las detecciones del modelo', () => {
  const output = [
    { label: 'car', score: 0.6, box: { xmin: -0.1, ymin: 0.2, xmax: 0.5, ymax: 1.2 } },
    { label: 'person', score: 0.95, box: { xmin: 0.1, ymin: 0.1, xmax: 0.2, ymax: 0.4 } },
    { label: 'cat', score: 0.9, box: { xmin: 0.5, ymin: 0.5, xmax: 0.5, ymax: 0.7 } },
  ];
  const result = normalizeDetections(output);
  assert.deepEqual(
    result.map((d) => d.label),
    ['person', 'car'],
  );
  assert.deepEqual(result[1].box, { xmin: 0, ymin: 0.2, xmax: 0.5, ymax: 1 });
  assert.equal(result[0].labelEs, 'persona');
  assert.throws(() => normalizeDetections(null), /no válido/);
});

test('filtra por umbral incluyendo el valor límite y cuenta por categoría', () => {
  const detections = normalizeDetections([
    { label: 'person', score: 0.7, box: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 } },
    { label: 'person', score: 0.9, box: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 } },
    { label: 'motorcycle', score: 0.8, box: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 } },
    { label: 'car', score: 0.3, box: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 } },
  ]);
  const visible = filterByThreshold(detections, 0.7);
  assert.equal(visible.length, 3);
  assert.deepEqual(countByLabel(visible), [
    ['persona', 2],
    ['moto', 1],
  ]);
  assert.equal(filterByThreshold(detections, 1).length, 0);
});

test('traduce las categorías conocidas y conserva las desconocidas', () => {
  assert.equal(labelEs('dining table'), 'mesa');
  assert.equal(labelEs('N/A'), 'N/A');
});
