import './styles.css';
import catalogue from '../../../../catalogue.json';
import {
  MODEL,
  REVISION,
  SCALE,
  TILE_SIZE,
  HALO,
  validateFile,
  validateDimensions,
  psnr,
} from './config.mjs';

const $ = (id) => document.getElementById(id);
$('catalogue-link').href = import.meta.env.BASE_URL;
$('issue-link').href = `${catalogue.repository}/issues/11`;
const examples = [
  {
    name: 'Astronauta',
    url: new URL('../results/astronauta.png', import.meta.url).href,
    source: 'NASA, Eileen Collins. Dominio público. Recorte de scikit-image 0.19.3.',
    link: 'https://scikit-image.org/docs/0.19.x/api/skimage.data.html#skimage.data.astronaut',
  },
  {
    name: 'Café',
    url: new URL('../results/cafe.png', import.meta.url).href,
    source: 'Rachel Michetti, CC0. Recorte de scikit-image 0.19.3.',
    link: 'https://scikit-image.org/docs/0.19.x/api/skimage.data.html#skimage.data.coffee',
  },
  {
    name: 'Geometría',
    url: new URL('../results/geometria.png', import.meta.url).href,
    source: 'Patrón de prueba creado mediante código para esta solución. CC0.',
    link: 'https://github.com/nahuelcostac/redes-generativas-26',
  },
];
let input,
  reference,
  worker,
  resultUrl,
  busy = false,
  selectionId = 0;
