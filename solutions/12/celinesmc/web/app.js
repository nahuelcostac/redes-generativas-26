import '../../../../shared/solution.css';
import './style.css';
import catalogue from '../../../../catalogue.json';
import solution from '../solution.json';
import { findRun, validateResults } from './results.mjs';

const $ = (selector) => document.querySelector(selector);
const number = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
const score = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const resultsURL = new URL('../results/answers.json', window.location.href);
const documentsURL = new URL('../results/documents.json', window.location.href);
const typeLabels = {
  direct: 'La respuesta está en un fragmento de la colección.',
  combined: 'La respuesta combina información de varios fragmentos.',
  unanswerable: 'La colección no contiene la respuesta.',
  custom: 'Pregunta propia.',
};
let data;
let documents;

$('#catalogue-link').href = `${import.meta.env.BASE_URL}#issue-${solution.issue}`;
$('#issue-link').href = `${catalogue.repository}/issues/${solution.issue}`;
$('#solution-summary').textContent = solution.summary;
$('#solution-author').textContent = `Por ${solution.author}`;
const issue = catalogue.issues.find((item) => item.number === solution.issue);
$('#solution-mode').textContent =
  `Issue ${issue.displayNumber} · Resultados calculados previamente`;
$('#instructions-link').href =
  `${catalogue.repository}/tree/main/solutions/${solution.issue}/${solution.author.toLowerCase()}#ejecutar-en-local`;

const element = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};

function renderChecks(target, facts, declined, question) {
  const items = [];
  if (!question.answerable) {
    items.push(
      declined
        ? ['ok', 'El modelo indica que no encuentra la respuesta.']
        : ['ko', 'El modelo no indica que falte la respuesta.'],
    );
  }
  for (const [fact, found] of Object.entries(facts))
    items.push(found ? ['ok', `Contiene «${fact}».`] : ['ko', `No contiene «${fact}».`]);
  target.replaceChildren(
    ...items.map(([state, text]) => {
      const item = element('li', text, state);
      item.prepend(element('span', state === 'ok' ? '✓ ' : '✗ ', 'mark'));
      return item;
    }),
  );
}

function renderQuestion() {
  const question = data.questions.find((item) => item.id === $('#question').value);
  const run = findRun(data, question.id);
  $('#question-text').textContent = question.text;
  $('#question-type').textContent = typeLabels[question.type];
  for (const [side, answer] of [
    ['with', run.with_context],
    ['without', run.without_context],
  ]) {
    $(`#answer-${side}`).textContent = answer.answer || '(Sin texto visible)';
    $(`#info-${side}`).textContent =
      `${answer.input_tokens} tokens de entrada · ${answer.output_tokens} tokens generados · ` +
      `${number.format(answer.generation_seconds)} s` +
      (answer.stop_reason === 'max_new_tokens' ? ' · Se alcanzó el límite de tokens' : '');
    $(`#prompt-${side}`).textContent = answer.messages
      .map((message) => `[${message.role}]\n${message.content}`)
      .join('\n\n');
  }
  renderChecks(
    $('#checks-with'),
    run.checks.in_answer_with_context,
    run.checks.declined_with_context,
    question,
  );
  renderChecks($('#checks-without'), run.checks.in_answer_without_context, false, question);
  if (!question.answerable) $('#checks-without').replaceChildren();

  const inRetrieved = Object.entries(run.checks.in_retrieved);
  $('#chunks-info').textContent =
    `${run.retrieved.length} fragmentos más similares a la pregunta · similitud coseno · ` +
    `${number.format(run.retrieval_seconds * 1000)} ms` +
    (inRetrieved.length
      ? ` · Datos esperados en los fragmentos: ${inRetrieved
          .map(([fact, found]) => `«${fact}» ${found ? 'sí' : 'no'}`)
          .join(', ')}`
      : '');
  $('#chunks').replaceChildren(
    ...run.retrieved.map((chunk) => {
      const source = documents.documents.find((item) => item.id === chunk.document_id);
      const item = element('li', undefined, 'chunk');
      const header = element('p', undefined, 'chunk-header');
      header.append(
        element('strong', `[${chunk.rank}] ${chunk.title}`),
        ` · ${chunk.section} · similitud ${score.format(chunk.score)} · `,
      );
      const link = element('a', 'Ver revisión ↗', 'text-link');
      link.href = source.url;
      link.target = '_blank';
      link.rel = 'noopener';
      header.append(link);
      item.append(header, element('p', chunk.text, 'chunk-text'));
      return item;
    }),
  );
}

