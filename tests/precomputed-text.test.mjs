import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateResults, findRun } from '../solutions/2/nahuelcostac/web/results.mjs';

const data = JSON.parse(
  await readFile(
    new URL('../solutions/2/nahuelcostac/results/examples.json', import.meta.url),
    'utf8',
  ),
);

test('cada entrada exportada tiene una salida real por configuración', () => {
  assert.equal(validateResults(data), data);
  for (const prompt of data.prompts) {
    for (const config of data.configurations) {
      const run = findRun(data, prompt.id, config.id);
      assert.equal(run.generated_token_ids.length, run.output_tokens);
      assert.ok(run.generated_token_ids.every(Number.isInteger));
      assert.ok(run.continuation.trim());
    }
  }
});

test('la interfaz rechaza resultados ausentes, duplicados o con parámetros cambiados', () => {
  const mutations = [
    (copy) => copy.runs.pop(),
    (copy) => {
      copy.runs[1] = copy.runs[0];
    },
    (copy) => {
      copy.runs[0].parameters.temperature = 1.7;
    },
    (copy) => {
      copy.runs[0].output_tokens = 100000;
    },
    (copy) => {
      copy.configurations[0].seed = -1;
    },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(data);
    mutate(copy);
    assert.throws(() => validateResults(copy), /formato válido/);
  }
  assert.throws(() => findRun(data, 'no-existe', 'no-existe'), /formato válido/);
});

test('el ejemplo corto conserva los tokens iniciales de su comparación larga', () => {
  for (const prompt of data.prompts) {
    const short = findRun(data, prompt.id, 't09-32');
    const long = findRun(data, prompt.id, 't09-96');
    assert.deepEqual(
      short.generated_token_ids,
      long.generated_token_ids.slice(0, short.output_tokens),
    );
    assert.equal(short.parameters.temperature, long.parameters.temperature);
    assert.equal(short.parameters.seed, long.parameters.seed);
  }
});
