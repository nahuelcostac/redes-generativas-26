import '../../../../shared/solution.css';
import './style.css';
import { validateManifest, comparisonImages } from './data.js';

const find = (id) => document.getElementById(id);
const resultsURL = new URL('../results/', window.location.href);
let images = [];
let available = [];
find('catalogue-link').href = import.meta.env.BASE_URL;

function options(element, values) {
  element.replaceChildren(...values.map(([value, label]) => new Option(label, value)));
}

function showCard(side) {
  const item = available.find((image) => image.id === find(`variant-${side}`).value);
  const img = find(`image-${side}`);
  const error = find(`error-${side}`);
  error.hidden = true;
  img.hidden = false;
  img.onload = () => {
    error.hidden = true;
  };
  img.onerror = () => {
    img.hidden = true;
    error.hidden = false;
    find('status').textContent =
      'Una imagen no está disponible. Puedes volver a cargar los resultados.';
    find('retry').hidden = false;
  };
  img.alt = `${item.title}. Semilla ${item.seed}, ${item.steps} ${item.steps === 1 ? 'paso' : 'pasos'}.`;
  img.src = new URL(item.file, resultsURL).href;
  const metrics = [
    ['Semilla', item.seed],
    ['Pasos', item.steps],
    ['Inferencia', `${item.inference_seconds.toLocaleString('es-ES')} s`],
    ['Resolución', `${item.width} × ${item.height}`],
  ];
  find(`metrics-${side}`).replaceChildren(
    ...metrics.map(([name, value]) => {
      const group = document.createElement('div');
      const dt = document.createElement('dt');
      const dd = document.createElement('dd');
      dt.textContent = name;
      dd.textContent = value;
      group.append(dt, dd);
      return group;
    }),
  );
  find(`metadata-${side}`).textContent = JSON.stringify(item, null, 2);
  find(`download-${side}`).href = img.src;
  find(`download-${side}`).download = item.file;
}

function compare() {
  const axis = find('axis').value;
  available = comparisonImages(images, find('example').value, axis);
  const values = available.map((image) => [
    image.id,
    `${axis === 'seed' ? 'Semilla' : 'Pasos'} ${image[axis]}`,
  ]);
  options(find('variant-a'), values);
  options(find('variant-b'), values);
  find('variant-b').selectedIndex = available.length - 1;
  find('prompt').textContent = available[0].prompt;
  find('comparison-note').textContent =
    axis === 'seed'
      ? 'Cambia la semilla. Se mantiene un paso de inferencia y el mismo texto.'
      : 'Cambian los pasos. Se mantiene la semilla 42 y el mismo texto.';
  showCard('a');
  showCard('b');
}

async function load() {
  find('status').textContent = 'Cargando los experimentos…';
  find('retry').hidden = true;
  find('experiment').hidden = true;
  find('result-links').hidden = true;
  try {
    const response = await fetch(new URL('manifest.json', resultsURL), { cache: 'no-cache' });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
      throw new Error('El registro de resultados no está disponible.');
    }
    images = validateManifest(await response.json());
    options(find('example'), [
      ...new Map(images.map((image) => [image.example, image.title])).entries(),
    ]);
    compare();
    find('experiment').hidden = false;
    find('result-links').hidden = false;
    find('status').textContent =
      `${images.length} imágenes reales disponibles. Selecciona una descripción y compara las configuraciones.`;
  } catch (error) {
    const reason =
      error instanceof SyntaxError || error instanceof TypeError
        ? 'Comprueba la conexión y el registro de resultados.'
        : error.message;
    find('status').textContent = `No se pudieron cargar los experimentos. ${reason}`;
    find('retry').hidden = false;
  }
}

find('example').addEventListener('change', compare);
find('axis').addEventListener('change', compare);
for (const side of ['a', 'b'])
  find(`variant-${side}`).addEventListener('change', () => showCard(side));
find('retry').addEventListener('click', load);
load();