function renderMetadata() {
  const { models, runtime, parameters } = data;
  const hardware = runtime.hardware;
  const generation = parameters.generation;
  const entries = [
    ['Embeddings', `${models.embedding.id} · ${models.embedding.dtype}`],
    ['Revisión', models.embedding.revision],
    ['Generador', `${models.generator.id} · ${models.generator.dtype}`],
    ['Revisión', models.generator.revision],
    [
      'Recuperación',
      `${parameters.top_k} fragmentos · ${data.collection.chunks} fragmentos de hasta ${parameters.chunk_max_chars} caracteres · ${parameters.similarity}`,
    ],
    [
      'Generación',
      `${generation.do_sample ? 'Muestreo' : 'Decodificación voraz'} · máx. ${generation.max_new_tokens} tokens nuevos · penalización de repetición ${generation.repetition_penalty}`,
    ],
    [
      'Equipo',
      `${runtime.gpu ? `${runtime.gpu} · ` : ''}${hardware.processor}${hardware.memory_bytes ? ` · ${number.format(hardware.memory_bytes / 2 ** 30)} GiB de memoria` : ''}`,
    ],
    ['Dispositivo', runtime.device.toUpperCase()],
    [
      'Dependencias',
      `Python ${runtime.python} · Transformers ${runtime.transformers} · PyTorch ${runtime.torch}`,
    ],
    ['Carga de modelos', `${number.format(data.load_seconds)} s`],
    ['Índice', `${number.format(data.index_seconds)} s para ${data.collection.chunks} fragmentos`],
    ['Fecha', new Date(data.generated_at).toLocaleString('es-ES', { timeZone: 'UTC' }) + ' UTC'],
  ];
  $('#execution-data').replaceChildren(
    ...entries.flatMap(([label, value]) => [element('dt', label), element('dd', value)]),
  );
  $('#documents').replaceChildren(
    ...documents.documents.map((document) => {
      const item = element('li');
      const link = element('a', document.title, 'text-link');
      link.href = document.url;
      link.target = '_blank';
      link.rel = 'noopener';
      item.append(
        link,
        ` · ${documents.source} · revisión ${document.revision} · ${document.license} · ${number.format(document.text.length)} caracteres`,
      );
      return item;
    }),
  );
}

async function load() {
  $('#load-error').hidden = true;
  $('#explorer').hidden = true;
  $('#load-status').hidden = false;
  $('#load-status').textContent = 'Cargando las preguntas…';
  try {
    const responses = await Promise.all([fetch(resultsURL), fetch(documentsURL)]);
    if (responses.some((response) => !response.ok))
      throw new Error('No se pudieron cargar los resultados.');
    const [results, collection] = await Promise.all(responses.map((response) => response.json()));
    documents = collection;
    data = validateResults(results, documents);
    $('#question').replaceChildren(
      ...data.questions.map((question) => new Option(question.label, question.id)),
    );
    renderQuestion();
    renderMetadata();
    $('#load-status').textContent =
      `${data.questions.length} preguntas · ${documents.documents.length} documentos · ${data.collection.chunks} fragmentos`;
    $('#explorer').hidden = false;
  } catch {
    $('#load-status').hidden = true;
    $('#load-error').hidden = false;
  }
}

$('#question').addEventListener('change', renderQuestion);
$('#retry').addEventListener('click', load);
load();
