import '../../../../shared/solution.css';
import './style.css';
import catalogue from '../../../../catalogue.json';
import solution from '../solution.json';
import { findCheck, findRun, validateResults } from './results.mjs';

const $ = (selector) => document.querySelector(selector);
const number = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat('es-ES', { style: 'percent', maximumFractionDigits: 0 });
const resultsURL = new URL('../results/examples.json', window.location.href);
const asrURL = new URL('../results/asr-check.json', window.location.href);
const NOTES = {
  numeros: 'El modelo no sabe leer cifras. Compara este ejemplo con «Números escritos con letras».',
  'numeros-letras':
    'Whisper escribe los números con cifras. El WER penaliza esa diferencia aunque el audio diga bien los números. Lee la transcripción.',
};
let data;
let asr;

$('#catalogue-link').href = `${import.meta.env.BASE_URL}#issue-${solution.issue}`;
$('#issue-link').href = `${catalogue.repository}/issues/${solution.issue}`;
$('#solution-author').textContent = `Por ${solution.author}`;
const issue = catalogue.issues.find((item) => item.number === solution.issue);
$('#solution-mode').textContent =
  `Issue ${issue.displayNumber} · Resultados calculados previamente`;
$('#instructions-link').href =
  `${catalogue.repository}/tree/main/solutions/${solution.issue}/${solution.author}#ejecutar-en-local`;

function definitionList(target, entries) {
  target.replaceChildren();
  for (const [label, value] of entries) {
    const term = document.createElement('dt');
    term.textContent = label;
    const description = document.createElement('dd');
    description.textContent = value;
    target.append(term, description);
  }
}

function werLevel(wer) {
  if (wer <= 0.05) return 'good';
  if (wer <= 0.2) return 'fair';
  return 'bad';
}

function renderSide(side) {
  const textId = $('#text').value;
  const run = findRun(data, textId, $(`#configuration-${side}`).value);
  const audio = $(`#audio-${side}`);
  const source = new URL(`../results/${run.audio}`, window.location.href).href;
  if (audio.src !== source) audio.src = source;
  const p = run.parameters;
  definitionList($(`#parameters-${side}`), [
    ['Velocidad', `${number.format(p.speaking_rate)}×`],
    ['Ruido de la voz', number.format(p.noise_scale)],
    ['Ruido del ritmo', number.format(p.noise_scale_duration)],
    ['Semilla', String(p.seed)],
  ]);
  $(`#run-info-${side}`).textContent =
    `${number.format(run.duration_seconds)} s de audio · ` +
    `síntesis en ${number.format(run.generation_seconds)} s`;
  const check = findCheck(asr, textId, run.configuration_id);
  $(`#asr-${side}`).textContent = check.transcript || '(Sin texto reconocido)';
  const wer = $(`#wer-${side}`);
  wer.textContent = `WER ${percent.format(check.wer)}`;
  wer.dataset.level = werLevel(check.wer);
}

function renderText() {
  const text = data.texts.find((item) => item.id === $('#text').value);
  $('#text-original').textContent = text.text;
  $('#text-model').textContent = text.model_text;
  $('#text-note').hidden = !NOTES[text.id];
  $('#text-note').textContent = NOTES[text.id] ?? '';
  renderSide('a');
  renderSide('b');
  for (const cell of document.querySelectorAll('#summary-table button')) {
    const active =
      cell.dataset.text === text.id && cell.dataset.configuration === $('#configuration-a').value;
    cell.setAttribute('aria-pressed', String(active));
  }
}

function renderTable() {
  const table = $('#summary-table');
  const head = document.createElement('tr');
  head.append(document.createElement('th'));
  for (const config of data.configurations) {
    const th = document.createElement('th');
    th.scope = 'col';
    th.textContent = config.label;
    head.append(th);
  }
  const thead = document.createElement('thead');
  thead.append(head);
  const tbody = document.createElement('tbody');
  for (const text of data.texts) {
    const row = document.createElement('tr');
    const th = document.createElement('th');
    th.scope = 'row';
    th.textContent = text.label;
    row.append(th);
    for (const config of data.configurations) {
      const check = findCheck(asr, text.id, config.id);
      const td = document.createElement('td');
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = percent.format(check.wer);
      button.dataset.level = werLevel(check.wer);
      button.dataset.text = text.id;
      button.dataset.configuration = config.id;
      button.setAttribute(
        'aria-label',
        `${text.label}, ${config.label}: WER ${button.textContent}`,
      );
      button.addEventListener('click', () => {
        $('#text').value = text.id;
        $('#configuration-a').value = config.id;
        renderText();
        $('#configuration-a').scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      td.append(button);
      row.append(td);
    }
    tbody.append(row);
  }
  table.replaceChildren(thead, tbody);
}

function renderMetadata() {
  const hardware = data.runtime.hardware;
  const totalAudio = data.runs.reduce((sum, run) => sum + run.duration_seconds, 0);
  const totalSynthesis = data.runs.reduce((sum, run) => sum + run.generation_seconds, 0);
  definitionList($('#execution-data'), [
    ['Modelo', `${data.model.id} · ${data.model.architecture} · ${data.model.license}`],
    ['Revisión', data.model.revision],
    ['Parámetros', `${number.format(data.model.parameters / 1e6)} millones`],
    ['Audio', `${data.model.sampling_rate} Hz · mono · WAV de 16 bits`],
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
      'Síntesis total',
      `${number.format(totalAudio)} s de audio en ${number.format(totalSynthesis)} s`,
    ],
    ['Comprobación', `${asr.model.id} · revisión ${asr.model.revision.slice(0, 12)}`],
    ['Fecha', new Date(data.generated_at).toLocaleString('es-ES', { timeZone: 'UTC' }) + ' UTC'],
  ]);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('No se pudieron cargar los resultados.');
  return response.json();
}

async function load() {
  $('#load-error').hidden = true;
  $('#explorer').hidden = true;
  $('#load-status').hidden = false;
  $('#load-status').textContent = 'Cargando los audios…';
  try {
    const [results, checks] = await Promise.all([fetchJson(resultsURL), fetchJson(asrURL)]);
    data = validateResults(results, checks);
    asr = checks;
    $('#text').replaceChildren(...data.texts.map((text) => new Option(text.label, text.id)));
    for (const side of ['a', 'b']) {
      $(`#configuration-${side}`).replaceChildren(
        ...data.configurations.map((config) => new Option(config.label, config.id)),
      );
    }
    $('#configuration-b').selectedIndex = Math.min(1, data.configurations.length - 1);
    renderTable();
    renderText();
    renderMetadata();
    $('#load-status').textContent =
      `${data.texts.length} textos · ${data.configurations.length} configuraciones · ${data.runs.length} audios guardados`;
    $('#explorer').hidden = false;
  } catch {
    $('#load-status').hidden = true;
    $('#load-error').hidden = false;
  }
}

$('#text').addEventListener('change', renderText);
$('#configuration-a').addEventListener('change', renderText);
$('#configuration-b').addEventListener('change', () => renderSide('b'));
for (const side of ['a', 'b']) {
  $(`#audio-${side}`).addEventListener('play', () => {
    const other = $(`#audio-${side === 'a' ? 'b' : 'a'}`);
    if (!other.paused) other.pause();
  });
}
$('#retry').addEventListener('click', load);
load();
