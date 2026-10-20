import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));
export const catalogue = await readJson(resolve(root, 'catalogue.json'));
export const authorPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

export async function getSolutions() {
  const results = [];
  for (const issue of await readdir(resolve(root, 'solutions'), { withFileTypes: true })) {
    if (!issue.isDirectory()) continue;
    for (const author of await readdir(resolve(root, 'solutions', issue.name), {
      withFileTypes: true,
    })) {
      if (!author.isDirectory()) continue;
      const folder = resolve(root, 'solutions', issue.name, author.name);
      results.push({
        folder,
        issueFolder: issue.name,
        authorFolder: author.name,
        data: await readJson(resolve(folder, 'solution.json')),
      });
    }
  }
  return results;
}

export async function validate() {
  const numbers = new Set();
  const displayNumbers = new Set();
  for (const issue of catalogue.issues) {
    if (
      !Number.isSafeInteger(issue.displayNumber) ||
      issue.displayNumber < 1 ||
      displayNumbers.has(issue.displayNumber)
    )
      throw new Error('Cada issue debe tener un número visible positivo y único.');
    displayNumbers.add(issue.displayNumber);
    if (!['open', 'closed'].includes(issue.state))
      throw new Error(`Estado de GitHub incorrecto para la issue #${issue.number}.`);
    if (!Number.isSafeInteger(issue.number) || issue.number < 1 || numbers.has(issue.number))
      throw new Error('Cada issue debe tener un número positivo y único.');
    numbers.add(issue.number);
    if (
      !['browser', 'precomputed'].includes(issue.mode) ||
      !issue.title?.trim() ||
      !issue.summary?.trim()
    )
      throw new Error(`Metadatos incompletos para la issue #${issue.number}.`);
  }
  const solutions = await getSolutions();
  for (const { folder, issueFolder, authorFolder, data } of solutions) {
    const issue = catalogue.issues.find((item) => item.number === data.issue);
    if (!issue || String(data.issue) !== issueFolder)
      throw new Error(`Issue o carpeta incorrecta en ${folder}.`);
    if (!authorPattern.test(data.author) || data.author.toLowerCase() !== authorFolder)
      throw new Error(`Autor o carpeta incorrecta en ${folder}.`);
    for (const key of ['title', 'summary'])
      if (typeof data[key] !== 'string' || !data[key].trim())
        throw new Error(`Falta ${key} en ${folder}.`);
    if (data.mode !== issue.mode || !['draft', 'ready'].includes(data.status))
      throw new Error(`Modo o estado incorrecto en ${folder}.`);
    if (data.entry !== 'web/index.html')
      throw new Error(`La interfaz debe empezar en web/index.html en ${folder}.`);
    for (const path of ['web/index.html', 'web/app.js', 'README.md']) {
      if (!(await stat(resolve(folder, path))).isFile())
        throw new Error(`Falta ${path} en ${folder}.`);
    }
    for (const path of ['code', 'results']) {
      if (!(await stat(resolve(folder, path))).isDirectory())
        throw new Error(`Falta la carpeta ${path} en ${folder}.`);
    }
    if (data.status === 'ready') {
      const html = await readFile(resolve(folder, data.entry), 'utf8');
      if (html.includes('Sustituye este bloque por tu interfaz'))
        throw new Error(
          `La solución de ${data.author} todavía contiene la interfaz de la plantilla.`,
        );
    }
    if (!folder.startsWith(resolve(root, 'solutions') + sep))
      throw new Error('Ruta de solución incorrecta.');
  }
  return solutions;
}
