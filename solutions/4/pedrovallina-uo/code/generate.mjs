import { readFile, rename, stat, writeFile } from 'node:fs/promises';
import { cpus, homedir, platform, release, totalmem } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { env, pipeline, random } from '@huggingface/transformers';

const here = dirname(fileURLToPath(import.meta.url));
env.cacheDir = resolve(homedir(), '.cache', 'huggingface', 'transformers-cache');

function argumentsFrom(argv) {
  const args = { batch: 'examples.json', output: '../results/examples.json' };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === '--help') {
      console.log(
        'Uso: node generate.mjs [--batch examples.json] [--output ../results/examples.json]',
      );
      process.exit(0);
    }
    if (!['--batch', '--output'].includes(option) || !argv[index + 1])
      throw new Error(`Opción inválida: ${option}. Usa --help para ver el uso.`);
    args[option.slice(2)] = argv[index + 1];
    index += 1;
  }
  return args;
}

function validateBatch(batch) {
  if (
    !batch.model?.id ||
    !batch.model?.revision ||
    !Array.isArray(batch.images) ||
    !batch.images.length
  )
    throw new Error('El lote necesita un modelo fijado y al menos una imagen.');
  const ids = new Set();
  for (const image of batch.images) {
    if (!image.id || ids.has(image.id))
      throw new Error('Cada imagen debe tener un identificador único.');
    ids.add(image.id);
    if (!image.file || !Array.isArray(image.captions) || image.captions.length < 2)
      throw new Error(`La imagen ${image.id} necesita un archivo y al menos dos configuraciones.`);
    const captionIds = new Set();
    for (const caption of image.captions) {
      const { numBeams, maxNewTokens } = caption.parameters ?? {};
      if (!caption.id || captionIds.has(caption.id))
        throw new Error(`Las configuraciones de ${image.id} deben tener identificadores únicos.`);
      captionIds.add(caption.id);
      if (!caption.label || !Number.isInteger(numBeams) || numBeams < 1 || numBeams > 8)
        throw new Error(
          `Parámetros inválidos en ${image.id}/${caption.id}: numBeams debe estar entre 1 y 8.`,
        );
      if (!Number.isInteger(maxNewTokens) || maxNewTokens < 1 || maxNewTokens > 64)
        throw new Error(
          `Parámetros inválidos en ${image.id}/${caption.id}: maxNewTokens debe estar entre 1 y 64.`,
        );
      if (
        caption.parameters.doSample !== undefined &&
        typeof caption.parameters.doSample !== 'boolean'
      )
        throw new Error(
          `Parámetros inválidos en ${image.id}/${caption.id}: doSample debe ser booleano.`,
        );
      if (caption.parameters.doSample) {
        const { temperature, topK, seed } = caption.parameters;
        if (!Number.isFinite(temperature) || temperature <= 0 || temperature > 2)
          throw new Error(
            `Parámetros inválidos en ${image.id}/${caption.id}: temperature debe estar entre 0 y 2.`,
          );
        if (!Number.isInteger(topK) || topK < 1 || topK > 100)
          throw new Error(
            `Parámetros inválidos en ${image.id}/${caption.id}: topK debe estar entre 1 y 100.`,
          );
        if (!Number.isInteger(seed) || seed < 0 || seed > 4294967295)
          throw new Error(
            `Parámetros inválidos en ${image.id}/${caption.id}: seed debe ser un entero entre 0 y 4294967295.`,
          );
      }
    }
  }
}

async function main() {
  const args = argumentsFrom(process.argv.slice(2));
  const batchPath = resolve(here, args.batch);
  const outputPath = resolve(here, args.output);
  const batch = JSON.parse(await readFile(batchPath, 'utf8'));
  validateBatch(batch);
  for (const image of batch.images) {
    const imagePath = resolve(here, '../results', image.file);
    try {
      await stat(imagePath);
    } catch {
      throw new Error(`No se encontró la imagen ${image.file} de ${image.id}.`);
    }
  }

  console.log(`Cargando ${batch.model.id} (${batch.model.revision}) en CPU…`);
  const captioner = await pipeline('image-to-text', batch.model.id, {
    revision: batch.model.revision,
    device: 'cpu',
    dtype: 'q8',
  });

  const results = [];
  for (const image of batch.images) {
    const imagePath = resolve(here, '../results', image.file);
    const captions = [];
    for (const choice of image.captions) {
      const startedAt = performance.now();
      if (choice.parameters.doSample) random.seed(choice.parameters.seed);
      const output = await captioner(imagePath, {
        num_beams: choice.parameters.numBeams,
        max_new_tokens: choice.parameters.maxNewTokens,
        do_sample: choice.parameters.doSample ?? false,
        ...(choice.parameters.doSample
          ? { temperature: choice.parameters.temperature, top_k: choice.parameters.topK }
          : {}),
      });
      const elapsedSeconds = (performance.now() - startedAt) / 1000;
      const generatedText = output?.[0]?.generated_text?.trim();
      if (!generatedText)
        throw new Error(`El modelo no generó texto para ${image.id}/${choice.id}.`);
      captions.push({
        id: choice.id,
        label: choice.label,
        generatedText,
        parameters: choice.parameters,
        elapsedSeconds: Number(elapsedSeconds.toFixed(3)),
      });
      console.log(`${image.id} / ${choice.label}: ${elapsedSeconds.toFixed(2)} s`);
    }
    results.push({ ...image, captions });
  }

  const cpu = cpus()[0];
  const resultDocument = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    model: batch.model,
    runtime: {
      transformers: '4.3.1',
      node: process.version,
      device: 'CPU, ONNX Runtime con pesos q8',
      hardware: `${cpu.model}; ${cpus().length} procesadores lógicos; ${Math.round(totalmem() / 1024 ** 3)} GiB de RAM`,
      platform: `${platform()} ${release()} (${process.arch})`,
    },
    images: results,
  };
  const temporaryPath = `${outputPath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(resultDocument, null, 2)}\n`);
  await rename(temporaryPath, outputPath);
  console.log(`Resultados guardados en ${outputPath}`);
}

main().catch((error) => {
  console.error(error.stack ?? error.message);
  process.exitCode = 1;
});
