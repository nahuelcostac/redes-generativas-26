import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateFile,
  validateSize,
  normalizeDetections,
  filterByThreshold,
} from '../solutions/9/jairo-patallo/web/detections.mjs';

test('rechaza formatos no admitidos, archivos vacíos y archivos demasiado grandes', () => {
  assert.throws(() => validateFile({ name: 'texto.txt', size: 20 }), /Formato/);
  assert.throws(() => validateFile({ name: 'imagen.gif', size: 20 }), /Formato/);
  assert.throws(() => validateFile({ name: 'imagen.png', size: 0 }), /vacío/);
  assert.throws(() => validateFile({ name: 'imagen.jpg', size: 9 * 1024 * 1024 }), /8 MB/);
  assert.doesNotThrow(() => validateFile({ name: 'FOTO.JPEG', size: 1000 }));
});

test('rechaza dimensiones inválidas o excesivas', () => {
  assert.throws(() => validateSize(0, 100), /dimensiones/);
  assert.throws(() => validateSize(5000, 100), /4096/);
  assert.doesNotThrow(() => validateSize(4096, 4096));
});

test('normaliza, ordena y descarta detecciones inválidas', () => {
  const output = [
    { label: 'dog', score: 0.5, box: { xmin: 0.1, ymin: 0.1, xmax: 0.5, ymax: 0.5 } },
    { label: 'N/A', score: 0.9, box: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 } },
    { label: 'cat', score: 0.9, box: { xmin: -0.1, ymin: 0, xmax: 1.2, ymax: 0.4 } },
    { label: 'bad', score: 0.8, box: { xmin: 0.5, ymin: 0.5, xmax: 0.5, ymax: 0.9 } },
    { label: 'nan', score: NaN, box: { xmin: 0, ymin: 0, xmax: 1, ymax: 1 } },
  ];
  const result = normalizeDetections(output);
  assert.deepEqual(
    result.map((item) => item.label),
    ['cat', 'dog'],
  );
  assert.deepEqual(result[0].box, { xmin: 0, ymin: 0, xmax: 1, ymax: 0.4 });
});

test('el umbral conserva las detecciones con puntuación igual o mayor', () => {
  const items = [{ score: 0.9 }, { score: 0.7 }, { score: 0.69 }];
  assert.equal(filterByThreshold(items, 0.7).length, 2);
  assert.equal(filterByThreshold(items, 0.95).length, 0);
});
