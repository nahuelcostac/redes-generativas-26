import test from 'node:test';
import assert from 'node:assert/strict';
import { filterIssues, groupIssues } from '../src/issue-search.mjs';

const issues = [
  {
    number: 3,
    displayNumber: 1,
    title: 'Transcripción de audio',
    summary: 'Audio en español.',
    mode: 'browser',
    state: 'open',
  },
  {
    number: 4,
    displayNumber: 2,
    title: 'Generación de texto',
    summary: 'Continuaciones en local.',
    mode: 'precomputed',
    state: 'closed',
  },
  {
    number: 30,
    displayNumber: 3,
    title: 'Clasificar imágenes',
    summary: 'Clasificación.',
    mode: 'browser',
    state: 'open',
  },
];
const solutions = [
  { issue: 3, author: 'NahuelCostaCortez', status: 'ready' },
  { issue: 4, author: 'Alumno', status: 'draft' },
];

test('el estado de GitHub decide el apartado, aunque haya una solución lista', () => {
  const groups = groupIssues(issues);
  assert.deepEqual(
    groups.open.map((issue) => issue.number),
    [3, 30],
  );
  assert.deepEqual(
    groups.closed.map((issue) => issue.number),
    [4],
  );
});

test('la búsqueda admite acentos, mayúsculas, autores y varios términos', () => {
  assert.deepEqual(
    filterIssues(issues, solutions, 'TRANSCRIPCION nahuel').map((issue) => issue.number),
    [3],
  );
  assert.deepEqual(
    filterIssues(issues, solutions, 'generacion alumno').map((issue) => issue.number),
    [4],
  );
});

test('la búsqueda numérica utiliza el número visible y conserva el identificador de GitHub', () => {
  assert.deepEqual(
    filterIssues(issues, solutions, '#1').map((issue) => issue.number),
    [3],
  );
  assert.deepEqual(
    filterIssues(issues, solutions, '3').map((issue) => issue.number),
    [30],
  );
});

test('el filtro de tipo se combina con la búsqueda y admite cero resultados', () => {
  assert.deepEqual(
    filterIssues(issues, solutions, '', 'browser').map((issue) => issue.number),
    [3, 30],
  );
  assert.deepEqual(filterIssues(issues, solutions, 'audio', 'precomputed'), []);
});
