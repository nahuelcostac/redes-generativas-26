import test from 'node:test';
import assert from 'node:assert/strict';
import { validateFile, monoSamples } from '../solutions/1/nahuelcostac/web/audio.mjs';

test('rechaza formatos no admitidos, archivos vacíos y archivos demasiado grandes', () => {
  assert.throws(() => validateFile({ name: 'texto.txt', size: 20 }), /Formato/);
  assert.throws(() => validateFile({ name: 'audio.wav', size: 0 }), /vacío/);
  assert.throws(() => validateFile({ name: 'audio.mp3', size: 16 * 1024 * 1024 }), /15 MB/);
  assert.doesNotThrow(() => validateFile({ name: 'AUDIO.WAV', size: 1000 }));
});

const buffer = (channels, duration = 1) => ({
  duration,
  length: channels[0].length,
  numberOfChannels: channels.length,
  getChannelData: (index) => Float32Array.from(channels[index]),
});

test('convierte estéreo a mono sin duplicar el volumen', () => {
  assert.deepEqual(
    Array.from(
      monoSamples(
        buffer([
          [1, 0],
          [0, 1],
        ]),
      ),
    ),
    [0.5, 0.5],
  );
});

test('rechaza duración excesiva, silencio y muestras inválidas', () => {
  assert.throws(() => monoSamples(buffer([[1]], 30.01)), /30 segundos/);
  assert.throws(() => monoSamples(buffer([[0, 0]])), /silencio/);
  assert.throws(() => monoSamples(buffer([[NaN]])), /inválidas/);
});
