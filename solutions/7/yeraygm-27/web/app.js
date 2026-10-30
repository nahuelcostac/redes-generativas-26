import '../../../../shared/solution.css';
import catalogue from '../../../../catalogue.json';
import solution from '../solution.json';
import manifest from '../results/manifest.json';
import './styles.css';

document.title = `${solution.title} · Redes Generativas`;
document.querySelector('#catalogue-link').href = import.meta.env.BASE_URL;
document.querySelector('#issue-link').href = `${catalogue.repository}/issues/${solution.issue}`;
document.querySelector('#solution-title').textContent = solution.title;
document.querySelector('#solution-summary').textContent = solution.summary;
document.querySelector('#solution-author').textContent = `Por ${solution.author}`;
document.querySelector('#solution-mode').textContent = 'Resultados calculados previamente';

const promptSelect = document.querySelector('#prompt-select');
const seedSelect = document.querySelector('#seed-select');
const stepsSelect = document.querySelector('#steps-select');
const axisSelect = document.querySelector('#compare-axis');
const compareValue = document.querySelector('#compare-value');
const cases = manifest.generations;

function unique(values) {
  return [...new Set(values)];
}

function addOptions(select, values, label = String) {
  select.replaceChildren(
    ...values.map((value) => {
      const option = document.createElement('option');
      option.value = String(value);
      option.textContent = label(value);
      return option;
    }),
  );
}

function selectedCase(seed = Number(seedSelect.value), steps = Number(stepsSelect.value)) {
  return cases.find(
    (item) => item.promptId === promptSelect.value && item.seed === seed && item.steps === steps,
  );
}

function card(item, title) {
  const figure = document.createElement('figure');
  const image = document.createElement('img');
  image.src = `../results/${item.image}`;
  const stepLabel = item.steps === 1 ? 'paso' : 'pasos';
  image.alt = `Imagen generada para «${item.prompt}», semilla ${item.seed}, ${item.steps} ${stepLabel}`;
  image.width = item.width;
  image.height = item.height;
  image.loading = 'lazy';
  const caption = document.createElement('figcaption');
  const heading = document.createElement('strong');
  heading.textContent = title;
  const params = document.createElement('span');
  params.textContent = `Semilla ${item.seed} · ${item.steps} ${stepLabel} · ${item.width} × ${item.height}`;
  caption.append(heading, params);
  figure.append(image, caption);
  return figure;
}

function render() {
  const promptCases = cases.filter((item) => item.promptId === promptSelect.value);
  const previousSeed = seedSelect.value;
  const previousSteps = stepsSelect.value;
  const seeds = unique(promptCases.map((item) => item.seed)).sort((a, b) => a - b);
  const steps = unique(promptCases.map((item) => item.steps)).sort((a, b) => a - b);
  addOptions(seedSelect, seeds);
  addOptions(stepsSelect, steps);
  if (seeds.includes(Number(previousSeed))) seedSelect.value = previousSeed;
  if (steps.includes(Number(previousSteps))) stepsSelect.value = previousSteps;

  const available = selectedCase();
  const promptDefinition = manifest.prompts.find((prompt) => prompt.id === available.promptId);
  document.querySelector('#prompt-text').textContent = promptDefinition.description;
  document.querySelector('#model-prompt').textContent = promptDefinition.modelPrompt;
  document.querySelector('#prompt-observation').textContent = promptDefinition.observation;
  const generation = document.querySelector('#generation');
  generation.replaceChildren(card(available, 'Generación seleccionada'));

  const axis = axisSelect.value;
  const base = selectedCase();
  const options =
    axis === 'seed'
      ? seeds.filter((value) => value !== base.seed)
      : steps.filter((value) => value !== base.steps);
  addOptions(compareValue, options, (value) =>
    axis === 'seed' ? `Semilla ${value}` : `${value} ${value === 1 ? 'paso' : 'pasos'}`,
  );
  const other =
    axis === 'seed'
      ? cases.find(
          (item) =>
            item.promptId === base.promptId &&
            item.seed === Number(compareValue.value) &&
            item.steps === base.steps,
        )
      : cases.find(
          (item) =>
            item.promptId === base.promptId &&
            item.seed === base.seed &&
            item.steps === Number(compareValue.value),
        );
  const comparison = document.querySelector('#comparison');
  comparison.replaceChildren(
    card(base, 'Configuración actual'),
    ...(other
      ? [
          card(
            other,
            axis === 'seed'
              ? `Semilla ${other.seed}`
              : `${other.steps} ${other.steps === 1 ? 'paso' : 'pasos'}`,
          ),
        ]
      : []),
  );
}

addOptions(
  promptSelect,
  unique(cases.map((item) => item.promptId)),
  (id) => manifest.prompts.find((prompt) => prompt.id === id).title,
);
promptSelect.addEventListener('change', render);
seedSelect.addEventListener('change', render);
stepsSelect.addEventListener('change', render);
axisSelect.addEventListener('change', render);
compareValue.addEventListener('change', render);
render();
