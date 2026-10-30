import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';

// Extrae las imágenes reales de un registro descargado desde la interfaz.
// Uso: node code/extract-run.mjs REGISTRO.json DIRECTORIO_NUEVO
const [recordPath, directory] = process.argv.slice(2);
if (!recordPath || !directory) throw new Error('Indica el registro JSON y un directorio nuevo.');
const report = JSON.parse(await readFile(resolve(recordPath), 'utf8'));
const target = resolve(directory);
await mkdir(target, { recursive: false });
const { images, ...metadata } = report;
if (!images?.input || !images?.output) throw new Error('El registro no contiene imágenes.');
metadata.files = {};
for (const [name, uri] of Object.entries(images)) {
  if (!['input', 'output', 'interpolation', 'reference'].includes(name))
    throw new Error('Imagen desconocida.');
  if (uri === null) continue;
  if (!uri.startsWith('data:image/png;base64,')) throw new Error('Formato de imagen desconocido.');
  const bytes = Buffer.from(uri.slice('data:image/png;base64,'.length), 'base64');
  const filename = `${name}.png`;
  await writeFile(join(target, filename), bytes, { flag: 'wx' });
  metadata.files[name] = {
    path: filename,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  };
}
await writeFile(join(target, 'run.json'), JSON.stringify(metadata, null, 2) + '\n', { flag: 'wx' });
console.log(`Registro e imágenes guardados en ${target}.`);
