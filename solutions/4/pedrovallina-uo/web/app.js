import '../../../../shared/solution.css';
import './style.css';
import catalogue from '../../../../catalogue.json';
import solution from '../solution.json';

document.title = `${solution.title} · Redes Generativas`;
document.querySelector('#catalogue-link').href = import.meta.env.BASE_URL;
document.querySelector('#issue-link').href = `${catalogue.repository}/issues/${solution.issue}`;
document.querySelector('#solution-title').textContent = solution.title;
document.querySelector('#solution-summary').textContent = solution.summary;
document.querySelector('#solution-author').textContent = `Por ${solution.author}`;
document.querySelector('#solution-mode').textContent = 'Resultados calculados previamente';

const status = document.querySelector('#status');
const detail = document.querySelector('#detail');
const imageList = document.querySelector('#image-list');
const imageElement = document.querySelector('#selected-image');
const captions = document.querySelector('#captions');
const metadataList = document.querySelector('#metadata-list');
let dataset;

function addDefinition(list, label, value) {
  const term = document.createElement('dt');
  const description = document.createElement('dd');
  term.textContent = label;
  description.textContent = value;
  list.append(term, description);
}

function renderImageList() {
  imageList.replaceChildren();
  dataset.images.forEach((image, index) => {
    const button = document.createElement('button');
    button.className = 'image-choice';
    button.type = 'button';
    button.setAttribute('role', 'listitem');
    button.setAttribute('aria-pressed', String(index === 0));
    button.dataset.imageId = image.id;
    const thumbnail = document.createElement('img');
    thumbnail.src = `../results/${image.file}`;
    thumbnail.alt = '';
    thumbnail.loading = 'lazy';
    const text = document.createElement('span');
    const title = document.createElement('strong');
    const kind = document.createElement('small');
    title.textContent = image.title;
    kind.textContent = image.kind;
    text.append(title, kind);
    button.append(thumbnail, text);
    button.addEventListener('click', () => selectImage(image.id));
    imageList.append(button);
  });
  document.querySelector('#image-count').textContent = `${dataset.images.length} imágenes`;
}

function selectImage(id) {
  const image = dataset.images.find((item) => item.id === id);
  if (!image) return;
  imageList.querySelectorAll('.image-choice').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.imageId === id));
  });
  imageElement.src = `../results/${image.file}`;
  imageElement.alt = image.alt;
  document.querySelector('#selected-title').textContent = image.title;
  document.querySelector('#image-kind').textContent = image.kind;
  document.querySelector('#caption-count').textContent = `${image.captions.length} configuraciones`;
  document.querySelector('#source-link').href = image.source.url;
  document.querySelector('#source-link').textContent = `Fuente: ${image.source.label} ↗`;
  captions.replaceChildren();

  image.captions.forEach((caption) => {
    const article = document.createElement('article');
    article.className = 'caption-card';
    const heading = document.createElement('div');
    heading.className = 'caption-card-heading';
    const label = document.createElement('h3');
    const time = document.createElement('span');
    label.textContent = caption.label;
    time.textContent = `${caption.elapsedSeconds.toFixed(2)} s`;
    heading.append(label, time);
    const quote = document.createElement('p');
    quote.className = 'caption-text';
    quote.textContent = caption.generatedText;
    const params = document.createElement('dl');
    params.className = 'parameter-list';
    addDefinition(params, 'Búsqueda', caption.parameters.search);
    addDefinition(params, 'Haces', String(caption.parameters.numBeams));
    addDefinition(params, 'Tokens nuevos', String(caption.parameters.maxNewTokens));
    if (caption.parameters.doSample) {
      addDefinition(params, 'Temperatura', String(caption.parameters.temperature));
      addDefinition(params, 'Top-k', String(caption.parameters.topK));
      addDefinition(params, 'Semilla', String(caption.parameters.seed));
    }
    article.append(heading, quote, params);
    captions.append(article);
  });

  metadataList.replaceChildren();
  addDefinition(metadataList, 'Modelo', dataset.model.id);
  addDefinition(metadataList, 'Revisión', dataset.model.revision);
  addDefinition(metadataList, 'Modelo base', dataset.model.baseModel);
  addDefinition(metadataList, 'Arquitectura', dataset.model.architecture);
  addDefinition(metadataList, 'Librería', `Transformers.js ${dataset.runtime.transformers}`);
  addDefinition(metadataList, 'Ejecución', dataset.runtime.device);
  addDefinition(metadataList, 'Equipo', dataset.runtime.hardware);
  addDefinition(metadataList, 'Sistema', dataset.runtime.platform);
  addDefinition(metadataList, 'Fecha de ejecución', dataset.generatedAt);
  addDefinition(metadataList, 'Licencia del modelo', dataset.model.license);
  detail.hidden = false;
}

async function loadResults() {
  status.textContent = 'Cargando resultados…';
  status.className = 'status';
  try {
    const response = await fetch(new URL('../results/examples.json', window.location.href));
    if (!response.ok)
      throw new Error(`No se pudo leer results/examples.json (${response.status}).`);
    dataset = await response.json();
    if (!Array.isArray(dataset.images) || dataset.images.length === 0)
      throw new Error('El archivo de resultados no contiene imágenes.');
    for (const image of dataset.images) {
      if (!image.id || !image.file || !Array.isArray(image.captions) || image.captions.length < 2)
        throw new Error('Hay una imagen con datos incompletos.');
    }
    renderImageList();
    selectImage(dataset.images[0].id);
    status.hidden = true;
  } catch (error) {
    detail.hidden = true;
    status.hidden = false;
    status.className = 'status error';
    status.replaceChildren();
    const message = document.createElement('p');
    const retry = document.createElement('button');
    message.textContent = `No se pudieron cargar las descripciones. ${error.message}`;
    retry.className = 'retry-button';
    retry.type = 'button';
    retry.textContent = 'Volver a cargar';
    retry.addEventListener('click', loadResults);
    status.append(message, retry);
  }
}

loadResults();
