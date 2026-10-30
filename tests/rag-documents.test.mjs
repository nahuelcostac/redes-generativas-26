import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  findQuestion,
  validateResults,
  validateReview,
} from '../solutions/12/uo296636/web/results.mjs';

const read = async (name) =>
  JSON.parse(
    await readFile(new URL(`../solutions/12/uo296636/results/${name}`, import.meta.url), 'utf8'),
  );
const data = await read('answers.json');
const review = await read('review.json');
const corpus = await read('documents.json');

test('cada pregunta exportada tiene fragmentos reales y dos respuestas', () => {
  assert.equal(validateResults(data), data);
  assert.equal(validateReview(review, data), review);
  const types = new Set(data.questions.map((question) => question.type));
  assert.deepEqual([...types].sort(), ['combinada', 'directa', 'sin-respuesta']);
  for (const { id } of data.questions) {
    const question = findQuestion(data, id);
    assert.equal(question.fragments.length, data.parameters.top_k);
    assert.ok(question.with_context.answer.trim());
    assert.ok(question.without_context.answer.trim());
    // El prompt con contexto contiene los fragmentos y el prompt sin contexto no.
    for (const fragment of question.fragments) {
      assert.ok(question.with_context.prompt.includes(fragment.text));
      assert.ok(!question.without_context.prompt.includes(fragment.text));
    }
  }
});

test('los fragmentos proceden del texto de los documentos publicados', () => {
  // rag.py elimina los espacios de anchura cero y une las palabras con un espacio.
  const normalize = (text) => text.replaceAll('\u200b', '').split(/\s+/).join(' ');
  const texts = new Map(
    corpus.documents.map((document) => [document.id, normalize(document.text)]),
  );
  for (const chunk of data.chunks) assert.ok(texts.get(chunk.document_id).includes(chunk.text));
  assert.deepEqual(
    data.documents.map((document) => document.url),
    corpus.documents.map((document) => document.url),
  );
});

test('la interfaz rechaza resultados incompletos o incoherentes', () => {
  const mutations = [
    (copy) => copy.questions[0].retrieved.pop(),
    (copy) => {
      copy.questions[0].retrieved[0].chunk_id = 'no-existe';
    },
    (copy) => {
      copy.questions[0].retrieved.reverse();
    },
    (copy) => {
      copy.questions[1] = copy.questions[0];
    },
    (copy) => {
      copy.questions[0].with_context.output_tokens = 100000;
    },
    (copy) => {
      copy.questions[0].type = 'otra';
    },
    (copy) => {
      copy.questions[0].with_context.cited = [99];
    },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(data);
    mutate(copy);
    assert.throws(() => validateResults(copy), /formato válido/);
  }
  assert.throws(() => findQuestion(data, 'no-existe'), /formato válido/);
  const incomplete = structuredClone(review);
  delete incomplete.questions[data.questions[0].id];
  assert.throws(() => validateReview(incomplete, data), /formato válido/);
});
