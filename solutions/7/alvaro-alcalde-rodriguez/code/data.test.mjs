import test from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest, comparisonImages } from '../web/data.js';

// Datos sintéticos solo para probar la validación. No son resultados del modelo
// ni se exportan a results/. La integridad de las imágenes reales se comprueba
// por separado con verify_results.py.
const manifest = {
  schema_version: 1,
  images: [[42, 1], [314, 1], [42, 2], [42, 4]].map(([seed, steps]) => ({
    id: `prueba-s${seed}-p${steps}`, example: 'prueba', title: 'Ejemplo de prueba',
    prompt: 'Texto de prueba', seed, steps, width: 512, height: 512,
    file: `prueba-s${seed}-p${steps}.png`, inference_seconds: 1,
    model_id: 'stabilityai/sd-turbo', model_revision: 'b'.repeat(40),
    environment: { device: 'cpu', dtype: 'torch.float32' },
  })),
};

test('cada comparación modifica solo la variable elegida', () => {
  const images = validateManifest(manifest);
  for (const example of new Set(images.map((image) => image.example))) {
    const seeds = comparisonImages(images, example, 'seed');
    assert.ok(seeds.length >= 2);
    assert.ok(seeds.every((item) => item.steps === 1));
    const steps = comparisonImages(images, example, 'steps');
    assert.ok(steps.length >= 2);
    assert.ok(steps.every((item) => item.seed === 42));
    assert.equal(new Set([...seeds, ...steps].map((item) => item.prompt)).size, 1);
  }
});

test('rechaza catálogos incompletos y rutas fuera de results', () => {
  assert.throws(() => validateManifest({ schema_version: 1, images: [] }));
  const incomplete = structuredClone(manifest);
  incomplete.images = incomplete.images.filter((image) => image.seed === 42);
  assert.throws(() => validateManifest(incomplete), /Faltan configuraciones/);
  const unsafe = structuredClone(manifest);
  unsafe.images[0].file = '../otra-imagen.png';
  assert.throws(() => validateManifest(unsafe), /parámetros incompletos/);
});

test('rechaza comparaciones entre revisiones distintas del modelo', () => {
  const mixed = structuredClone(manifest);
  mixed.images[0].model_revision = 'a'.repeat(40);
  assert.throws(() => validateManifest(mixed), /mezcla textos, modelos o dispositivos/);
});
