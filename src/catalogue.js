import './styles.css';
import catalogue from '../catalogue.json';
import { filterIssues, groupIssues, modeLabels } from './issue-search.mjs';

const modules = import.meta.glob('../solutions/*/*/solution.json', {
  eager: true,
  import: 'default',
});
const solutions = Object.entries(modules).map(([path, data]) => ({
  ...data,
  folder: path.replace('../', '').replace('/solution.json', ''),
}));
const search = document.querySelector('#issue-search');
const modeFilter = document.querySelector('#mode-filter');

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function link(text, href, className = 'text-link') {
  const node = element('a', className, text);
  node.href = href;
  return node;
}

function issueRow(issue) {
  const row = element('article', 'issue-row');
  row.id = `issue-${issue.number}`;
  row.tabIndex = -1;
  row.setAttribute('aria-labelledby', `issue-title-${issue.number}`);
  const meta = element('div', 'issue-meta');
  meta.append(
    element('span', 'issue-number', `Issue ${issue.displayNumber}`),
    element('span', 'issue-mode', modeLabels[issue.mode]),
  );
  const heading = element('h3', '', issue.title);
  heading.id = `issue-title-${issue.number}`;
  const actions = element('div', 'issue-actions');
  actions.append(link('Ver issue en GitHub ↗', `${catalogue.repository}/issues/${issue.number}`));
  row.append(meta, heading, element('p', '', issue.summary), actions);
  const contributions = solutions.filter((solution) => solution.issue === issue.number);
  if (contributions.length) {
    const list = element('ul', 'contribution-list');
    list.setAttribute('aria-label', `Contribuciones a la issue ${issue.displayNumber}`);
    for (const contribution of contributions) {
      const item = element('li');
      item.append(element('span', 'contribution-author', contribution.author));
      if (contribution.status === 'ready')
        item.append(
          link(
            'Abrir solución →',
            `${import.meta.env.BASE_URL}${contribution.folder}/${contribution.entry}`,
          ),
        );
      else item.append(element('span', 'contribution-status', 'En desarrollo'));
      item.append(link('Código ↗', `${catalogue.repository}/tree/main/${contribution.folder}`));
      list.append(item);
    }
    row.append(list);
  }
  return row;
}

function renderSection(state, issues) {
  document.querySelector(`#${state}-list`).replaceChildren(...issues.map(issueRow));
  document.querySelector(`#${state}-count`).textContent = String(issues.length);
  const empty = document.querySelector(`#${state}-empty`);
  empty.hidden = issues.length > 0;
  const filtering = search.value.trim() || modeFilter.value !== 'all';
  empty.textContent = filtering
    ? 'No hay coincidencias en este apartado.'
    : state === 'open'
      ? 'No hay issues abiertas.'
      : 'No hay issues resueltas.';
}

function render() {
  const issues = filterIssues(catalogue.issues, solutions, search.value, modeFilter.value);
  const groups = groupIssues(issues);
  renderSection('open', groups.open);
  renderSection('closed', groups.closed);
  document.querySelector('#open-total').textContent = String(groups.open.length);
  document.querySelector('#closed-total').textContent = String(groups.closed.length);
  document.querySelector('#clear-search').hidden = !search.value;
  document.querySelector('#search-status').textContent =
    `${issues.length} ${issues.length === 1 ? 'issue encontrada' : 'issues encontradas'}.`;
  const index = [...groups.open, ...groups.closed].map((issue) => {
    const anchor = link('', `#issue-${issue.number}`, 'index-link');
    anchor.append(
      element('span', 'index-number', String(issue.displayNumber).padStart(2, '0')),
      element('span', '', issue.title),
    );
    if (window.location.hash === `#issue-${issue.number}`)
      anchor.setAttribute('aria-current', 'location');
    anchor.addEventListener('click', () => {
      document
        .querySelectorAll('.index-link')
        .forEach((item) => item.removeAttribute('aria-current'));
      anchor.setAttribute('aria-current', 'location');
      document.querySelector(`#issue-${issue.number}`).focus({ preventScroll: true });
    });
    return anchor;
  });
  document.querySelector('#issue-index').replaceChildren(...index);
  document.querySelector('#index-empty').hidden = issues.length > 0;
}

search.addEventListener('input', render);
modeFilter.addEventListener('change', render);
document.querySelector('#clear-search').addEventListener('click', () => {
  search.value = '';
  render();
  search.focus();
});
search.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    search.value = '';
    render();
  }
});
document.querySelector('#course-link').href = catalogue.course;
document.querySelector('#repository-link').href = catalogue.repository;
document.querySelector('#issues-link').href = `${catalogue.repository}/issues`;
render();
