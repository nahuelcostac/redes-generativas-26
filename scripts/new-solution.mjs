import { cp, mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { catalogue, root, authorPattern } from './projects.mjs';

try {
  const { values } = parseArgs({
    options: { issue: { type: 'string' }, author: { type: 'string' } },
    strict: true,
  });
  const issue = catalogue.issues.find((item) => String(item.number) === values.issue);
  if (!issue || !values.author || !authorPattern.test(values.author))
    throw new Error(
      'Usa npm run new -- --issue NUMERO --author USUARIO_GITHUB con una issue del catálogo.',
    );
  const target = resolve(root, 'solutions', String(issue.number), values.author.toLowerCase());
  let exists = false;
  try {
    await stat(target);
    exists = true;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (exists) throw new Error('Esa solución ya existe. El comando conserva la carpeta anterior.');
  await mkdir(resolve(target, '..'), { recursive: true });
  await cp(resolve(root, 'templates/solution'), target, {
    recursive: true,
    force: false,
    errorOnExist: true,
  });
  const data = {
    issue: issue.number,
    author: values.author,
    title: issue.title,
    summary: 'Describe qué permite hacer tu solución.',
    mode: issue.mode,
    status: 'draft',
    entry: 'web/index.html',
  };
  await writeFile(resolve(target, 'solution.json'), JSON.stringify(data, null, 2) + '\n');
  const readme = await readFile(resolve(target, 'README.md'), 'utf8');
  await writeFile(
    resolve(target, 'README.md'),
    readme
      .replaceAll('TITLE', issue.title)
      .replaceAll('AUTHOR', values.author)
      .replaceAll('ISSUE', String(issue.number)),
  );
  console.log(`Solución creada en solutions/${issue.number}/${values.author.toLowerCase()}.`);
  console.log(
    'Edita la interfaz y la descripción. Usa ready cuando hayas comprobado el resultado.',
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
