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

const select = document.querySelector('#question-select');
const status = document.querySelector('#status');
const dataUrl = new URL('../results/examples.json', window.location.href);

function show(record) {
  document.querySelector('#answer-rag').textContent = record.answer_with_context;
  document.querySelector('#answer-base').textContent = record.answer_without_context;
  showReview(document.querySelector('#rag-review'), record.assessment?.with_context);
  showReview(document.querySelector('#base-review'), record.assessment?.without_context);
  document.querySelector('#rag-meta').textContent =
    `${record.with_context.generation_seconds.toFixed(2)} s · ${record.with_context.new_tokens} tokens`;
  document.querySelector('#base-meta').textContent =
    `${record.without_context.generation_seconds.toFixed(2)} s · ${record.without_context.new_tokens} tokens`;
  document.querySelector('#parameters').textContent = JSON.stringify(record.parameters, null, 2);
  const chunks = document.querySelector('#chunks');
  chunks.replaceChildren();
  for (const item of record.retrieved_chunks) {
    const card = document.createElement('article');
    card.className = 'chunk';
    const heading = document.createElement('h4');
    heading.textContent = `${item.document_title} · ${item.chunk_id}`;
    const meta = document.createElement('p');
    meta.className = 'chunk-meta';
    meta.textContent = `${item.source} · similitud ${item.score.toFixed(3)}`;
    const quote = document.createElement('blockquote');
    quote.textContent = item.text;
    card.append(heading, meta, quote);
    chunks.append(card);
  }
}

function showReview(element, assessment) {
  element.className = `review ${assessment?.supported === true ? 'supported' : assessment?.supported === false ? 'unsupported' : ''}`;
  element.textContent = assessment
    ? `${assessment.supported ? 'Respaldada' : 'No respaldada'}: ${assessment.note}`
    : 'Revisión manual pendiente.';
}

try {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error(`No se pudieron leer los resultados (${response.status}).`);
  const dataset = await response.json();
  if (!Array.isArray(dataset.examples) || dataset.examples.length < 3)
    throw new Error('El conjunto debe incluir tres preguntas de comprobación.');
  dataset.examples.forEach((record) => {
    const option = document.createElement('option');
    option.value = record.id;
    option.textContent = record.question;
    select.append(option);
  });
  select.addEventListener('change', () => {
    const chosen = dataset.examples.find((record) => record.id === select.value);
    if (chosen) show(chosen);
  });
  select.disabled = false;
  select.value = dataset.examples[0].id;
  show(dataset.examples[0]);
  status.textContent = `${dataset.examples.length} preguntas disponibles · ${dataset.model.generator.id} + ${dataset.model.embedding.id}`;
} catch (error) {
  status.textContent = `Resultados pendientes. Ejecuta “python code/run_rag.py” en local para generarlos. Detalle: ${error.message}`;
  select.replaceChildren(new Option('Resultados no disponibles'));
}
