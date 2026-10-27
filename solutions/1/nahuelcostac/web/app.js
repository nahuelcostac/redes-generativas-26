import './styles.css';
import catalogue from '../../../../catalogue.json';
import { SAMPLE_RATE } from './config.mjs';
import { validateFile, monoSamples } from './audio.mjs';

const $ = (selector) => document.querySelector(selector);
$('#catalogue-link').href = `${import.meta.env.BASE_URL}#issue-1`;
$('#issue-link').href = `${catalogue.repository}/issues/1`;
const controls = [$('#audio-file'), $('#choose-file'), $('#example-clean'), $('#example-noisy')];
let audio = null;
let previewUrl = null;
let worker = null;
let busy = false;
let jobId = 0;
let inferenceStart = 0;
let timer = null;
const seconds = (ms) =>
  `${(ms / 1000).toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;

function setBusy(value) {
  busy = value;
  controls.forEach((control) => {
    control.disabled = value;
  });
  $('#transcribe').disabled = value || !audio;
  $('#cancel').hidden = !value || !worker;
  $('.text-panel').setAttribute('aria-busy', String(value));
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

async function loadAudio(file) {
  if (busy) return;
  audio = null;
  clearError();
  $('#transcript').value = '';
  $('#download-text').disabled = true;
  $('#load-time').textContent = 'Pendiente';
  $('#inference-time').textContent = 'Pendiente';
  $('#download-progress').hidden = true;
  $('#audio-preview').hidden = true;
  $('#audio-preview').pause();
  $('#audio-preview').removeAttribute('src');
  $('#audio-preview').load();
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  $('#audio-info').textContent = 'Ningún audio seleccionado.';
  let context;
  setBusy(true);
  $('#cancel').hidden = true;
  try {
    validateFile(file);
    $('#status').textContent = 'Comprobando el audio…';
    context = new AudioContext({ sampleRate: SAMPLE_RATE });
    let buffer;
    try {
      buffer = await context.decodeAudioData(await file.arrayBuffer());
    } catch {
      throw new Error('No se pudo decodificar el audio. Prueba con un archivo WAV o MP3 válido.');
    }
    audio = { samples: monoSamples(buffer), name: file.name, duration: buffer.duration };
    previewUrl = URL.createObjectURL(file);
    $('#audio-preview').src = previewUrl;
    $('#audio-preview').hidden = false;
    $('#audio-info').textContent = `${file.name} · ${seconds(buffer.duration * 1000)}`;
    $('#status').textContent = 'Audio listo para transcribir.';
  } catch (error) {
    showError(error.message);
    $('#status').textContent = 'Selecciona otro archivo.';
  } finally {
    if (context) await context.close();
    setBusy(false);
  }
}

async function example(name) {
  if (busy) return;
  clearError();
  setBusy(true);
  $('#cancel').hidden = true;
  $('#status').textContent = 'Cargando el ejemplo…';
  try {
    const response = await fetch(new URL(`../results/${name}`, window.location.href));
    if (!response.ok) throw new Error('No se pudo cargar el audio de ejemplo.');
    const file = new File([await response.blob()], name, { type: 'audio/wav' });
    setBusy(false);
    await loadAudio(file);
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
        $('#status').textContent = 'Transcribiendo…';
        inferenceStart = performance.now();
        timer = setInterval(() => {
          $('#inference-time').textContent = seconds(performance.now() - inferenceStart);
        }, 250);
      }
    } else if (data.type === 'complete') {
      stopTimer();
      $('#download-progress').hidden = true;
      $('#transcript').value = data.text;
      $('#download-text').disabled = !data.text;
      $('#load-time').textContent = data.reused ? 'Ya cargado' : seconds(data.loadMs);
      $('#inference-time').textContent = seconds(data.inferenceMs);
      $('#status').textContent = data.text
        ? 'Transcripción terminada.'
        : 'El modelo no ha devuelto texto para este audio.';
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
  $('#status').textContent = 'La transcripción se ha detenido.';
  showError(message);
  setBusy(false);
}

$('#choose-file').addEventListener('click', () => {
  $('#audio-file').value = '';
  $('#audio-file').click();
});
$('#audio-file').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) loadAudio(file);
});
$('#example-clean').addEventListener('click', () => example('ejemplo-es.wav'));
$('#example-noisy').addEventListener('click', () => example('ejemplo-ruido.wav'));
$('#transcribe').addEventListener('click', () => {
  if (!audio || busy) return;
  clearError();
  $('#transcript').value = '';
  $('#download-text').disabled = true;
  $('#inference-time').textContent = 'Pendiente';
  const samples = audio.samples.slice();
  try {
    const currentWorker = createWorker();
    jobId++;
    setBusy(true);
    $('#status').textContent = 'Preparando la transcripción…';
    currentWorker.postMessage({ type: 'transcribe', id: jobId, audio: samples }, [samples.buffer]);
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
  $('#status').textContent = 'Transcripción cancelada.';
  setBusy(false);
});
$('#download-text').addEventListener('click', () => {
  const url = URL.createObjectURL(
    new Blob([$('#transcript').value], { type: 'text/plain;charset=utf-8' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `${audio.name.replace(/\.[^.]+$/, '')}.txt`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
