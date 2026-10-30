import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  findReview,
  findRun,
  splitText,
  validateResults,
  validateReview,
} from '../solutions/10/lucialopezbarrio/web/results.mjs';

const load = async (name) =>
  JSON.parse(
    await readFile(
      new URL(`../solutions/10/lucialopezbarrio/results/${name}`, import.meta.url),
      'utf8',
    ),
  );
const data = await load('examples.json');
const review = await load('review.json');

test('cada texto exportado tiene un resumen real y una revisión por configuración', () => {
  assert.equal(validateResults(data), data);
  assert.equal(validateReview(review, data), review);
  for (const prompt of data.prompts) {
    for (const config of data.configurations) {
      const run = findRun(data, prompt.id, config.id);
      assert.equal(run.generated_token_ids.length, run.output_tokens);
      assert.ok(run.output_tokens <= config.max_new_tokens);
      assert.ok(run.summary.trim());
      assert.ok(findReview(review, prompt.id, config.id));
    }
  }
});

test('solo el texto que supera el límite aparece truncado', () => {
  const limit = data.model.max_input_tokens;
  const flags = data.prompts.map((prompt) => {
    const run = findRun(data, prompt.id, data.configurations[0].id);
    assert.equal(run.truncated, run.input_tokens_total > limit);
    const { read, unread } = splitText(prompt.text, run.input_characters_used);
    assert.equal(read + unread, prompt.text);
    assert.equal(unread.length > 0, run.truncated);
    return run.truncated;
  });
  assert.deepEqual(flags, [false, false, false, true]);
});

test('la interfaz rechaza resultados ausentes, duplicados o alterados', () => {
  const mutations = [
    (copy) => copy.runs.pop(),
    (copy) => {
      copy.runs[1] = copy.runs[0];
    },
    (copy) => {
      copy.runs[0].parameters.max_new_tokens = 999;
    },
    (copy) => {
      copy.runs[0].parameters.min_new_tokens = 1;
    },
    (copy) => {
      copy.runs[0].output_tokens = 100000;
    },
    (copy) => {
      copy.runs[0].summary = '  ';
    },
    (copy) => {
      copy.runs[0].truncated = true;
    },
    (copy) => {
      delete copy.prompts[0].source;
    },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(data);
    mutate(copy);
    assert.throws(() => validateResults(copy), /formato válido/);
  }
  assert.throws(() => findRun(data, 'no-existe', 'no-existe'), /formato válido/);
});

test('la interfaz rechaza una revisión incompleta o con un estado desconocido', () => {
  const mutations = [
    (copy) => copy.reviews.pop(),
    (copy) => {
      copy.status = 'lista';
    },
    (copy) => {
      copy.reviews[0].omissions = 'texto';
    },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(review);
    mutate(copy);
    assert.throws(() => validateReview(copy, data), /formato válido/);
  }
});
