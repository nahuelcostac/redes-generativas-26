import './styles.css';
import catalogue from '../../../../catalogue.json';

const $ = (selector) => document.querySelector(selector);
$('#catalogue-link').href = `${import.meta.env.BASE_URL}#issue-3`;
$('#issue-link').href = `${catalogue.repository}/issues/3`;

const documents = [
  {
    title: 'Restablecer la contraseña',
    category: 'support',
    text: 'Si has olvidado tu contraseña, puedes crear una nueva desde el portal de identidad. Necesitarás verificar tu correo universitario.',
  },
  {
    title: 'Recuperar el acceso a la cuenta',
    category: 'support',
    text: 'La cuenta se bloquea tras varios intentos fallidos. Espera quince minutos o solicita el desbloqueo al servicio de informática.',
  },
  {
    title: 'Conectar el wifi del campus',
    category: 'campus',
    text: 'Conecta tus dispositivos a la red inalámbrica Eduroam con tu correo institucional y la contraseña de la universidad.',
  },
  {
    title: 'Horario de la biblioteca',
    category: 'study',
    text: 'La biblioteca abre de lunes a viernes hasta las diez de la noche. En época de exámenes amplía su horario también los fines de semana.',
  },
  {
    title: 'Reservar una sala de estudio',
    category: 'study',
    text: 'Puedes reservar una sala de trabajo en grupo por bloques de dos horas desde la web de la biblioteca.',
  },
  {
    title: 'Encontrar aulas libres',
    category: 'study',
    text: 'El mapa de espacios muestra aulas disponibles para estudiar entre clases y su horario de apertura.',
  },
  {
    title: 'Solicitar una beca de matrícula',
    category: 'support',
    text: 'Las ayudas económicas cubren parte o la totalidad de la matrícula según la renta familiar y los créditos aprobados.',
  },
  {
    title: 'Pedir apoyo psicológico',
    category: 'support',
    text: 'El servicio de atención psicológica ofrece orientación confidencial y una primera cita para estudiantes que lo necesiten.',
  },
  {
    title: 'Apuntarse a los equipos deportivos',
    category: 'campus',
    text: 'La universidad organiza equipos de fútbol, baloncesto y voleibol. La inscripción se realiza al comienzo de cada semestre.',
  },
  {
    title: 'Usar el comedor universitario',
    category: 'campus',
    text: 'El comedor ofrece menús diarios y opciones vegetarianas. Consulta precios y alérgenos en la aplicación del campus.',
  },
  {
    title: 'Solicitar adaptaciones académicas',
    category: 'support',
    text: 'El servicio de inclusión coordina ajustes de accesibilidad y apoyo para estudiantes con necesidades específicas.',
  },
  {
    title: 'Obtener el certificado de notas',
    category: 'study',
    text: 'Descarga tu expediente académico y certificados oficiales desde la secretaría virtual con identificación digital.',
  },
  {
    title: 'Encontrar prácticas profesionales',
    category: 'study',
    text: 'La oficina de empleo publica prácticas en empresas y asesora para preparar el currículum y las entrevistas.',
  },
  {
    title: 'Llegar al campus en autobús',
    category: 'campus',
    text: 'Varias líneas de autobús conectan el centro de la ciudad con las facultades. El abono joven permite viajar con descuento.',
  },
  {
    title: 'Denunciar acoso o discriminación',
    category: 'support',
    text: 'La unidad de igualdad ofrece atención confidencial y ayuda para comunicar situaciones de acoso o trato discriminatorio.',
  },
  {
    title: 'Pedir un préstamo de ordenador',
    category: 'campus',
    text: 'La biblioteca presta portátiles por horas a estudiantes que presentan su carné universitario.',
  },
  {
    title: 'Consultar fechas de exámenes',
    category: 'study',
    text: 'El calendario académico incluye las convocatorias, las fechas de evaluación y los plazos para cambiar de grupo.',
  },
  {
    title: 'Conocer los clubes y asociaciones',
    category: 'campus',
    text: 'Puedes participar en clubes de debate, música, ciencia y voluntariado. Las asociaciones presentan sus actividades al inicio del curso.',
  },
];

