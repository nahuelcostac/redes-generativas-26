import { FORMATS, MAX_BYTES, MAX_SIDE, MIN_SIDE } from './config.mjs';

export const LABELS_ES = {
  person: 'persona',
  bicycle: 'bicicleta',
  car: 'coche',
  motorcycle: 'moto',
  airplane: 'avión',
  bus: 'autobús',
  train: 'tren',
  truck: 'camión',
  boat: 'barco',
  'traffic light': 'semáforo',
  'fire hydrant': 'boca de incendios',
  'street sign': 'señal de tráfico',
  'stop sign': 'señal de stop',
  'parking meter': 'parquímetro',
  bench: 'banco',
  bird: 'pájaro',
  cat: 'gato',
  dog: 'perro',
  horse: 'caballo',
  sheep: 'oveja',
  cow: 'vaca',
  elephant: 'elefante',
  bear: 'oso',
  zebra: 'cebra',
  giraffe: 'jirafa',
  hat: 'sombrero',
  backpack: 'mochila',
  umbrella: 'paraguas',
  shoe: 'zapato',
  'eye glasses': 'gafas',
  handbag: 'bolso',
  tie: 'corbata',
  suitcase: 'maleta',
  frisbee: 'frisbi',
  skis: 'esquís',
  snowboard: 'snowboard',
  'sports ball': 'pelota',
  kite: 'cometa',
  'baseball bat': 'bate de béisbol',
  'baseball glove': 'guante de béisbol',
  skateboard: 'monopatín',
  surfboard: 'tabla de surf',
  'tennis racket': 'raqueta de tenis',
  bottle: 'botella',
  plate: 'plato',
  'wine glass': 'copa de vino',
  cup: 'taza',
  fork: 'tenedor',
  knife: 'cuchillo',
  spoon: 'cuchara',
  bowl: 'cuenco',
  banana: 'plátano',
  apple: 'manzana',
  sandwich: 'sándwich',
  orange: 'naranja',
  broccoli: 'brócoli',
  carrot: 'zanahoria',
  'hot dog': 'perrito caliente',
  pizza: 'pizza',
  donut: 'dónut',
  cake: 'pastel',
  chair: 'silla',
  couch: 'sofá',
  'potted plant': 'planta en maceta',
  bed: 'cama',
  mirror: 'espejo',
  'dining table': 'mesa',
  window: 'ventana',
  desk: 'escritorio',
  toilet: 'inodoro',
  door: 'puerta',
  tv: 'televisor',
  laptop: 'portátil',
  mouse: 'ratón',
  remote: 'mando a distancia',
  keyboard: 'teclado',
  'cell phone': 'teléfono móvil',
  microwave: 'microondas',
  oven: 'horno',
  toaster: 'tostadora',
  sink: 'fregadero',
  refrigerator: 'frigorífico',
  blender: 'batidora',
  book: 'libro',
  clock: 'reloj',
  vase: 'jarrón',
  scissors: 'tijeras',
  'teddy bear': 'osito de peluche',
  'hair drier': 'secador',
  toothbrush: 'cepillo de dientes',
};

export const labelEs = (label) => LABELS_ES[label] ?? label;

const extensionOf = (name) => (name.includes('.') ? name.split('.').pop().toLowerCase() : '');

export function validateFile(file) {
  const expected = FORMATS[extensionOf(file.name)];
  if (!expected || (file.type && file.type !== expected))
    throw new Error('Formato no admitido. Usa una imagen JPEG, PNG o WebP.');
  if (file.size === 0) throw new Error('El archivo está vacío.');
  if (file.size > MAX_BYTES) throw new Error('El archivo supera el límite de 10 MB.');
}

export function validateDimensions(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    throw new Error('No se pudo leer el tamaño de la imagen.');
  if (Math.min(width, height) < MIN_SIDE)
    throw new Error(
      `La imagen es demasiado pequeña. El lado menor debe medir ${MIN_SIDE} px o más.`,
    );
  if (Math.max(width, height) > MAX_SIDE)
    throw new Error(`La imagen es demasiado grande. El lado mayor no debe superar ${MAX_SIDE} px.`);
}

const clamp = (value) => Math.min(1, Math.max(0, value));

export function normalizeDetections(output) {
  if (!Array.isArray(output)) throw new Error('El modelo ha devuelto un resultado no válido.');
  return output
    .map(({ label, score, box }) => {
      const xmin = clamp(box.xmin);
      const ymin = clamp(box.ymin);
      const xmax = clamp(box.xmax);
      const ymax = clamp(box.ymax);
      return { label, labelEs: labelEs(label), score, box: { xmin, ymin, xmax, ymax } };
    })
    .filter(
      ({ score, box }) => Number.isFinite(score) && box.xmax > box.xmin && box.ymax > box.ymin,
    )
    .sort((a, b) => b.score - a.score);
}

export const filterByThreshold = (detections, threshold) =>
  detections.filter((detection) => detection.score >= threshold);

export function countByLabel(detections) {
  const counts = new Map();
  for (const { labelEs: name } of detections) counts.set(name, (counts.get(name) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'es'));
}

export function colorFor(label) {
  let hash = 0;
  for (const char of label) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  return `hsl(${hash % 360} 85% 42%)`;
}

export const percent = (value) =>
  `${(value * 100).toLocaleString('es-ES', { maximumFractionDigits: 0 })} %`;
