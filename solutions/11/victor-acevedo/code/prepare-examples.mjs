import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('../results/', import.meta.url));
const cache = join(tmpdir(), 'redes-generativas-11-examples');
await mkdir(cache, { recursive: true });
await mkdir(output, { recursive: true });
const sources = [
  {
    name: 'astronauta',
    filename: 'astronaut.png',
    sha256: '88431cd9653ccd539741b555fb0a46b61558b301d4110412b5bc28b5e3ea6cb5',
    author: 'NASA, retrato de Eileen Collins',
    license: 'Dominio público',
    crop: { left: 100, top: 20, width: 320, height: 320 },
  },
  {
    name: 'cafe',
    filename: 'coffee.png',
    sha256: 'cc02f8ca188b167c775a7101b5d767d1e71792cf762c33d6fa15a4599b5a8de7',
    author: 'Rachel Michetti, cortesía de Pikolo Espresso Bar',
    license: 'CC0',
    crop: { left: 100, top: 0, width: 400, height: 400 },
  },
];
const manifest = [];
for (const source of sources) {
  const url = `https://raw.githubusercontent.com/scikit-image/scikit-image/v0.19.3/skimage/data/${source.filename}`;
  const path = join(cache, source.filename);
  let bytes;
  try {
    bytes = await readFile(path);
  } catch {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Error de descarga ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(path, bytes);
  }
  if (createHash('sha256').update(bytes).digest('hex') !== source.sha256)
    throw new Error(`Hash incorrecto para ${source.name}`);
  await sharp(bytes)
    .extract(source.crop)
    .resize(192, 192, { kernel: 'lanczos3' })
    .png()
    .toFile(join(output, `${source.name}.png`));
  manifest.push({
    ...source,
    url,
    reference: `${source.name}.png`,
    referenceSize: [192, 192],
    inputSize: [96, 96],
  });
}
// Patrón geométrico determinista. No es una fotografía ni una salida del modelo.
const pixels = Buffer.alloc(192 * 192 * 3);
for (let y = 0; y < 192; y++) {
  for (let x = 0; x < 192; x++) {
    let color;
    if (y < 64) color = x % 8 < 4 ? [35, 94, 75] : [240, 235, 212];
    else if (y < 128)
      color = (Math.floor(x / 3) + Math.floor(y / 3)) % 2 ? [40, 70, 105] : [237, 188, 90];
    else color = Math.abs(x - (y - 128) * 3) < 2 ? [30, 30, 30] : [235, 230, 220];
    pixels.set(color, (y * 192 + x) * 3);
  }
}
await sharp(pixels, { raw: { width: 192, height: 192, channels: 3 } })
  .png()
  .toFile(join(output, 'geometria.png'));
manifest.push({
  name: 'geometria',
  author: 'Patrón creado mediante código para esta solución',
  license: 'CC0',
  reference: 'geometria.png',
  referenceSize: [192, 192],
  inputSize: [96, 96],
});
await writeFile(
  join(output, 'examples.json'),
  JSON.stringify(
    {
      preparation:
        'Recorte indicado y resize Lanczos3 a 192 × 192 con sharp 0.35.5. Reducción bilineal Canvas a 96 × 96 en el navegador.',
      examples: manifest,
    },
    null,
    2,
  ) + '\n',
);
console.log('Tres referencias guardadas en results/.');
