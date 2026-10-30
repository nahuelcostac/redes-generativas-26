import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../results/', import.meta.url));
const width = 840;
const height = 730;
const layers = [];
const label = (text, x, y, size = 15) => `<text x="${x}" y="${y}" font-family="Arial" font-size="${size}" fill="#183f32">${text}</text>`;
let svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`;
svg += label('Superresolución ×2 · Referencia de 192 × 192 px reducida a 96 × 96 px', 20, 28, 18);
for (const [column, title] of ['Entrada ×2 sin suavizado', 'Interpolación bilineal', 'Swin2SR ligero ×2', 'Referencia original'].entries()) svg += label(title, 20 + column * 204, 60, 13);
for (const [row, [folder, title]] of [['astronauta', 'Astronauta · NASA'], ['cafe', 'Café · Rachel Michetti, CC0'], ['geometria', 'Geometría · Patrón determinista, CC0']].entries()) {
  const top = 92 + row * 214;
  svg += label(title, 20, top - 8, 13);
  for (const [column, name] of ['input', 'interpolation', 'output', 'reference'].entries()) {
    const image = await sharp(join(root, 'runs', folder, `${name}.png`)).resize(192, 192, { kernel: 'nearest' }).png().toBuffer();
    layers.push({ input: image, left: 20 + column * 204, top });
  }
}
svg += '</svg>';
layers.unshift({ input: Buffer.from(svg), left: 0, top: 0 });
await sharp({ create: { width, height, channels: 3, background: '#f8f9f6' } }).composite(layers).png().toFile(join(root, 'comparacion.png'));
console.log('Comparación guardada sin modificar los resultados del modelo.');
