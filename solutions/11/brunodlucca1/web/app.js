import './styles.css';
import catalogue from '../../../../catalogue.json';
import solution from '../solution.json';
import { SCALE, validateFile, validateSize } from './config.js';

const $ = (id) => document.getElementById(id);
const state = { input: null, worker: null, resultUrl: null, busy: false };

document.title = `${solution.title} · Redes Generativas`;
$('catalogue-link').href = import.meta.env.BASE_URL;
$('issue-link').href = `${catalogue.repository}/issues/${solution.issue}`;
$('solution-title').textContent = solution.title;
$('solution-summary').textContent = solution.summary;
$('solution-author').textContent = `Por ${solution.author} · Práctica #${solution.issue}`;
$('solution-mode').textContent = 'Modelo en navegador';

function draw(canvas, image) {
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext('2d').drawImage(image, 0, 0);
}

function setStatus(message) {
  $('status').textContent = message;
}

function showError(error) {
  $('error').textContent = error instanceof Error ? error.message : String(error);
  $('error').hidden = false;
  $('progress').hidden = true;
  setStatus(
    'No se ha podido completar la operación. Puedes elegir otra imagen o volver a intentarlo.',
  );
}

function setBusy(busy) {
  state.busy = busy;
  $('file-input').disabled = busy;
  $('example-button').disabled = busy;
  $('run-button').disabled = busy || !state.input;
  $('cancel-button').hidden = !busy;
}

function clearResult() {
  if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
  state.resultUrl = null;
  $('download-link').hidden = true;
  $('output-canvas').width = 0;
  $('output-canvas').height = 0;
  $('timing').textContent = '';
}

function closeWorker() {
  state.worker?.terminate();
  state.worker = null;
}

function renderInterpolation() {
  const output = $('interpolation-canvas');
  output.width = state.input.width * SCALE;
  output.height = state.input.height * SCALE;
  const context = output.getContext('2d');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(state.input.canvas, 0, 0, output.width, output.height);
}

function acceptImage(canvas, source) {
  validateSize(canvas.width, canvas.height);
  state.input = { canvas, width: canvas.width, height: canvas.height };
  clearResult();
  draw($('original-canvas'), canvas);
  renderInterpolation();
  $('comparison-empty').hidden = true;
  $('comparison').hidden = false;
  $('original-caption').textContent = `Entrada · ${canvas.width} × ${canvas.height} px`;
  $('dimension-note').textContent =
    `Salida prevista · ${canvas.width * SCALE} × ${canvas.height * SCALE} px`;
  $('source').textContent = source;
  $('error').hidden = true;
  setStatus('Imagen lista. Pulsa «Ampliar ×2» para descargar y ejecutar el modelo.');
  setBusy(false);
}

async function loadFile(file) {
  if (state.busy) return;
  try {
    validateFile(file);
    const bitmap = await createImageBitmap(file);
    try {
      validateSize(bitmap.width, bitmap.height);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      context.fillStyle = 'white';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0);
      acceptImage(
        canvas,
        `Archivo local · ${file.name}. La imagen se procesa solo en este navegador.`,
      );
    } finally {
      bitmap.close();
    }
  } catch (error) {
    state.input = null;
    setBusy(false);
    showError(
      error.name === 'InvalidStateError'
        ? new Error('El archivo no contiene una imagen válida.')
        : error,
    );
  }
}

