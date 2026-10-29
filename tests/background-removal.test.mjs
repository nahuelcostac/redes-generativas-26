import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFile, validateDimensions } from '../solutions/8/jorgegr1/web/validation.js';
test('Admite JPEG, PNG y WebP; rechaza otros formatos, archivos vacíos y grandes', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp'])
    assert.doesNotThrow(() => validateFile({ type, size: 1024 }));
  for (const type of ['text/plain', 'image/svg+xml', 'image/gif', 'image/heic', ''])
    assert.throws(() => validateFile({ type, size: 1024 }), /Formato no admitido/);
  for (const size of [0, 15 * 1024 * 1024 + 1])
    assert.throws(() => validateFile({ type: 'image/png', size }), /15 MiB/);
});
test('Limita los lados y el número total de píxeles sin reducir la imagen', () => {
  assert.doesNotThrow(() => validateDimensions(4000, 4000));
  assert.doesNotThrow(() => validateDimensions(4096, 1000));
  for (const [w, h] of [
    [4097, 100],
    [100, 4097],
    [4096, 4096],
    [0, 10],
  ])
    assert.throws(() => validateDimensions(w, h), /límite/);
});

test('Rechaza APNG y WebP animadas', async () => {
  const { validateAnimation } = await import('../solutions/8/jorgegr1/web/validation.js');
  const png = new Uint8Array(28);
  new DataView(png.buffer).setUint32(8, 8);
  png.set(new TextEncoder().encode('acTL'), 12);
  assert.throws(() => validateAnimation(png.buffer, 'image/png'), /animadas/);
  const webp = new Uint8Array(28);
  webp.set(new TextEncoder().encode('ANIM'), 12);
  assert.throws(() => validateAnimation(webp.buffer, 'image/webp'), /animadas/);
  assert.doesNotThrow(() => validateAnimation(new ArrayBuffer(8), 'image/png'));
});
