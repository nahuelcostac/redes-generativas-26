import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateFile,
  validateDimensions,
  tiles,
  psnr,
} from '../solutions/11/victor-acevedo/web/config.mjs';

test('superresolución rechaza formatos, tamaños y dimensiones no admitidos', () => {
  for (const type of ['image/png', 'image/jpeg', 'image/webp'])
    assert.doesNotThrow(() => validateFile({ type, size: 100 }));
  for (const file of [
    null,
    { type: 'text/plain', size: 20 },
    { type: 'image/svg+xml', size: 20 },
    { type: 'image/png', size: 0 },
    { type: 'image/png', size: 5 * 1024 * 1024 + 1 },
  ])
    assert.throws(() => validateFile(file));
  for (const [width, height] of [
    [8, 8],
    [256, 256],
    [91, 137],
  ])
    assert.doesNotThrow(() => validateDimensions(width, height));
  for (const [width, height] of [
    [0, 20],
    [7, 20],
    [257, 20],
    [20, 257],
    [NaN, 20],
    [12.5, 20],
  ])
    assert.throws(() => validateDimensions(width, height));
});

test('los bloques cubren cada píxel una vez, incluidos bordes y tamaños impares', () => {
  for (const [width, height] of [
    [8, 8],
    [64, 64],
    [96, 96],
    [91, 137],
    [256, 256],
  ]) {
    const coverage = new Uint8Array(width * height);
    for (const block of tiles(width, height)) {
      assert.ok(block.left >= 0 && block.top >= 0);
      assert.ok(block.left + block.width <= width && block.top + block.height <= height);
      assert.ok(block.width <= 80 && block.height <= 80);
      for (let y = block.y; y < block.y + block.coreHeight; y++)
        for (let x = block.x; x < block.x + block.coreWidth; x++) coverage[y * width + x]++;
    }
    assert.ok(coverage.every((value) => value === 1));
  }
});

test('PSNR usa RGB, ignora alfa y detecta tamaños distintos', () => {
  assert.equal(psnr([0, 0, 0, 255], [0, 0, 0, 0]), Infinity);
  assert.equal(psnr([0, 0, 0, 255], [255, 255, 255, 255]), 0);
  assert.ok(Math.abs(psnr([10, 10, 10, 255], [0, 0, 0, 255]) - 28.130803608679106) < 1e-10);
  assert.throws(() => psnr([], []));
  assert.throws(() => psnr([1, 2, 3, 4], [1, 2, 3]));
});
