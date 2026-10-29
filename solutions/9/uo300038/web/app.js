import './styles.css';
import catalogue from '../../../../catalogue.json';
import solution from '../solution.json';
import { DEFAULT_THRESHOLD, EXAMPLES, FORMATS } from './config.mjs';
import {
  colorFor,
  countByLabel,
  filterByThreshold,
  normalizeDetections,
  percent,
  validateDimensions,
  validateFile,
} from './detections.mjs';

const $ = (selector) => document.querySelector(selector);
$('#catalogue-link').href = `${import.meta.env.BASE_URL}#issue-${solution.issue}`;
$('#issue-link').href = `${catalogue.repository}/issues/${solution.issue}`;
const exampleButtons = [...document.querySelectorAll('[data-example]')];
const controls = [$('#image-file'), $('#choose-file'), ...exampleButtons];
let image = null;
let previewUrl = null;
let detections = [];
let worker = null;
let busy = false;
let jobId = 0;
let inferenceStart = 0;
let timer = null;
const seconds = (ms) =>
  `${(ms / 1000).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;

$('#threshold').value = String(DEFAULT_THRESHOLD);

function threshold() {
  return Number($('#threshold').value);
}

function setBusy(value) {
  busy = value;
  controls.forEach((control) => {
    control.disabled = value;
  });
  $('#drop-zone').classList.toggle('disabled', value);
  $('#detect').disabled = value || !image;
  $('#cancel').hidden = !value || !worker;
  $('.result-panel').setAttribute('aria-busy', String(value));
}

function stopTimer() {
  clearInterval(timer);
  timer = null;
}
function showError(message) {
  $('#error').textContent = message;
  $('#error').hidden = false;
}
function clearError() {
  $('#error').hidden = true;
  $('#error').textContent = '';
}

function clearResults() {
  detections = [];
  $('#boxes').replaceChildren();
  $('#rows').replaceChildren();
  $('#table').hidden = true;
  $('#summary').hidden = true;
  $('#empty').hidden = false;
  $('#empty').textContent = 'Las detecciones aparecerán aquí.';
  $('#inference-time').textContent = 'Pendiente';
}

function renderThreshold() {
  $('#threshold-value').textContent = percent(threshold());
}

function highlight(index, active) {
  document
    .querySelectorAll(`[data-index="${index}"]`)
    .forEach((element) => element.classList.toggle('active', active));
}

function render() {
  renderThreshold();
  $('#boxes').replaceChildren();
  $('#rows').replaceChildren();
  if (!image || !detections.length) return;
  const visible = filterByThreshold(detections, threshold());
  const { width, height } = image;
  visible.forEach((detection, index) => {
    const { xmin, ymin, xmax, ymax } = detection.box;
    const color = colorFor(detection.label);
    const box = document.createElement('div');
    box.className = ymin < 0.06 ? 'box label-inside' : 'box';
    box.dataset.index = String(index);
    box.style.cssText = `left:${xmin * 100}%;top:${ymin * 100}%;width:${(xmax - xmin) * 100}%;height:${(ymax - ymin) * 100}%;--box-color:${color}`;
    const tag = document.createElement('span');
    tag.className = 'box-label';
    tag.textContent = `${detection.labelEs} ${percent(detection.score)}`;
    box.append(tag);
    box.addEventListener('mouseenter', () => highlight(index, true));
    box.addEventListener('mouseleave', () => highlight(index, false));
    $('#boxes').append(box);

    const row = document.createElement('tr');
    row.dataset.index = String(index);
    row.tabIndex = 0;
    const pixels = [xmin * width, ymin * height, (xmax - xmin) * width, (ymax - ymin) * height]
      .map((value) => Math.round(value))
      .join(', ');
    const cells = [
      String(index + 1),
      `${detection.labelEs} (${detection.label})`,
      percent(detection.score),
      pixels,
    ];
    cells.forEach((text, column) => {
      const cell = document.createElement('td');
      if (column === 1) {
        const swatch = document.createElement('span');
        swatch.className = 'swatch';
        swatch.style.background = color;
        cell.append(swatch);
      }
      cell.append(text);
      row.append(cell);
    });
    for (const [event, active] of [
      ['mouseenter', true],
      ['mouseleave', false],
      ['focus', true],
      ['blur', false],
    ])
      row.addEventListener(event, () => highlight(index, active));
    $('#rows').append(row);
  });

  $('#empty').hidden = visible.length > 0;
  $('#table').hidden = visible.length === 0;
  $('#summary').hidden = false;
  if (visible.length === 0) {
    $('#empty').textContent = 'No hay detecciones con este umbral. Prueba a bajarlo.';
    $('#summary').textContent = `0 de ${detections.length} detecciones superan el umbral.`;
  } else {
    const counts = countByLabel(visible)
      .map(([name, count]) => `${count} ${name}`)
      .join(' · ');
    $('#summary').textContent =
      `${visible.length} de ${detections.length} detecciones superan el umbral. ${counts}.`;
  }
}

function readDimensions(url) {
  return new Promise((resolve, reject) => {
    const probe = new Image();
    probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
    probe.onerror = () =>
      reject(new Error('No se pudo leer la imagen. El archivo puede estar dañado.'));
    probe.src = url;
  });
}

async function loadImage(file) {
  if (busy) return;
  image = null;
  clearError();
  clearResults();
  $('#stage').hidden = true;
  $('#preview').removeAttribute('src');
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  $('#image-info').textContent = 'Ninguna imagen seleccionada.';
  setBusy(true);
  $('#cancel').hidden = true;
  try {
    validateFile(file);
    $('#status').textContent = 'Comprobando la imagen…';
    previewUrl = URL.createObjectURL(file);
    const { width, height } = await readDimensions(previewUrl);
    validateDimensions(width, height);
    image = { file, name: file.name, width, height };
    $('#preview').src = previewUrl;
    $('#preview').alt = `Imagen seleccionada: ${file.name}`;
    $('#stage').hidden = false;
    $('#caption').textContent = `${file.name} · ${width} × ${height} px`;
    $('#image-info').textContent =
      `${file.name} · ${width} × ${height} px · ${(file.size / 1024).toLocaleString('es-ES', { maximumFractionDigits: 0 })} KB`;
    $('#status').textContent = 'Imagen lista. Pulsa «Detectar objetos».';
  } catch (error) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    showError(error.message);
    $('#status').textContent = 'Selecciona otra imagen.';
  } finally {
    setBusy(false);
  }
}

async function loadExample(key) {
  if (busy) return;
  clearError();
  setBusy(true);
  $('#cancel').hidden = true;
  $('#status').textContent = 'Cargando el ejemplo…';
  try {
    const name = EXAMPLES[key];
    const response = await fetch(new URL(`../results/${name}`, window.location.href));
    if (!response.ok) throw new Error('No se pudo cargar la imagen de ejemplo.');
    const file = new File([await response.blob()], name, { type: FORMATS.jpg });
    setBusy(false);
    await loadImage(file);
  } catch (error) {
    setBusy(false);
    showError(error.message);
    $('#status').textContent = 'No se pudo cargar el ejemplo.';
  }
}

function createWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.addEventListener('message', ({ data }) => {
    if (data.id !== jobId) return;
    if (data.type === 'progress') {
      const progress = data.progress;
      $('#download-progress').hidden = false;
      if (progress.status === 'progress' && Number.isFinite(progress.progress)) {
        $('#model-progress').value = progress.progress;
        $('#progress-detail').textContent = `${progress.file} · ${Math.round(progress.progress)} %`;
      } else {
        $('#model-progress').removeAttribute('value');
        $('#progress-detail').textContent = progress.file || 'Preparando el modelo…';
      }
    } else if (data.type === 'phase') {
      if (data.phase === 'loading') {
        $('#status').textContent = 'Descargando y preparando el modelo…';
        $('#download-progress').hidden = false;
        $('#model-progress').removeAttribute('value');
      } else {
        $('#download-progress').hidden = true;
        $('#load-time').textContent = data.reused ? 'Ya cargado' : seconds(data.loadMs);
        $('#status').textContent = 'Detectando objetos…';
        inferenceStart = performance.now();
        timer = setInterval(() => {
          $('#inference-time').textContent = seconds(performance.now() - inferenceStart);
        }, 250);
      }
    } else if (data.type === 'complete') {
      stopTimer();
      $('#download-progress').hidden = true;
      $('#load-time').textContent = data.reused ? 'Ya cargado' : seconds(data.loadMs);
      $('#inference-time').textContent = seconds(data.inferenceMs);
      try {
        detections = normalizeDetections(data.detections);
      } catch (error) {
        fail(error.message);
        return;
      }
      render();
      $('#status').textContent = detections.length
        ? 'Detección terminada. Mueve el umbral para filtrar los resultados.'
        : 'El modelo no ha encontrado objetos en esta imagen.';
      if (!detections.length) {
        $('#empty').hidden = false;
        $('#empty').textContent = 'El modelo no ha encontrado objetos en esta imagen.';
      }
      setBusy(false);
    } else if (data.type === 'error') {
      fail(
        `No se pudo ejecutar el modelo. Comprueba la conexión y vuelve a intentarlo. ${data.message}`,
      );
    }
  });
  worker.addEventListener('error', (event) => {
    event.preventDefault();
    fail(
      'No se pudo iniciar el modelo en este navegador. Vuelve a intentarlo o prueba en otro navegador actualizado.',
    );
  });
  return worker;
}

function fail(message) {
  stopTimer();
  worker?.terminate();
  worker = null;
  $('#download-progress').hidden = true;
  $('#status').textContent = 'La detección se ha detenido.';
  showError(message);
  setBusy(false);
}

$('#choose-file').addEventListener('click', () => {
  $('#image-file').value = '';
  $('#image-file').click();
});
$('#image-file').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) loadImage(file);
});
const dropZone = $('#drop-zone');
dropZone.addEventListener('dragover', (event) => {
  event.preventDefault();
  if (!busy) dropZone.classList.add('dragging');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropZone.classList.remove('dragging');
  const file = event.dataTransfer.files[0];
  if (file) loadImage(file);
});
exampleButtons.forEach((button) =>
  button.addEventListener('click', () => loadExample(button.dataset.example)),
);
$('#threshold').addEventListener('input', render);
$('#detect').addEventListener('click', () => {
  if (!image || busy) return;
  clearError();
  clearResults();
  try {
    const currentWorker = createWorker();
    jobId++;
    setBusy(true);
    $('#status').textContent = 'Preparando la detección…';
    currentWorker.postMessage({ type: 'detect', id: jobId, image: image.file });
  } catch (error) {
    fail(error.message);
  }
});
$('#cancel').addEventListener('click', () => {
  jobId++;
  worker?.terminate();
  worker = null;
  stopTimer();
  $('#download-progress').hidden = true;
  $('#load-time').textContent = 'Pendiente';
  $('#inference-time').textContent = 'Pendiente';
  $('#status').textContent = 'Detección cancelada.';
  setBusy(false);
});
renderThreshold();