const stopWords = new Set(
  'a al algo algunas algunos ante bajo cabe cada como con contra cual cuando de del desde donde durante e el ella ellas ellos en entre era es esa esas ese esos esta estaba estas este estos fue ha hasta hay la las le les lo los más me mi mis mucho muy ni no nos o os otra otras otro otros para pero por porque que qué quien se según sin sobre su sus te tiene tu tus un una unas uno unos y ya'.split(
    ' ',
  ),
);
const normalize = (text) =>
  text
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/[a-z0-9]+/g) || [];
const keywords = (text) => [
  ...new Set(normalize(text).filter((word) => word.length > 2 && !stopWords.has(word))),
];
const names = { campus: 'Campus', study: 'Estudio', support: 'Apoyo' };
const colors = { campus: '#dc795c', study: '#477c75', support: '#8271a7' };
const title = (doc) => doc.title;
let worker;
let requestId = 0;
let busy = false;
let documentVectors;

$('#documents').innerHTML = documents
  .map((doc) => `<li><strong>${title(doc)}</strong><span>${doc.text}</span></li>`)
  .join('');

function setBusy(value) {
  busy = value;
  $('#search').disabled = value;
  $('#query').disabled = value;
  document.querySelectorAll('.suggestion').forEach((button) => {
    button.disabled = value;
  });
}

function showError(message) {
  $('#error').textContent = message;
  $('#error').hidden = false;
}

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.addEventListener('message', ({ data }) => {
    if (data.id !== requestId) return;
    if (data.type === 'progress') {
      const progress = data.progress;
      $('#progress').hidden = false;
      if (progress.status === 'progress' && Number.isFinite(progress.progress)) {
        $('#progress').value = progress.progress;
      } else {
        $('#progress').removeAttribute('value');
      }
    } else if (data.type === 'phase') {
      $('#status').textContent =
        data.phase === 'loading'
          ? 'Descargando y preparando el modelo…'
          : 'Calculando embeddings y ordenando resultados…';
      $('#progress').hidden = data.phase !== 'loading';
    } else if (data.type === 'complete') {
      documentVectors = data.documentVectors;
      renderResults($('#query').value.trim(), data.queryVector);
      $('#timing').textContent =
        `${data.reused ? 'Modelo reutilizado' : `Carga ${seconds(data.loadMs)}`} · búsqueda ${seconds(data.inferenceMs)}`;
      $('#status').textContent =
        'Búsqueda terminada. Revisa las diferencias entre los dos métodos.';
      $('#progress').hidden = true;
      setBusy(false);
    } else if (data.type === 'error') {
      fail(
        `No se pudo ejecutar el modelo. Comprueba tu conexión e inténtalo de nuevo. ${data.message}`,
      );
    }
  });
  worker.addEventListener('error', (event) => {
    event.preventDefault();
    fail(
      'No se pudo iniciar el modelo en este navegador. Prueba con una versión reciente de Chrome, Edge o Firefox.',
    );
  });
  return worker;
}

function fail(message) {
  $('#progress').hidden = true;
  $('#status').textContent = 'La búsqueda se ha detenido.';
  showError(message);
  setBusy(false);
}

const seconds = (ms) => `${(ms / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} s`;
const cosine = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);

function renderResults(query, queryVector) {
  const queryWords = keywords(query);
  const scored = documents.map((doc, index) => {
    const docWords = keywords(`${doc.title} ${doc.text}`);
    const matches = queryWords.filter((word) => docWords.includes(word));
    return {
      ...doc,
      index,
      semantic: cosine(queryVector, documentVectors[index]),
      keyword: matches.length,
      matches,
    };
  });
  if (!$('#map svg')) renderMap(documentVectors);
  const semantic = [...scored].sort((a, b) => b.semantic - a.semantic).slice(0, 3);
  const keyword = [...scored]
    .sort((a, b) => b.keyword - a.keyword || b.semantic - a.semantic)
    .slice(0, 3);
  $('#semantic-results').innerHTML = semantic
    .map(
      (item) =>
        `<li class="result-card"><div class="result-meta"><span class="category category-${item.category}">${names[item.category]}</span><span class="score">Coseno ${item.semantic.toFixed(3)}</span></div><h4>${title(item)}</h4><p>${item.text}</p><p class="explanation">${item.matches.length ? `Coincidencias exactas: ${item.matches.join(', ')}.` : 'No comparte palabras clave exactas; aparece por la cercanía de sus embeddings.'}</p></li>`,
    )
    .join('');
  $('#keyword-results').innerHTML = keyword
    .map(
      (item) =>
        `<li class="result-card"><div class="result-meta"><span class="category category-${item.category}">${names[item.category]}</span><span class="score">${item.keyword} coincidencias</span></div><h4>${title(item)}</h4><p>${item.text}</p><p class="explanation">${item.matches.length ? `Palabras compartidas: ${item.matches.join(', ')}.` : 'Sin palabras compartidas después del filtrado.'}</p></li>`,
    )
    .join('');
  $('#results-section').hidden = false;
}

