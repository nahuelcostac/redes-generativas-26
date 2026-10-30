import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const solutionRoot = new URL('../solutions/4/pedrovallina-uo/', import.meta.url);
const batch = JSON.parse(await readFile(new URL('code/examples.json', solutionRoot), 'utf8'));
const results = JSON.parse(await readFile(new URL('results/examples.json', solutionRoot), 'utf8'));

test('cada imagen tiene entradas reales y dos descripciones comparables', async () => {
  assert.equal(results.model.id, batch.model.id);
  assert.equal(results.model.revision, batch.model.revision);
  assert.ok(Number.isFinite(Date.parse(results.generatedAt)));
  assert.equal(results.images.length, batch.images.length);

  for (const input of batch.images) {
    const output = results.images.find((image) => image.id === input.id);
    assert.ok(output, `Falta el resultado de ${input.id}`);
    assert.equal(output.file, input.file);
    await access(new URL(`results/${input.file}`, solutionRoot));
    assert.equal(output.captions.length, input.captions.length);
    assert.equal(new Set(output.captions.map((caption) => caption.generatedText)).size, 2);

    for (const config of input.captions) {
      const caption = output.captions.find((item) => item.id === config.id);
      assert.ok(caption, `Falta la configuración ${input.id}/${config.id}`);
      assert.ok(caption.generatedText.trim());
      assert.deepEqual(caption.parameters, config.parameters);
      assert.ok(caption.elapsedSeconds > 0);
    }
  }
});
