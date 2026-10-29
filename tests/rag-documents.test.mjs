import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateResults, findRun } from '../solutions/12/celinesmc/web/results.mjs';

const read = async (name) =>
  JSON.parse(
    await readFile(new URL(`../solutions/12/celinesmc/results/${name}`, import.meta.url), 'utf8'),
  );
const data = await read('answers.json');
const documents = await read('documents.json');

test('cada pregunta tiene fragmentos de la colección y dos respuestas reales', () => {
  assert.equal(validateResults(data, documents), data);
  for (const question of data.questions) {
    const run = findRun(data, question.id);
    assert.ok(run.with_context.answer.trim());
    assert.ok(run.without_context.answer.trim());
    for (const chunk of run.retrieved) {
      const source = documents.documents.find((item) => item.id === chunk.document_id);
      assert.ok(source.text.includes(chunk.text.split('\n')[0]));
    }
  }
});

test('las preguntas publicadas cubren los tres casos de la issue', () => {
  const types = new Set(data.questions.map((question) => question.type));
  for (const type of ['direct', 'combined', 'unanswerable']) assert.ok(types.has(type));
});

test('la interfaz rechaza resultados ausentes, desordenados o ajenos a la colección', () => {
  const mutations = [
    (copy) => copy.runs.pop(),
    (copy) => {
      copy.runs[1].question_id = copy.runs[0].question_id;
    },
    (copy) => {
      copy.runs[0].retrieved.reverse();
    },
    (copy) => {
      copy.runs[0].retrieved[0].document_id = 'doc-inexistente';
    },
    (copy) => {
      copy.runs[0].retrieved[0].text = 'Fragmento que no se envió al modelo.';
    },
    (copy) => {
      copy.runs[0].with_context.output_tokens = 100000;
    },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(data);
    mutate(copy);
    assert.throws(() => validateResults(copy, documents), /formato válido/);
  }
  assert.throws(() => findRun(data, 'no-existe'), /formato válido/);
});