function principalComponents(vectors) {
  const n = vectors.length;
  const gram = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => cosine(vectors[i], vectors[j])),
  );
  const rowMeans = gram.map((row) => row.reduce((sum, value) => sum + value, 0) / n);
  const allMean = rowMeans.reduce((sum, value) => sum + value, 0) / n;
  const centered = gram.map((row, i) =>
    row.map((value, j) => value - rowMeans[i] - rowMeans[j] + allMean),
  );
  const axes = [];
  for (let component = 0; component < 2; component++) {
    let vector = Array.from({ length: n }, (_, i) => Math.sin((i + 1) * (component + 1) * 1.71));
    for (let iteration = 0; iteration < 80; iteration++) {
      let next = centered.map((row) => row.reduce((sum, value, j) => sum + value * vector[j], 0));
      for (const axis of axes) {
        const projection = next.reduce((sum, value, i) => sum + value * axis[i], 0);
        next = next.map((value, i) => value - projection * axis[i]);
      }
      const norm = Math.hypot(...next);
      if (norm < 1e-10) break;
      vector = next.map((value) => value / norm);
    }
    const eigenvalue = vector.reduce(
      (sum, value, i) =>
        sum + value * centered[i].reduce((inner, entry, j) => inner + entry * vector[j], 0),
      0,
    );
    axes.push(vector.map((value) => value * Math.sqrt(Math.max(0, eigenvalue))));
  }
  return vectors.map((_, i) => [axes[0][i], axes[1][i]]);
}

function renderMap(vectors) {
  const points = principalComponents(vectors);
  const width = 720;
  const height = 360;
  const margin = 34;
  const xValues = points.map(([x]) => x);
  const yValues = points.map(([, y]) => y);
  const range = (values) => [Math.min(...values), Math.max(...values)];
  const [minX, maxX] = range(xValues);
  const [minY, maxY] = range(yValues);
  const scale = (value, min, max, extent) =>
    margin + ((value - min) / (max - min || 1)) * (extent - margin * 2);
  $('#map').innerHTML =
    `<svg viewBox="0 0 ${width} ${height}" role="presentation" aria-hidden="true"><line x1="${margin}" y1="${height / 2}" x2="${width - margin}" y2="${height / 2}" class="axis"/><line x1="${width / 2}" y1="${margin}" x2="${width / 2}" y2="${height - margin}" class="axis"/>${points
      .map(([x, y], index) => {
        const doc = documents[index];
        const cx = scale(x, minX, maxX, width);
        const cy = height - scale(y, minY, maxY, height);
        return `<circle cx="${cx}" cy="${cy}" r="8" fill="${colors[doc.category]}" tabindex="0"><title>${title(doc)}: ${doc.text}</title></circle>`;
      })
      .join('')}</svg>`;
}

function startSearch() {
  if (busy) return;
  const query = $('#query').value.trim();
  $('#error').hidden = true;
  if (!query) {
    showError('Escribe una consulta antes de buscar.');
    $('#query').focus();
    return;
  }
  if (keywords(query).length === 0) {
    showError('Añade alguna palabra con contenido, por ejemplo «buscar una sala para estudiar».');
    return;
  }
  $('#results-section').hidden = true;
  $('#status').textContent = 'Preparando la búsqueda…';
  setBusy(true);
  requestId++;
  getWorker().postMessage({
    type: 'embed',
    id: requestId,
    query,
    documents: documents.map((doc) => `${doc.title}. ${doc.text}`),
  });
}

$('#search').addEventListener('click', startSearch);
$('#query').addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') startSearch();
});
document.querySelectorAll('.suggestion').forEach((button) =>
  button.addEventListener('click', () => {
    $('#query').value = button.dataset.query;
    startSearch();
  }),
);
