import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { findCheck, findRun, validateResults } from '../solutions/5/carlosordonezz/web/results.mjs';

const folder = new URL('../solutions/5/carlosordonezz/results/', import.meta.url);
const data = JSON.parse(await readFile(new URL('examples.json', folder), 'utf8'));
const asr = JSON.parse(await readFile(new URL('asr-check.json', folder), 'utf8'));

test('cada texto tiene un audio real por configuración y una transcripción', async () => {
  assert.equal(validateResults(data, asr), data);
  for (const text of data.texts) {
    for (const config of data.configurations) {
      const run = findRun(data, text.id, config.id);
      const file = await readFile(new URL(run.audio, folder));
      // Cabecera RIFF/WAVE de 44 bytes más 2 bytes por muestra mono de 16 bits.
      assert.equal(file.subarray(0, 4).toString('ascii'), 'RIFF');
      assert.equal(file.subarray(8, 12).toString('ascii'), 'WAVE');
      assert.equal(file.readUInt32LE(24), data.model.sampling_rate);
      assert.equal(file.length, 44 + run.samples * 2);
      assert.equal(typeof findCheck(asr, text.id, config.id).transcript, 'string');
    }
  }
});

test('la interfaz rechaza resultados ausentes, duplicados o con parámetros cambiados', () => {
  const mutations = [
    (copy) => copy.runs.pop(),
    (copy) => {
      copy.runs[1] = copy.runs[0];
    },
    (copy) => {
      copy.runs[0].parameters.speaking_rate = 1.9;
    },
    (copy) => {
      copy.runs[0].duration_seconds += 1;
    },
    (copy) => {
      copy.runs[0].audio = '../../secreto.wav';
    },
    (copy) => {
      copy.configurations[0].noise_scale = 5;
    },
  ];
  for (const mutate of mutations) {
    const copy = structuredClone(data);
    mutate(copy);
    assert.throws(() => validateResults(copy, asr), /formato válido/);
  }
  const missing = structuredClone(asr);
  missing.checks.pop();
  assert.throws(() => validateResults(data, missing), /formato válido/);
  assert.throws(() => findRun(data, 'no-existe', 'base'), /formato válido/);
});

test('los parámetros cambian el audio como se espera', () => {
  for (const text of data.texts) {
    const base = findRun(data, text.id, 'base');
    // Una velocidad menor alarga el audio y una mayor lo acorta.
    assert.ok(findRun(data, text.id, 'lenta').duration_seconds > base.duration_seconds);
    assert.ok(findRun(data, text.id, 'rapida').duration_seconds < base.duration_seconds);
    // Otra semilla produce un audio distinto con los mismos parámetros.
    assert.notEqual(findRun(data, text.id, 'otra-semilla').samples, base.samples);
  }
});

test('la verificación con --text reproduce el audio del lote con la misma semilla', async () => {
  const verification = JSON.parse(await readFile(new URL('verification.json', folder), 'utf8'));
  const own = verification.runs[0];
  const published = findRun(data, 'saludo', 'base');
  assert.equal(verification.texts[0].text, data.texts[0].text);
  assert.deepEqual(own.parameters, published.parameters);
  const [a, b] = await Promise.all(
    [own.audio, published.audio].map((path) => readFile(new URL(path, folder))),
  );
  assert.ok(a.equals(b));
  assert.ok((await stat(new URL(own.audio, folder))).size > 44);
});
