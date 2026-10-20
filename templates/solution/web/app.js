import '../../../../shared/solution.css';
import catalogue from '../../../../catalogue.json';
import solution from '../solution.json';

document.title = `${solution.title} · Redes Generativas`;
document.querySelector('#catalogue-link').href = import.meta.env.BASE_URL;
document.querySelector('#issue-link').href = `${catalogue.repository}/issues/${solution.issue}`;
document.querySelector('#solution-title').textContent = solution.title;
document.querySelector('#solution-summary').textContent = solution.summary;
document.querySelector('#solution-author').textContent = `Por ${solution.author}`;
document.querySelector('#solution-mode').textContent =
  solution.mode === 'browser' ? 'Modelo en navegador' : 'Resultados calculados previamente';

// Añade aquí la lógica de la interfaz. Puedes separar el código en otros módulos.