function createExample() {
  const reference = document.createElement('canvas');
  reference.width = 192;
  reference.height = 128;
  const context = reference.getContext('2d');
  const sky = context.createLinearGradient(0, 0, 0, reference.height);
  sky.addColorStop(0, '#5d56a8');
  sky.addColorStop(0.55, '#eca085');
  sky.addColorStop(0.56, '#253653');
  sky.addColorStop(1, '#142034');
  context.fillStyle = sky;
  context.fillRect(0, 0, reference.width, reference.height);
  context.fillStyle = '#ffe2a3';
  context.beginPath();
  context.arc(144, 34, 17, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = '#374a67';
  for (let x = 0; x < 192; x += 12)
    context.fillRect(x, 80 - (18 + ((x * 7) % 32)), 10, 18 + ((x * 7) % 32));
  context.strokeStyle = '#f3c76f';
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(0, 122);
  context.lineTo(96, 84);
  context.lineTo(192, 122);
  context.stroke();
  context.fillStyle = '#b3d6da';
  for (let x = 8; x < 188; x += 16) context.fillRect(x, 99 + ((x / 16) % 2) * 4, 6, 3);
  const input = document.createElement('canvas');
  input.width = 96;
  input.height = 64;
  const inputContext = input.getContext('2d');
  inputContext.imageSmoothingEnabled = true;
  inputContext.imageSmoothingQuality = 'high';
  inputContext.drawImage(reference, 0, 0, input.width, input.height);
  acceptImage(input, 'Patrón de prueba generado en el navegador para esta contribución · CC0.');
}

function worker() {
  if (state.worker) return state.worker;
  const instance = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  instance.onerror = () => {
    closeWorker();
    setBusy(false);
    showError(
      new Error(
        'El motor de procesamiento se ha detenido. Revisa la memoria disponible y la conexión.',
      ),
    );
  };
  instance.onmessage = async ({ data }) => {
    if (data.type === 'status') {
      setStatus(data.message);
      return;
    }
    if (data.type === 'progress') {
      $('progress').value = data.value;
      setStatus(`Descargando ${data.file ?? 'el modelo'} · ${Math.round(data.value)} %`);
      return;
    }
    if (data.type === 'error') {
      setBusy(false);
      showError(new Error(`El modelo ha informado de un error: ${data.message}`));
      return;
    }
    if (data.type === 'result') {
      try {
        if (data.width !== state.input.width * SCALE || data.height !== state.input.height * SCALE)
          throw new Error('La salida no tiene el tamaño esperado.');
        const output = $('output-canvas');
        output.width = data.width;
        output.height = data.height;
        output
          .getContext('2d')
          .putImageData(
            new ImageData(new Uint8ClampedArray(data.pixels), data.width, data.height),
            0,
            0,
          );
        const blob = await new Promise((resolve) => output.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('No se ha podido preparar la descarga PNG.');
        state.resultUrl = URL.createObjectURL(blob);
        $('download-link').href = state.resultUrl;
        $('download-link').hidden = false;
        $('progress').value = 100;
        $('timing').textContent =
          `Carga del modelo: ${(data.loadingMs / 1000).toFixed(2)} s${data.reused ? ' (reutilizado)' : ''}. Procesamiento: ${(data.inferenceMs / 1000).toFixed(2)} s.`;
        setStatus(
          'Ampliación terminada. Compara las tres imágenes y descarga el PNG si lo necesitas.',
        );
        setBusy(false);
      } catch (error) {
        setBusy(false);
        showError(error);
      }
    }
  };
  state.worker = instance;
  return instance;
}

$('file-input').addEventListener('change', () => {
  const [file] = $('file-input').files;
  if (file) loadFile(file);
  $('file-input').value = '';
});
$('example-button').addEventListener('click', createExample);
$('run-button').addEventListener('click', () => {
  if (!state.input || state.busy) return;
  clearResult();
  $('error').hidden = true;
  $('progress').hidden = false;
  $('progress').removeAttribute('value');
  setStatus('Preparando la superresolución…');
  setBusy(true);
  const pixels = state.input.canvas
    .getContext('2d')
    .getImageData(0, 0, state.input.width, state.input.height).data;
  worker().postMessage(
    { width: state.input.width, height: state.input.height, pixels: pixels.buffer },
    [pixels.buffer],
  );
});
$('cancel-button').addEventListener('click', () => {
  closeWorker();
  setBusy(false);
  $('progress').hidden = true;
  setStatus('Operación cancelada. Puedes volver a intentarlo.');
});
window.addEventListener('pagehide', () => {
  closeWorker();
  if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
});
