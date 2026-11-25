const fail = () => {
  throw new Error('El archivo de resultados está incompleto o no tiene un formato válido.');
};
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const between = (value, low, high) => finite(value) && value >= low && value <= high;

export const PARAMETERS = {
  speaking_rate: [0.5, 2],
  noise_scale: [0, 1.5],
  noise_scale_duration: [0, 1.5],
};

export function findRun(data, textId, configurationId) {
  const run = data.runs.find(
    (item) => item.text_id === textId && item.configuration_id === configurationId,
  );
  if (!run) fail();
  return run;
}

export function findCheck(asr, textId, configurationId) {
  const check = asr.checks.find(
    (item) => item.text_id === textId && item.configuration_id === configurationId,
  );
  if (!check) fail();
  return check;
}

export function validateResults(data, asr) {
  if (
    data?.schema_version !== 1 ||
    !nonempty(data.model?.id) ||
    !nonempty(data.model?.revision) ||
    !Number.isInteger(data.model?.sampling_rate) ||
    !nonempty(data.runtime?.python) ||
    !nonempty(data.runtime?.torch) ||
    !nonempty(data.runtime?.transformers) ||
    !nonempty(data.runtime?.hardware?.processor) ||
    !finite(data.load_seconds) ||
    data.load_seconds < 0 ||
    !Array.isArray(data.texts) ||
    !data.texts.length ||
    !Array.isArray(data.configurations) ||
    !data.configurations.length ||
    !Array.isArray(data.runs) ||
    data.runs.length !== data.texts.length * data.configurations.length
  )
    fail();
  for (const list of [data.texts, data.configurations]) {
    if (
      list.some((item) => !nonempty(item?.id) || !nonempty(item.label)) ||
      new Set(list.map((item) => item.id)).size !== list.length
    )
      fail();
  }
  if (data.texts.some((text) => !nonempty(text.text) || !nonempty(text.model_text))) fail();
  for (const config of data.configurations) {
    for (const [name, [low, high]] of Object.entries(PARAMETERS))
      if (!between(config[name], low, high)) fail();
    if (!Number.isInteger(config.seed) || config.seed < 0 || config.seed >= 2 ** 32) fail();
    for (const text of data.texts) {
      const matches = data.runs.filter(
        (run) => run?.text_id === text.id && run.configuration_id === config.id,
      );
      if (matches.length !== 1) fail();
      const run = matches[0];
      if (
        Object.keys(PARAMETERS).some((name) => run.parameters?.[name] !== config[name]) ||
        run.parameters.seed !== config.seed ||
        typeof run.audio !== 'string' ||
        !/^audio\/[a-z0-9-]+\/[a-z0-9-]+\.wav$/.test(run.audio) ||
        !Number.isInteger(run.samples) ||
        run.samples < 1 ||
        !finite(run.duration_seconds) ||
        Math.abs(run.duration_seconds - run.samples / data.model.sampling_rate) > 0.001 ||
        !finite(run.generation_seconds) ||
        run.generation_seconds < 0 ||
        !Number.isInteger(run.input_tokens) ||
        run.input_tokens < 1
      )
        fail();
    }
  }
  if (asr !== undefined) {
    if (
      asr?.schema_version !== 1 ||
      !nonempty(asr.model?.id) ||
      !Array.isArray(asr.checks) ||
      asr.checks.length !== data.runs.length
    )
      fail();
    for (const run of data.runs) {
      const matches = asr.checks.filter(
        (item) => item?.text_id === run.text_id && item.configuration_id === run.configuration_id,
      );
      if (matches.length !== 1 || typeof matches[0].transcript !== 'string') fail();
      if (!finite(matches[0].wer) || matches[0].wer < 0) fail();
    }
  }
  return data;
}
