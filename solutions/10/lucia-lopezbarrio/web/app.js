import '../../../../shared/solution.css';
import './style.css';
import catalogue from '../../../../catalogue.json';
import solution from '../solution.json';
import { findReview, findRun, splitText, validateResults, validateReview } from './results.mjs';

const $ = (selector) => document.querySelector(selector);
const number = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
const resultsURL = new URL('../results/examples.json', window.location.href);
const reviewURL = new URL('../results/review.json', window.location.href);
let data;
let review;

document.title = `${solution.title} · Redes Generativas`;
$('#catalogue-link').href = `${import.meta.env.BASE_URL}#issue-${solution.issue}`;
$('#issue-link').href = `${catalogue.repository}/issues/${solution.issue}`;
$('#solution-author').textContent = `Por ${solution.author}`;
const issue = catalogue.issues.find((item) => item.number === solution.issue);
$('#solution-mode').textContent =
  `Issue ${issue.displayNumber} · Resultados calculados previamente`;
$('#instructions-link').href =
  `${catalogue.repository}/tree/main/solutions/${solution.issue}/${solution.author}#ejecutar-en-local`;

function renderList(selector, items, empty) {
  const list = $(selector);
  list.replaceChildren(
    ...(items.length ? items : [empty]).map((item) => {
      const entry = document.createElement('li');
      entry.textContent = item;
      return entry;
    }),
  );
}

function renderDefinitions(selector, entries) {
  const list = $(selector);
  list.replaceChildren();
  for (const [label, value] of entries) {
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = value;
    list.append(term, description);
  }
}

function renderText(prompt, run) {
  const { read, unread } = splitText(prompt.text, run.input_characters_used);
  const hidden = document.createElement('span');
  hidden.className = 'unread';
  hidden.textContent = unread;
  $('#prompt-text').replaceChildren(read, hidden);
  const source = $('#prompt-source');
  source.textContent = `${prompt.source.site} · ${prompt.source.title} · ${prompt.source.license}`;
  source.href = prompt.source.url;
  $('#prompt-size').textContent =
    `${number.format(run.input_tokens_total)} tokens · ` +
    `${number.format(prompt.text.split(/\s+/).length)} palabras`;
  const warning = $('#truncation');
  warning.hidden = !run.truncated;
  warning.textContent = run.truncated
    ? `El texto supera el límite. El modelo solo lee los primeros ${number.format(run.input_tokens_used)} tokens. La parte en gris no influye en el resumen.`
    : '';
}

function renderSide(side, run, entry) {
  $(`#summary-${side}`).textContent = run.summary;
  $(`#run-info-${side}`).textContent =
    `${run.output_tokens} tokens · ${number.format(run.generation_seconds)} s`;
  $(`#stop-reason-${side}`).textContent =
    run.stop_reason === 'eos'
      ? 'El modelo terminó el resumen.'
      : 'Se alcanzó el límite de tokens. El texto puede quedar incompleto.';
  renderDefinitions(`#parameters-${side}`, [
    ['Longitud máxima', `${run.parameters.max_new_tokens} tokens`],
    ['Longitud mínima', `${run.parameters.min_new_tokens} tokens`],
    ['Haces', run.parameters.num_beams],
    ['Penalización de repetición', run.parameters.repetition_penalty],
    ['N-grama sin repetir', run.parameters.no_repeat_ngram_size],
  ]);
  renderList(`#omissions-${side}`, entry.omissions, 'No se ha anotado ninguna omisión.');
  renderList(
    `#unsupported-${side}`,
    entry.unsupported,
    'No se ha encontrado ninguna afirmación sin respaldo.',
  );
}

function renderComparison() {
  const promptId = $('#prompt').value;
  const prompt = data.prompts.find((item) => item.id === promptId);
  for (const side of ['a', 'b']) {
    const configuration = $(`#configuration-${side}`).value;
    const run = findRun(data, promptId, configuration);
    if (side === 'a') renderText(prompt, run);
    renderSide(side, run, findReview(review, promptId, configuration));
  }
}

function renderMetadata() {
  const hardware = data.runtime.hardware;
  renderDefinitions('#execution-data', [
    ['Modelo', data.model.id],
    ['Revisión', data.model.revision],
    ['Entrada máxima', `${data.model.max_input_tokens} tokens. El resto del texto se descarta.`],
    [
      'Ejecución',
      `${data.runtime.device.toUpperCase()} · ${data.model.dtype} · ${data.runtime.threads} hilos`,
    ],
    [
      'Equipo',
      `${hardware.processor}${hardware.memory_bytes ? ` · ${number.format(hardware.memory_bytes / 2 ** 30)} GiB de memoria` : ''}`,
    ],
    [
      'Dependencias',
      `Python ${data.runtime.python} · Transformers ${data.runtime.transformers} · PyTorch ${data.runtime.torch}`,
    ],
    ['Carga del modelo', `${number.format(data.load_seconds)} s`],
    ['Fecha', new Date(data.generated_at).toLocaleString('es-ES', { timeZone: 'UTC' }) + ' UTC'],
  ]);
  $('#review-status').textContent =
    review.status === 'confirmada'
      ? 'Revisión confirmada por quien firma la solución.'
      : 'Revisión preparada con un agente. Falta la confirmación de quien firma la solución.';
  $('#review-method').textContent = review.method;
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
  $('#load-status').textContent = 'Cargando los ejemplos…';
  try {
    const [results, annotations] = await Promise.all([fetchJSON(resultsURL), fetchJSON(reviewURL)]);
    data = validateResults(results);
    review = validateReview(annotations, data);
    $('#prompt').replaceChildren(
      ...data.prompts.map((prompt) => new Option(prompt.label, prompt.id)),
    );
    for (const side of ['a', 'b']) {
      $(`#configuration-${side}`).replaceChildren(
        ...data.configurations.map(
          (config) =>
            new Option(
              `${config.label} · ${config.min_new_tokens}-${config.max_new_tokens} tokens`,
              config.id,
            ),
        ),
      );
    }
    $('#configuration-b').selectedIndex = Math.min(1, data.configurations.length - 1);
    renderComparison();
    renderMetadata();
    $('#load-status').textContent =
      `${data.prompts.length} textos · ${data.runs.length} resúmenes guardados`;
    $('#explorer').hidden = false;
  } catch {
    $('#load-status').hidden = true;
    $('#load-error').hidden = false;
  }
}

for (const id of ['prompt', 'configuration-a', 'configuration-b']) {
  $(`#${id}`).addEventListener('change', renderComparison);
}
$('#retry').addEventListener('click', load);
load();
