import '../../../../shared/solution.css';
import './style.css';
import { validateFile, validateDimensions, validateAnimation } from './validation.js';
const $ = (s) => document.querySelector(s);
$('#catalogue-link').href = import.meta.env.BASE_URL;
const original = $('#original'),
  result = $('#result');
let worker,
  sourceName,
  outputURL,
  record,
  started,
  busy = false,
  selection = 0;
function status(message) {
  $('#status').textContent = message;
}
function error(message) {
  $('#error').textContent = message;
  $('#error').hidden = !message;
}
function lock(value) {
  busy = value;
  $('#file').disabled = value;
  document.querySelectorAll('[data-example], #invalid').forEach((b) => {
    b.disabled = value;
  });
  $('#remove').disabled = value || original.hidden;
  $('#cancel').hidden = !value;
  $('#progress').hidden = !value;
}
function clearResult() {
  if (outputURL) URL.revokeObjectURL(outputURL);
  outputURL = undefined;
  record = undefined;
  result.hidden = true;
  $('#result-empty').hidden = false;
  $('#download').hidden = true;
  $('#download').removeAttribute('href');
  $('#report').hidden = true;
  $('#timing').textContent = '';
}
async function selectFile(file) {
  if (busy) return;
  const token = ++selection;
  clearResult();
  error('');
  original.hidden = true;
  $('#original-empty').hidden = false;
  $('#remove').disabled = true;
  $('#selected').textContent = 'Leyendo imagen…';
  let bitmap;
  try {
    validateFile(file);
    validateAnimation(await file.arrayBuffer(), file.type);
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    if (token !== selection) return;
    validateDimensions(bitmap.width, bitmap.height);
    original.width = bitmap.width;
    original.height = bitmap.height;
    original.getContext('2d').drawImage(bitmap, 0, 0);
    original.hidden = false;
    $('#original-empty').hidden = true;
    sourceName = file.name;
    $('#selected').textContent = `${file.name} · ${bitmap.width} × ${bitmap.height} píxeles`;
    $('#remove').disabled = false;
    status('Imagen preparada. Pulsa Eliminar fondo.');
  } catch (cause) {
    if (token !== selection) return;
    error(
      cause.name === 'InvalidStateError'
        ? 'El archivo no contiene una imagen válida o está dañado.'
        : cause.message,
    );
    $('#selected').textContent = 'No hay una imagen válida seleccionada.';
    status('Elige otra imagen para continuar.');
  } finally {
    bitmap?.close();
  }
}
$('#file').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) selectFile(file);
  event.target.value = '';
});
document.querySelectorAll('[data-example]').forEach((button) => {
  button.addEventListener('click', async () => {
    lock(true);
    error('');
    status('Cargando ejemplo…');
    try {
      const response = await fetch(
        new URL(`../results/${button.dataset.example}`, import.meta.url),
      );
      if (!response.ok)
        throw new Error('No se pudo cargar el ejemplo. Prueba con un archivo local.');
      const file = new File([await response.blob()], button.dataset.example, {
        type: 'image/jpeg',
      });
      lock(false);
      await selectFile(file);
    } catch (cause) {
      error(cause.message);
      status('No se pudo cargar el ejemplo.');
    } finally {
      lock(false);
    }
  });
});
$('#invalid').addEventListener('click', () =>
  selectFile(new File(['Esto no es una imagen.'], 'entrada-invalida.txt', { type: 'text/plain' })),
);
function fail(message) {
  error(message);
  status('No se ha generado un resultado. Puedes volver a intentarlo.');
  worker?.terminate();
  worker = undefined;
  lock(false);
}
function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./model-worker.js', import.meta.url), { type: 'module' });
  worker.onerror = () =>
    fail('No se pudo ejecutar el modelo. Comprueba la conexión y la memoria disponible.');
  worker.onmessage = async ({ data }) => {
    if (data.type === 'loading')
      status('Cargando modelo. La primera descarga puede tardar varios minutos…');
    if (data.type === 'progress') {
      const p = data.progress;
      if (p.status === 'progress') {
        status(`Descargando ${p.file} · ${Math.round(p.progress)} % de este archivo`);
        $('#progress').value = p.progress;
      } else {
        $('#progress').removeAttribute('value');
        if (p.status === 'done') status('Archivo descargado. Preparando el modelo…');
      }
    }
    if (data.type === 'processing') {
      status('Eliminando el fondo en este dispositivo…');
      $('#progress').removeAttribute('value');
    }
    if (data.type === 'error')
      fail(
        `Error del modelo. Comprueba la conexión y vuelve a intentarlo. Detalle: ${data.message}`,
      );
    if (data.type === 'result') {
      try {
        result.width = data.width;
        result.height = data.height;
        const mask = document.createElement('canvas');
        mask.width = data.width;
        mask.height = data.height;
        mask
          .getContext('2d')
          .putImageData(
            new ImageData(new Uint8ClampedArray(data.buffer), data.width, data.height),
            0,
            0,
          );
        const ctx = result.getContext('2d');
        ctx.drawImage(original, 0, 0);
        // Combina la máscara con la transparencia que ya tenía la entrada.
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(mask, 0, 0);
        ctx.globalCompositeOperation = 'source-over';
        const blob = await new Promise((resolve) => result.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('No se pudo crear el PNG.');
        outputURL = URL.createObjectURL(blob);
        $('#download').href = outputURL;
        $('#download').download = `${sourceName.replace(/\.[^.]+$/, '')}-sin-fondo.png`;
        $('#download').hidden = false;
        result.hidden = false;
        $('#result-empty').hidden = true;
        record = {
          date: new Date().toISOString(),
          input: sourceName,
          width: data.width,
          height: data.height,
          model: data.model,
          revision: data.revision,
          transformers: '4.3.1',
          device: 'wasm',
          dtype: 'fp32',
          modelLoadMs: data.loadMs,
          inferenceMs: data.inferenceMs,
          totalMs: performance.now() - started,
          browser: navigator.userAgent,
          threads: navigator.hardwareConcurrency,
          review: 'Pendiente de revisión visual de contornos por el usuario.',
        };
        $('#timing').textContent =
          `Carga del modelo ${(data.loadMs / 1000).toFixed(2)} s · Inferencia ${(data.inferenceMs / 1000).toFixed(2)} s · Total ${(record.totalMs / 1000).toFixed(2)} s`;
        $('#report').hidden = false;
        status('Resultado listo. Revisa los contornos antes de descargarlo.');
      } catch (cause) {
        clearResult();
        fail(cause.message);
      } finally {
        lock(false);
      }
    }
  };
  return worker;
}
$('#remove').addEventListener('click', () => {
  if (busy || original.hidden) return;
  clearResult();
  error('');
  lock(true);
  started = performance.now();
  status('Preparando el modelo…');
  $('#progress').removeAttribute('value');
  try {
    const { data } = original.getContext('2d').getImageData(0, 0, original.width, original.height);
    getWorker().postMessage(
      { buffer: data.buffer, width: original.width, height: original.height },
      [data.buffer],
    );
  } catch (cause) {
    fail(cause.message);
  }
});
$('#cancel').addEventListener('click', () => {
  worker?.terminate();
  worker = undefined;
  lock(false);
  status('Procesamiento cancelado. Puedes volver a intentarlo.');
});
$('#report').addEventListener('click', () => {
  if (!record) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = 'registro-eliminar-fondo.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