let currentName, reportUrl;
let watchdog;
let modelReady = false;
const canvas = (width, height) => {
  const item = document.createElement('canvas');
  item.width = width;
  item.height = height;
  return item;
};
function setBusy(value) {
  busy = value;
  $('run').disabled = value || !input;
  $('file').disabled = value;
  document.querySelectorAll('.example').forEach((button) => {
    button.disabled = value;
  });
  $('cancel').hidden = !value;
}
function resetResult() {
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  if (reportUrl) URL.revokeObjectURL(reportUrl);
  resultUrl = undefined;
  reportUrl = undefined;
  $('download').hidden = true;
  $('report').hidden = true;
  $('model-label').hidden = true;
  $('download').removeAttribute('href');
  $('output-size').textContent = 'Pendiente';
  $('load-time').textContent = 'Pendiente';
  $('inference-time').textContent = 'Pendiente';
  $('metrics').textContent = '';
  $('model-layer').hidden = true;
  $('divider').hidden = true;
  $('split').disabled = true;
}
function showError(error) {
  clearTimeout(watchdog);
  $('error').textContent = error.message || String(error);
  $('error').hidden = false;
  $('status').textContent = 'No se ha podido completar la operación. Puedes volver a intentarlo.';
  $('progress').hidden = true;
  setBusy(false);
}
function renderBaseline() {
  if (!input) return;
  const mode = $('baseline').value;
  const target = $('baseline-canvas');
  target.width = input.width * SCALE;
  target.height = input.height * SCALE;
  $('wipe').style.aspectRatio = `${target.width} / ${target.height}`;
  const context = target.getContext('2d');
  context.imageSmoothingEnabled = mode !== 'input';
  context.imageSmoothingQuality = 'low';
  context.drawImage(
    mode === 'reference' && reference ? reference : input,
    0,
    0,
    target.width,
    target.height,
  );
  $('baseline-label').textContent = {
    input: 'Entrada',
    interpolation: 'Interpolación bilineal',
    reference: 'Referencia original',
  }[mode];
}
function terminate() {
  worker?.terminate();
  worker = undefined;
  modelReady = false;
  clearTimeout(watchdog);
}
function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onerror = () => {
    terminate();
    showError(
      new Error(
        'Error en el motor de procesamiento. Comprueba la conexión y la memoria disponible.',
      ),
    );
  };
  worker.onmessage = async ({ data }) => {
    if (data.type === 'loading') {
      $('status').textContent = 'Cargando Swin2SR. La primera descarga puede tardar unos minutos…';
      $('progress').removeAttribute('value');
    } else if (data.type === 'progress') {
      const progress = data.progress;
      if (progress.status === 'progress') {
        $('progress').value = progress.progress;
        $('status').textContent =
          `Descargando ${progress.file} · ${Math.round(progress.progress)} %`;
      } else if (progress.status === 'done') {
        $('status').textContent = 'Preparando el modelo en memoria…';
        $('progress').removeAttribute('value');
      }
    } else if (data.type === 'processing') {
      $('status').textContent = `Procesando bloque ${data.completed + 1} de ${data.total}…`;
      $('progress').value = (100 * data.completed) / data.total;
    } else if (data.type === 'error') {
      terminate();
      showError(new Error(`El modelo ha fallado. ${data.message}`));
    } else if (data.type === 'result') {
      clearTimeout(watchdog);
      try {
        const pixels = new Uint8ClampedArray(data.buffer);
        if (
          data.width !== input.width * SCALE ||
          data.height !== input.height * SCALE ||
          pixels.length !== data.width * data.height * 4
        )
          throw new Error('La salida no tiene las dimensiones esperadas.');
        const target = $('model-canvas');
        target.width = data.width;
        target.height = data.height;
        target.getContext('2d').putImageData(new ImageData(pixels, data.width, data.height), 0, 0);
        const blob = await new Promise((resolve) => target.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('No se ha podido crear el archivo PNG.');
        resultUrl = URL.createObjectURL(blob);
        $('download').href = resultUrl;
        $('download').hidden = false;
        $('output-size').textContent = `${data.width} × ${data.height} px`;
        $('load-time').textContent =
          `${(data.loadMs / 1000).toFixed(2)} s${modelReady ? ' · reutilizado' : ''}`;
        $('inference-time').textContent = `${(data.inferenceMs / 1000).toFixed(2)} s`;
        const reused = modelReady;
        modelReady = true;
        let scores = null;
        const interpolation = canvas(data.width, data.height);
        const interpolationContext = interpolation.getContext('2d');
        interpolationContext.imageSmoothingQuality = 'low';
        interpolationContext.drawImage(input, 0, 0, data.width, data.height);
        if (reference) {
          const truth = reference.getContext('2d').getImageData(0, 0, data.width, data.height).data;
          const baselinePixels = interpolationContext.getImageData(
            0,
            0,
            data.width,
            data.height,
          ).data;
          scores = {
            modelPsnrDb: psnr(pixels, truth),
            interpolationPsnrDb: psnr(baselinePixels, truth),
          };
          $('metrics').textContent =
            `PSNR RGB respecto a la referencia, sin recortar bordes. Modelo ${psnr(pixels, truth).toFixed(2)} dB · Interpolación ${psnr(baselinePixels, truth).toFixed(2)} dB. Una cifra mayor indica menor error de píxel, pero no garantiza más detalle real.`;
        }
        const report = {
          date: new Date().toISOString(),
          model: MODEL,
          revision: REVISION,
          transformers: '4.3.1',
          dtype: 'fp32',
          device: 'wasm',
          numThreads: 1,
          scale: SCALE,
          tileSize: TILE_SIZE,
          halo: HALO,
          source: currentName,
          inputSize: [input.width, input.height],
          outputSize: [data.width, data.height],
          browser: navigator.userAgent,
          hardwareConcurrency: navigator.hardwareConcurrency,
          loadMs: data.loadMs,
          inferenceMs: data.inferenceMs,
          reusedModel: reused,
          reduction: reference ? 'Canvas 2D, imageSmoothingQuality low, factor 0.5' : null,
          interpolation: 'Canvas 2D, imageSmoothingQuality low, factor 2',
          psnr: scores,
          images: {
            input: input.toDataURL('image/png'),
            output: target.toDataURL('image/png'),
            interpolation: interpolation.toDataURL('image/png'),
            reference: reference?.toDataURL('image/png') || null,
          },
        };
        reportUrl = URL.createObjectURL(
          new Blob([JSON.stringify(report, null, 2) + '\n'], { type: 'application/json' }),
        );
        $('report').href = reportUrl;
        $('report').hidden = false;
        $('model-label').hidden = false;
        $('model-layer').hidden = false;
        $('divider').hidden = false;
        $('split').disabled = false;
        $('progress').value = 100;
        $('status').textContent = 'Ampliación terminada. Compara el resultado o descarga el PNG.';
        setBusy(false);
      } catch (error) {
        showError(error);
      }
    }
  };
  return worker;
}
async function loadImage(source, example) {
  if (busy) return;
  const ticket = ++selectionId;
  input = undefined;
  reference = undefined;
  resetResult();
  $('views').hidden = true;
  $('empty').hidden = false;
  $('error').hidden = true;
  $('progress').hidden = true;
  $('source').textContent = '';
  $('run').disabled = true;
  $('status').textContent = 'Leyendo la imagen…';
  try {
    if (!example) validateFile(source);
    const blob = example
      ? await fetch(source).then((r) => {
          if (!r.ok) throw new Error('No se ha podido cargar el ejemplo.');
          return r.blob();
        })
      : source;
    const image = await createImageBitmap(blob);
    try {
      if (ticket !== selectionId) return;
      const width = example ? 96 : image.width;
      const height = example ? 96 : image.height;
      validateDimensions(width, height);
      input = canvas(width, height);
      const context = input.getContext('2d');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, width, height);
      context.imageSmoothingQuality = 'low';
      context.drawImage(image, 0, 0, width, height);
      if (example) {
        reference = canvas(image.width, image.height);
        reference.getContext('2d').drawImage(image, 0, 0);
        $('reference-image').src = source;
        $('source').append(document.createTextNode(`${example.source} `));
        const link = document.createElement('a');
        link.href = example.link;
        link.textContent = 'Procedencia ↗';
        $('source').append(link);
      } else {
        $('source').textContent =
          `Archivo local · ${source.name}. No se envía al servidor. La transparencia se compone sobre blanco.`;
      }
      currentName = example?.name || 'Archivo local';
      $('reference-option').disabled = !reference;
      $('reference-details').hidden = !reference;
      $('reference-details').open = false;
      $('baseline').value = 'input';
      $('input-size').textContent = `${width} × ${height} px`;
      $('input-caption').textContent = `Entrada real · ${width} × ${height} px`;
      $('input-canvas').width = width;
      $('input-canvas').height = height;
      $('input-canvas').getContext('2d').drawImage(input, 0, 0);
      $('empty').hidden = true;
      $('views').hidden = false;
      renderBaseline();
      $('status').textContent = 'Imagen preparada. Pulsa Ampliar ×2 para ejecutar el modelo.';
      $('run').disabled = false;
    } finally {
      image.close();
    }
  } catch (error) {
    if (ticket !== selectionId) return;
    input = undefined;
    const message =
      error.name === 'InvalidStateError'
        ? new Error('El archivo no contiene una imagen válida o está dañado.')
        : error;
    showError(message);
  }
}
for (const example of examples) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'example';
  const image = document.createElement('img');
  image.src = example.url;
  image.alt = '';
  image.width = 96;
  image.height = 96;
  const label = document.createElement('span');
  label.textContent = example.name;
  button.append(image, label);
  button.addEventListener('click', () => loadImage(example.url, example));
  $('examples').append(button);
}
$('file').addEventListener('change', () => {
  const file = $('file').files[0];
  if (file) loadImage(file);
  $('file').value = '';
});
$('baseline').addEventListener('change', renderBaseline);
$('split').addEventListener('input', () => {
  $('model-layer').style.clipPath = `inset(0 0 0 ${$('split').value}%)`;
  $('divider').style.left = `${$('split').value}%`;
});
$('run').addEventListener('click', () => {
  if (!input || busy) return;
  resetResult();
  $('error').hidden = true;
  $('progress').hidden = false;
  $('progress').removeAttribute('value');
  $('status').textContent = 'Preparando la ampliación…';
  setBusy(true);
  watchdog = setTimeout(() => {
    terminate();
    showError(
      new Error(
        'Se ha superado el tiempo de espera de 10 minutos. Prueba con una imagen más pequeña o revisa la conexión.',
      ),
    );
  }, 600_000);
  try {
    const data = input.getContext('2d').getImageData(0, 0, input.width, input.height).data;
    getWorker().postMessage({ buffer: data.buffer, width: input.width, height: input.height }, [
      data.buffer,
    ]);
  } catch (error) {
    terminate();
    showError(error);
  }
});
$('cancel').addEventListener('click', () => {
  terminate();
  setBusy(false);
  $('progress').hidden = true;
  $('status').textContent = 'Operación cancelada. Puedes volver a ampliar la imagen.';
});
window.addEventListener('pagehide', () => {
  terminate();
  // Al volver con el historial, los enlaces de una página en bfcache siguen siendo válidos.
  // El navegador libera sus URL al destruir el documento; resetResult libera las anteriores.
  if (busy) {
    setBusy(false);
    $('progress').hidden = true;
    $('status').textContent = 'Operación interrumpida al salir. Puedes volver a ampliar la imagen.';
  }
});
