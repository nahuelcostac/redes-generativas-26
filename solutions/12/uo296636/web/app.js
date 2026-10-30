import '../../../../shared/solution.css';
import './style.css';
import catalogue from '../../../../catalogue.json';
import solution from '../solution.json';
import { QUESTION_TYPES, findQuestion, validateResults, validateReview } from './results.mjs';

const $ = (selector) => document.querySelector(selector);
const number = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
const score = new Intl.NumberFormat('es-ES', {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});
const resultsURL = new URL('../results/answers.json', window.location.href);
const reviewURL = new URL('../results/review.json', window.location.href);
let data;
let review;

$('#catalogue-link').href = `${import.meta.env.BASE_URL}#issue-${solution.issue}`;
$('#issue-link').href = `${catalogue.repository}/issues/${solution.issue}`;
$('#solution-author').textContent = `Por ${solution.author}`;
const issue = catalogue.issues.find((item) => item.number === solution.issue);
$('#solution-mode').textContent =
  `Issue ${issue.displayNumber} · Resultados calculados previamente`;
$('#instructions-link').href =
  `${catalogue.repository}/tree/main/solutions/${solution.issue}/${solution.author.toLowerCase()}#ejecutar-en-local`;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function runInfo(generation) {
  const stop =
    generation.stop_reason === 'eos'
      ? 'El modelo terminó la respuesta.'
      : 'Se alcanzó el límite de tokens. La respuesta puede estar incompleta.';
  return `${generation.input_tokens} tokens de entrada · ${generation.output_tokens} tokens generados · ${number.format(generation.generation_seconds)} s. ${stop}`;
}

function renderQuestion() {
  const question = findQuestion(data, $('#question').value);
  $('#question-text').textContent = question.text;
  $('#question-type').textContent = QUESTION_TYPES[question.type];
  $('#question-type').dataset.type = question.type;
  for (const [side, key] of [
    ['with', 'with_context'],
    ['without', 'without_context'],
  ]) {
    $(`#answer-${side}`).textContent = question[key].answer || '(Sin texto visible)';
    $(`#info-${side}`).textContent = runInfo(question[key]);
    $(`#prompt-${side}`).textContent = question[key].prompt;
    const entry = review.questions[question.id][key];
    $(`#verdict-${side}`).replaceChildren(
      element('strong', '', `${review.verdicts[entry.verdict]}. `),
      entry.note,
    );
    $(`#verdict-${side}`).dataset.verdict = entry.verdict;
  }
  const cited = question.with_context.cited;
  $('#fragments-hint').textContent =
    `Los ${question.fragments.length} fragmentos con mayor similitud coseno con la pregunta. ` +
    (cited.length
      ? `La respuesta cita ${cited.map((item) => `[${item}]`).join(', ')}.`
      : 'La respuesta no cita ningún fragmento por su número.');
  $('#fragments').replaceChildren(
    ...question.fragments.map((fragment) => {
      const item = element('li', fragment.cited ? 'fragment cited' : 'fragment');
      const heading = element('p', 'fragment-heading');
      const link = element('a', 'text-link', fragment.document.title);
      link.href = fragment.document.url;
      link.target = '_blank';
      link.rel = 'noopener';
      heading.append(
        element('span', 'fragment-rank', `[${fragment.rank}]`),
        link,
        element('span', 'fragment-section', ` · ${fragment.section}`),
      );
      const meta = element(
        'p',
        'fragment-meta',
        `Similitud ${score.format(fragment.score)}${fragment.cited ? ' · Citado en la respuesta' : ''}`,
      );
      item.append(heading, element('p', 'fragment-text', fragment.text), meta);
      return item;
    }),
  );
}

function renderMetadata() {
  const { parameters, models, runtime, timings, corpus } = data;
  const hardware = runtime.hardware;
  const gib = (bytes) => `${number.format(bytes / 2 ** 30)} GiB`;
  const entries = [
    ['Modelo de embeddings', `${models.embedding.id} · ${models.embedding.revision.slice(0, 12)}`],
    ['Modelo generativo', `${models.generator.id} · ${models.generator.revision.slice(0, 12)}`],
    [
      'Fragmentación',
      `${parameters.chunk_words} palabras por fragmento · solapamiento de ${parameters.overlap_words} palabras · ${corpus.chunks} fragmentos`,
    ],
    ['Recuperación', `${parameters.top_k} fragmentos · similitud coseno · prefijos query/passage`],
    [
      'Generación',
      `${parameters.do_sample ? 'Muestreo' : 'Decodificación voraz, sin muestreo'} · máximo ${parameters.max_new_tokens} tokens nuevos · ${models.generator.dtype}`,
    ],
    ['Instrucción con contexto', parameters.system_with_context],
    ['Instrucción sin contexto', parameters.system_without_context],
    [
      'Equipo',
      [
        hardware.gpu && `${hardware.gpu} (${gib(hardware.gpu_memory_bytes)})`,
        hardware.processor,
        hardware.memory_bytes && `${gib(hardware.memory_bytes)} de RAM`,
        `${hardware.system} ${hardware.release}`,
      ]
        .filter(Boolean)
        .join(' · '),
    ],
    [
      'Dependencias',
      `Python ${runtime.python} · PyTorch ${runtime.torch} · Transformers ${runtime.transformers}`,
    ],
    [
      'Tiempos de carga',
      `Embeddings ${number.format(timings.embedding_load_seconds)} s · índice ${number.format(timings.index_seconds)} s · generador ${number.format(timings.generator_load_seconds)} s`,
    ],
    [
      'Memoria GPU máxima',
      runtime.peak_gpu_memory_bytes ? gib(runtime.peak_gpu_memory_bytes) : 'No medida',
    ],
    ['Fecha', new Date(data.created_at).toLocaleString('es-ES', { timeZone: 'UTC' }) + ' UTC'],
  ];
  $('#execution-data').replaceChildren(
    ...entries.flatMap(([label, value]) => [element('dt', '', label), element('dd', '', value)]),
  );
  $('#corpus-info').textContent =
    `${corpus.documents} artículos de ${corpus.source}, descargados el ${new Date(corpus.fetched_at).toLocaleDateString('es-ES')}. Licencia ${corpus.license}. El texto completo está en results/documents.json.`;
  $('#documents').replaceChildren(
    ...data.documents.map((document) => {
      const item = element('li');
      const link = element('a', 'text-link', document.title);
      link.href = document.url;
      link.target = '_blank';
      link.rel = 'noopener';
      item.append(link, ` · revisión ${document.revision}`);
      return item;
    }),
  );
}

async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('No se pudieron cargar los resultados.');
  return response.json();
}

async function load() {
  $('#load-error').hidden = true;
  $('#explorer').hidden = true;
  $('#load-status').hidden = false;
  $('#load-status').textContent = 'Cargando los resultados…';
  try {
    data = validateResults(await fetchJSON(resultsURL));
    review = validateReview(await fetchJSON(reviewURL), data);
    $('#question').replaceChildren(
      ...data.questions.map(
        (question, index) => new Option(`${index + 1}. ${question.text}`, question.id),
      ),
    );
    $('#review-method').textContent = review.method;
    renderQuestion();
    renderMetadata();
    $('#load-status').textContent =
      `${data.questions.length} preguntas · ${data.corpus.documents} documentos · ${data.corpus.chunks} fragmentos indexados`;
    $('#explorer').hidden = false;
  } catch {
    $('#load-status').hidden = true;
    $('#load-error').hidden = false;
  }
}

$('#question').addEventListener('change', renderQuestion);
$('#retry').addEventListener('click', load);
load();
