import './styles.css';
import catalogue from '../../../../catalogue.json';
import { DEFAULT_THRESHOLD } from './config.mjs';
import { validateFile, validateSize, filterByThreshold } from './detections.mjs';
import examples from '../results/examples.json';

const $ = (selector) => document.querySelector(selector);
$('#catalogue-link').href = `${import.meta.env.BASE_URL}#issue-9`;
$('#issue-link').href = `${catalogue.repository}/issues/9`;
const controls = [$('#image-file'), $('#choose-file')];
let image = null;
let previewUrl = null;
let detections = null;
let worker = null;
let busy = false;
let jobId = 0;
let inferenceStart = 0;
let timer = null;
const seconds = (ms) =>
  `${(ms / 1000).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
const decimal = (value) =>
  value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function setBusy(value) {
  busy = value;
  controls.forEach((control) => {
    control.disabled = value;
  });
  document.querySelectorAll('[data-example]').forEach((button) => {
    button.disabled = value;
  });
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

function render() {
  const boxes = $('#boxes');
  const list = $('#detection-list');
  boxes.replaceChildren();
  list.replaceChildren();
  if (!detections) {
    $('#count').textContent = '';
    return;
  }
  const visible = filterByThreshold(detections, Number($('#threshold').value));
  visible.forEach(({ label, score, box }, index) => {
    const element = document.createElement('div');
    element.className = 'box';
    element.style.left = `${box.xmin * 100}%`;
    element.style.top = `${box.ymin * 100}%`;
    element.style.width = `${(box.xmax - box.xmin) * 100}%`;
    element.style.height = `${(box.ymax - box.ymin) * 100}%`;
    element.dataset.hue = String((index * 47) % 360);
    element.style.setProperty('--hue', element.dataset.hue);
    const tag = document.createElement('span');
    tag.textContent = `${label} ${decimal(score)}`;
    element.append(tag);
    boxes.append(element);
    const item = document.createElement('li');
    item.textContent = `${label} · ${decimal(score)}`;
    item.style.setProperty('--hue', element.dataset.hue);
    list.append(item);
  });
  if (detections.length === 0)
    $('#count').textContent = 'El modelo no ha encontrado ningún objeto de sus categorías.';
  else if (visible.length === 0)
    $('#count').textContent =
      `Ningún objeto supera el umbral. Hay ${detections.length} detecciones con puntuación baja.`;
  else
    $('#count').textContent =
      `${visible.length} de ${detections.length} detecciones superan el umbral.`;
}

function resetResult() {
  detections = null;
  render();
  $('#load-time').textContent = 'Pendiente';
  $('#inference-time').textContent = 'Pendiente';
  $('#download-progress').hidden = true;
}

async function loadImage(file) {
  if (busy) return;
  image = null;
  clearError();
  resetResult();
  $('#stage').hidden = true;
  $('#placeholder').hidden = false;
  $('#preview').removeAttribute('src');
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  setBusy(true);
  $('#cancel').hidden = true;
  try {
    validateFile(file);
    $('#status').textContent = 'Comprobando la imagen…';
    const url = URL.createObjectURL(file);
    try {
      const size = await new Promise((resolve, reject) => {
        const probe = new Image();
        probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
        probe.onerror = () =>
          reject(new Error('No se pudo decodificar la imagen. Prueba con otro archivo.'));
        probe.src = url;
      });
      validateSize(size.width, size.height);
      image = { blob: file, name: file.name, ...size };
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
    previewUrl = url;
    $('#preview').src = url;
    $('#stage').hidden = false;
    $('#placeholder').hidden = true;
    $('#status').textContent =
      `${file.name} · ${image.width} × ${image.height} px. Lista para detectar.`;
  } catch (error) {
    showError(error.message);
    $('#status').textContent = 'Selecciona otra imagen.';
  } finally {
    setBusy(false);
  }
}

async function loadExample(example) {
  if (busy) return;
  clearError();
  setBusy(true);
  $('#cancel').hidden = true;
  $('#status').textContent = 'Cargando el ejemplo…';
  try {
    const response = await fetch(new URL(`../results/${example.file}`, window.location.href));
    if (!response.ok) throw new Error('No se pudo cargar la imagen de ejemplo.');
    const file = new File([await response.blob()], example.file);
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
      detections = data.detections;
      render();
      $('#load-time').textContent = data.reused ? 'Ya cargado' : seconds(data.loadMs);
      $('#inference-time').textContent = seconds(data.inferenceMs);
      $('#status').textContent = 'Detección terminada.';
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

examples.forEach((example) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'secondary';
  button.dataset.example = example.file;
  button.textContent = example.title;
  button.addEventListener('click', () => loadExample(example));
  $('#examples').append(button);
  const credit = document.createElement('li');
  credit.textContent = `${example.title} · ${example.author} · ${example.license}`;
  $('#credits-list').append(credit);
});

$('#threshold').value = String(DEFAULT_THRESHOLD);
$('#choose-file').addEventListener('click', () => {
  $('#image-file').value = '';
  $('#image-file').click();
});
$('#image-file').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) loadImage(file);
});
$('#threshold').addEventListener('input', () => {
  $('#threshold-value').textContent = decimal(Number($('#threshold').value));
  render();
});
$('#detect').addEventListener('click', () => {
  if (!image || busy) return;
  clearError();
  resetResult();
  try {
    const currentWorker = createWorker();
    jobId++;
    setBusy(true);
    $('#status').textContent = 'Preparando la detección…';
    currentWorker.postMessage({ type: 'detect', id: jobId, image: image.blob });
  } catch (error) {
    fail(error.message);
  }
});
$('#cancel').addEventListener('click', () => {
  jobId++;
  worker?.terminate();
  worker = null;
  stopTimer();
  resetResult();
  $('#status').textContent = 'Detección cancelada.';
  setBusy(false);
});
