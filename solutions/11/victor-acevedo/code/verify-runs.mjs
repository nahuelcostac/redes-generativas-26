import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../results/', import.meta.url));
const summaries = [];
for (const folder of await readdir(join(root, 'runs'))) {
  const directory = join(root, 'runs', folder);
  const report = JSON.parse(await readFile(join(directory, 'run.json'), 'utf8'));
  const images = {};
  for (const [name, file] of Object.entries(report.files)) {
    const bytes = await readFile(join(directory, file.path));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
    images[name] = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const size = name === 'input' ? report.inputSize : report.outputSize;
    assert.deepEqual([images[name].info.width, images[name].info.height], size);
  }
  assert.deepEqual(report.outputSize, report.inputSize.map((side) => side * 2));
  if (report.psnr) {
    for (const [name, field] of [['output', 'modelPsnrDb'], ['interpolation', 'interpolationPsnrDb']]) {
      const output = images[name].data;
      const reference = images.reference.data;
      let squaredError = 0;
      for (let i = 0; i < output.length; i++) squaredError += (output[i] - reference[i]) ** 2;
      const psnr = 10 * Math.log10(255 ** 2 / (squaredError / output.length));
      assert.ok(Math.abs(psnr - report.psnr[field]) < 1e-10, `PSNR incorrecta en ${folder}`);
    }
  }
  const { files, ...metadata } = report;
  summaries.push({ folder, ...metadata, checkedHashes: Object.keys(files) });
}
await writeFile(join(root, 'measurements.json'), JSON.stringify(summaries, null, 2) + '\n');
console.log(`${summaries.length} ejecuciones verificadas. Dimensiones, hashes y PSNR coinciden con los PNG exportados.`);
