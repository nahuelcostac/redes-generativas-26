import '../../../../shared/solution.css';
import catalogue from '../../../../catalogue.json';
import solution from '../solution.json';
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.14.0';

document.title = `${solution.title} · Redes Generativas`;
document.querySelector('#catalogue-link').href = import.meta.env.BASE_URL;
document.querySelector('#issue-link').href = `${catalogue.repository}/issues/${solution.issue}`;
document.querySelector('#solution-title').textContent = solution.title;
document.querySelector('#solution-summary').textContent = solution.summary;
document.querySelector('#solution-author').textContent = `Por ${solution.author}`;
document.querySelector('#solution-mode').textContent =
  solution.mode === 'browser' ? 'Modelo en navegador' : 'Resultados calculados previamente';

// --- LÓGICA DE LA INTERFAZ Y MODELO (Issue #6) ---

env.allowLocalModels = false;

const btn = document.getElementById('classifyBtn');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const progressBar = document.getElementById('progressBar');
const inputText = document.getElementById('inputText');
const categoriesInput = document.getElementById('categories');

// Carga de ejemplos predefinidos
document
  .getElementById('btnEj1')
  .addEventListener(
    'click',
    () => (inputText.value = 'El delantero marcó un hat-trick en la final del torneo.'),
  );
document
  .getElementById('btnEj2')
  .addEventListener(
    'click',
    () =>
      (inputText.value =
        'Las nuevas medidas del gobierno afectarán a los presupuestos de las empresas tecnológicas de la región.'),
  );
document
  .getElementById('btnEj3')
  .addEventListener(
    'click',
    () =>
      (inputText.value =
        'Para hacer la tarta, hornea a 180 grados durante 40 minutos y decora con azúcar glas.'),
  );

let classifier;

async function initModel() {
  progressBar.style.display = 'block';
  try {
    classifier = await pipeline('zero-shot-classification', 'Xenova/mobilebert-uncased-mnli', {
      progress_callback: (x) => {
        if (x.status === 'progress') {
          progressBar.value = x.progress;
          statusEl.textContent = `Descargando pesos del modelo: ${Math.round(x.progress)}%`;
        }
      },
    });
    progressBar.style.display = 'none';
    statusEl.textContent = 'Modelo listo para usar.';
    statusEl.style.color = 'green';
    btn.disabled = false;
    btn.textContent = 'Clasificar Texto';
  } catch (error) {
    statusEl.textContent = 'Error crítico al cargar el modelo.';
    statusEl.style.color = 'red';
    console.error(error);
  }
}

btn.addEventListener('click', async () => {
  const text = inputText.value.trim();
  // Extrae las categorías, elimina espacios extra y descarta las vacías
  const categories = categoriesInput.value
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c !== '');

  if (!text) {
    statusEl.textContent = 'Error: El texto no puede estar vacío.';
    statusEl.style.color = 'red';
    return;
  }
  if (categories.length < 2) {
    statusEl.textContent = 'Error: Debes introducir al menos dos categorías válidas.';
    statusEl.style.color = 'red';
    return;
  }

  statusEl.textContent = 'Procesando clasificación...';
  statusEl.style.color = 'orange';
  btn.disabled = true;
  resultsEl.innerHTML = '';

  try {
    const start = performance.now();
    const output = await classifier(text, categories);
    const time = ((performance.now() - start) / 1000).toFixed(2);

    statusEl.textContent = `Clasificación completada en ${time} segundos.`;
    statusEl.style.color = 'green';

    output.labels.forEach((label, index) => {
      const score = (output.scores[index] * 100).toFixed(2);
      resultsEl.innerHTML += `<p style="margin: 0.2rem 0;"><strong>${label}:</strong> ${score}%</p>`;
    });
  } catch (error) {
    statusEl.textContent = 'Error de procesamiento durante la inferencia.';
    statusEl.style.color = 'red';
    console.error(error);
  } finally {
    btn.disabled = false;
  }
});

// Inicializamos el modelo al cargar la web
initModel();
