import '../../../../shared/solution.css';
import './style.css';
import catalogue from '../../../../catalogue.json';
import solution from '../solution.json';
import { findRun, validateResults } from './results.mjs';

const $ = (selector) => document.querySelector(selector);
const number = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
const resultsURL = new URL('../results/examples.json', window.location.href);
let data;

$('#catalogue-link').href = `${import.meta.env.BASE_URL}#issue-${solution.issue}`;
$('#issue-link').href = `${catalogue.repository}/issues/${solution.issue}`;
$('#solution-author').textContent = `Por ${solution.author}`;
const issue = catalogue.issues.find((item) => item.number === solution.issue);
$('#solution-mode').textContent =
  `Issue ${issue.displayNumber} · Resultados calculados previamente`;
$('#instructions-link').href =
  `${catalogue.repository}/tree/main/solutions/${solution.issue}/${solution.author}#ejecutar-en-local`;

function renderComparison() {
  const promptId = $('#prompt').value;
  $('#prompt-text').textContent = data.prompts.find((prompt) => prompt.id === promptId).text;
  for (const side of ['a', 'b']) {
    const run = findRun(data, promptId, $(`#configuration-${side}`).value);
    $(`#continuation-${side}`).textContent = run.continuation || '(Sin texto visible)';
    $(`#run-info-${side}`).textContent =
      `${run.output_tokens} tokens nuevos · ${number.format(run.generation_seconds)} s · Semilla ${run.parameters.seed}`;
    $(`#stop-reason-${side}`).textContent =
      run.stop_reason === 'eos'
        ? 'El modelo terminó la generación.'
        : 'Se alcanzó el límite de tokens. El texto puede quedar incompleto.';
  }
}

function renderMetadata() {
  const hardware = data.runtime.hardware;
  const first = data.runs[0].parameters;
  const shared = data.runs.every(
    (run) =>
      run.parameters.top_p === first.top_p &&
      run.parameters.top_k === first.top_k &&
      run.parameters.repetition_penalty === first.repetition_penalty,
  );
  const entries = [
    ['Modelo', data.model.id],
    ['Revisión', data.model.revision],
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
    [
      'Muestreo',
      shared
        ? `top_p ${first.top_p} · top_k ${first.top_k} · penalización de repetición ${first.repetition_penalty}`
        : 'Parámetros completos en el JSON de resultados.',
    ],
    ['Fecha', new Date(data.generated_at).toLocaleString('es-ES', { timeZone: 'UTC' }) + ' UTC'],
  ];
  $('#execution-data').replaceChildren();
  for (const [label, value] of entries) {
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = value;
    $('#execution-data').append(term, description);
  }
}

async function load() {
  $('#load-error').hidden = true;
  $('#explorer').hidden = true;
  $('#load-status').hidden = false;
  $('#load-status').textContent = 'Cargando los ejemplos…';
  try {
    const response = await fetch(resultsURL);
    if (!response.ok) throw new Error('No se pudieron cargar los resultados.');
    data = validateResults(await response.json());
    $('#prompt').replaceChildren(
      ...data.prompts.map((prompt) => new Option(prompt.label, prompt.id)),
    );
    for (const side of ['a', 'b']) {
      $(`#configuration-${side}`).replaceChildren(
        ...data.configurations.map(
          (config) =>
            new Option(
              `Temperatura ${number.format(config.temperature)} · Máx. ${config.max_new_tokens} tokens`,
              config.id,
            ),
        ),
      );
    }
    $('#configuration-b').selectedIndex = Math.min(1, data.configurations.length - 1);
    renderComparison();
    renderMetadata();
    $('#load-status').textContent =
      `${data.prompts.length} entradas · ${data.runs.length} salidas guardadas`;
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
