import '../../../../shared/solution.css';
import { pipeline } from '@huggingface/transformers';
import catalogue from '../../../../catalogue.json';
import solution from '../solution.json';
import './style.css';

document.title = `${solution.title} · Redes Generativas`;
document.querySelector('#catalogue-link').href = import.meta.env.BASE_URL;
document.querySelector('#issue-link').href = `${catalogue.repository}/issues/${solution.issue}`;
document.querySelector('#solution-title').textContent = solution.title;
document.querySelector('#solution-summary').textContent = solution.summary;
document.querySelector('#solution-author').textContent = `Por ${solution.author}`;
document.querySelector('#solution-mode').textContent = 'Modelo en navegador';

const input = document.querySelector('#image-input');
const processButton = document.querySelector('#process-button');
const downloadButton = document.querySelector('#download-button');
const status = document.querySelector('#status');
const errorBox = document.querySelector('#error');
const progress = document.querySelector('#model-progress');
const originalImage = document.querySelector('#original-image');
const resultImage = document.querySelector('#result-image');
let sourceFile = null;
let originalUrl = null;
let resultUrl = null;
let remover = null;
let running = false;

const MAX_PIXELS = 12_000_000;
const MAX_SIDE = 4096;
const acceptedTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/avif']);

function setError(message) {
  errorBox.textContent = message;
  errorBox.hidden = !message;
}

function releaseUrl(url) {
  if (url) URL.revokeObjectURL(url);
}

function checkImage(file) {
  if (!acceptedTypes.has(file.type)) {
    throw new Error('Formato no admitido. Usa una imagen PNG, JPEG, WebP o AVIF.');
  }
  return createImageBitmap(file).then((bitmap) => {
    const { width, height } = bitmap;
    bitmap.close();
    if (width > MAX_SIDE || height > MAX_SIDE || width * height > MAX_PIXELS) {
      throw new Error('La imagen supera el límite de 12 megapíxeles o 4096 píxeles por lado.');
    }
    return { width, height };
  });
}

async function selectFile(file) {
  setError('');
  downloadButton.hidden = true;
  if (!file) return;
  try {
    const { width, height } = await checkImage(file);
    sourceFile = file;
    releaseUrl(originalUrl);
    originalUrl = URL.createObjectURL(file);
    originalImage.src = originalUrl;
    originalImage.hidden = false;
    document.querySelector('#original-placeholder').hidden = true;
    resultImage.hidden = true;
    document.querySelector('#result-placeholder').hidden = false;
    releaseUrl(resultUrl);
    resultUrl = null;
    processButton.disabled = false;
    status.textContent = `Imagen lista: ${width} × ${height} píxeles.`;
  } catch (error) {
    sourceFile = null;
    processButton.disabled = true;
    status.textContent = 'No se pudo cargar la imagen.';
    setError(error.message || 'No se pudo leer el archivo como imagen.');
  }
}

input.addEventListener('change', () => selectFile(input.files?.[0]));

async function loadModel() {
  if (remover) return remover;
  progress.hidden = false;
  progress.removeAttribute('value');
  status.textContent = 'Descargando el modelo…';
  remover = await pipeline('background-removal', 'Xenova/modnet', {
    progress_callback: (event) => {
      if (event.status === 'progress' && Number.isFinite(event.progress)) {
        progress.value = Math.round(event.progress);
      }
      const filename = event.file?.split('/').at(-1);
      if (filename && Number.isFinite(event.progress)) {
        status.textContent = `Descargando ${filename}: ${Math.round(event.progress)} %`;
      }
    },
  });
  progress.value = 100;
  status.textContent = 'Modelo cargado.';
  return remover;
}

function rawImageToPng(rawImage) {
  const canvas = document.createElement('canvas');
  canvas.width = rawImage.width;
  canvas.height = rawImage.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('El navegador no ha podido crear el lienzo de imagen.');
  let rgba;
  if (rawImage.channels === 4) {
    rgba = new Uint8ClampedArray(rawImage.data);
  } else if (rawImage.channels === 3) {
    rgba = new Uint8ClampedArray(rawImage.width * rawImage.height * 4);
    for (let i = 0, j = 0; i < rawImage.data.length; i += 3, j += 4) {
      rgba[j] = rawImage.data[i];
      rgba[j + 1] = rawImage.data[i + 1];
      rgba[j + 2] = rawImage.data[i + 2];
      rgba[j + 3] = 255;
    }
  } else {
    throw new Error(
      `El modelo devolvió un resultado con ${rawImage.channels} canales; no se puede exportar.`,
    );
  }
  context.putImageData(new ImageData(rgba, rawImage.width, rawImage.height), 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo crear el PNG.'))),
      'image/png',
    );
  });
}

processButton.addEventListener('click', async () => {
  if (!sourceFile || running) return;
  running = true;
  processButton.disabled = true;
  setError('');
  progress.hidden = true;
  try {
    const model = await loadModel();
    status.textContent = 'Procesando imagen…';
    const output = await model(originalUrl);
    const blob = await rawImageToPng(output);
    releaseUrl(resultUrl);
    resultUrl = URL.createObjectURL(blob);
    resultImage.src = resultUrl;
    resultImage.hidden = false;
    document.querySelector('#result-placeholder').hidden = true;
    downloadButton.href = resultUrl;
    downloadButton.hidden = false;
    status.textContent = 'Procesamiento terminado. Comprueba los contornos y la transparencia.';
  } catch (error) {
    status.textContent = 'No se pudo procesar la imagen.';
    setError(
      `Error del modelo: ${error.message || 'fallo desconocido'}. Comprueba tu conexión y prueba con otra imagen.`,
    );
  } finally {
    running = false;
    processButton.disabled = !sourceFile;
  }
});

for (const button of document.querySelectorAll('[data-example]')) {
  button.addEventListener('click', async () => {
    try {
      const response = await fetch(button.dataset.example);
      if (!response.ok) throw new Error('No se pudo cargar la imagen de ejemplo.');
      const bitmap = await createImageBitmap(await response.blob());
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0);
      bitmap.close();
      const png = await new Promise((resolve, reject) =>
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error('No se pudo crear el ejemplo PNG.'))),
          'image/png',
        ),
      );
      await selectFile(new File([png], 'ejemplo.png', { type: 'image/png' }));
    } catch (error) {
      setError(error.message || 'No se pudo cargar la imagen de ejemplo.');
    }
  });
}
