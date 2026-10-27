import { MAX_BYTES, MAX_SECONDS, FORMATS } from './config.mjs';

export function validateFile(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  if (!FORMATS.includes(extension))
    throw new Error('Formato no admitido. Usa WAV, MP3, M4A, OGG o WebM.');
  if (file.size === 0) throw new Error('El archivo está vacío.');
  if (file.size > MAX_BYTES) throw new Error('El archivo supera el límite de 15 MB.');
}

export function monoSamples(buffer) {
  if (!Number.isFinite(buffer.duration) || buffer.duration <= 0)
    throw new Error('El archivo no contiene audio.');
  if (buffer.duration > MAX_SECONDS) throw new Error('El audio supera el límite de 30 segundos.');
  const samples = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i++) samples[i] += data[i] / buffer.numberOfChannels;
  }
  let energy = 0;
  for (const sample of samples) {
    if (!Number.isFinite(sample))
      throw new Error('El archivo contiene muestras de audio inválidas.');
    energy += sample * sample;
  }
  if (energy === 0) throw new Error('El audio solo contiene silencio.');
  return samples;
}
