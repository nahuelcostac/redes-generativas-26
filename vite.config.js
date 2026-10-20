import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { cp, mkdir } from 'node:fs/promises';
import { root, getSolutions } from './scripts/projects.mjs';

export default defineConfig(async () => {
  const solutions = await getSolutions();
  const input = { catalogue: resolve(root, 'index.html') };
  for (const solution of solutions)
    input[`solution-${solution.issueFolder}-${solution.authorFolder}`] = resolve(
      solution.folder,
      solution.data.entry,
    );
  return {
    base: '/redes-generativas-26/',
    build: { rollupOptions: { input } },
    plugins: [
      {
        name: 'solution-results',
        async closeBundle() {
          for (const solution of solutions) {
            const target = resolve(
              root,
              'dist/solutions',
              solution.issueFolder,
              solution.authorFolder,
              'results',
            );
            await mkdir(target, { recursive: true });
            await cp(resolve(solution.folder, 'results'), target, {
              recursive: true,
              filter: (path) => !path.endsWith('/.gitkeep'),
            });
          }
        },
      },
    ],
    server: { host: '127.0.0.1' },
    preview: { host: '127.0.0.1' },
  };
});
