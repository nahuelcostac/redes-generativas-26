import { validate } from './projects.mjs';
try {
  const solutions = await validate();
  console.log(`Catálogo válido. ${solutions.length} soluciones registradas.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
