import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { catalogue, root } from './projects.mjs';

try {
  const repository = new URL(catalogue.repository);
  if (repository.hostname !== 'github.com' || repository.protocol !== 'https:') {
    throw new Error('El repositorio debe ser una URL HTTPS de GitHub.');
  }
  const repoPath = repository.pathname.replace(/^\//, '').replace(/\/$/, '');
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (process.env.GH_TOKEN) headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
  const issues = await Promise.all(
    catalogue.issues.map(async (issue) => {
      const response = await fetch(
        `https://api.github.com/repos/${repoPath}/issues/${issue.number}`,
        {
          headers,
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!response.ok)
        throw new Error(`GitHub devolvió HTTP ${response.status} para la issue #${issue.number}.`);
      const remote = await response.json();
      if (!['open', 'closed'].includes(remote.state) || remote.pull_request) {
        throw new Error(`La referencia #${issue.number} no es una issue válida.`);
      }
      return { ...issue, state: remote.state };
    }),
  );
  await writeFile(
    resolve(root, 'catalogue.json'),
    JSON.stringify({ ...catalogue, issues }, null, 2) + '\n',
  );
  console.log(`Estado de ${issues.length} issues actualizado desde GitHub.`);
} catch (error) {
  console.error(`No se pudo actualizar el catálogo. ${error.message}`);
  process.exitCode = 1;
}
