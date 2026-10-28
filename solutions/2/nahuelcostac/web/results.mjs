const fail = () => {
  throw new Error('El archivo de resultados está incompleto o no tiene un formato válido.');
};
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;

export function findRun(data, promptId, configurationId) {
  const run = data.runs.find(
    (item) => item.prompt_id === promptId && item.configuration_id === configurationId,
  );
  if (!run) fail();
  return run;
}

export function validateResults(data) {
  if (
    data?.schema_version !== 1 ||
    !nonempty(data.model?.id) ||
    !nonempty(data.model?.revision) ||
    !nonempty(data.model?.dtype) ||
    !nonempty(data.runtime?.device) ||
    !nonempty(data.runtime?.python) ||
    !nonempty(data.runtime?.torch) ||
    !nonempty(data.runtime?.transformers) ||
    !nonempty(data.runtime?.hardware?.processor) ||
    !finite(data.load_seconds) ||
    data.load_seconds < 0 ||
    !Array.isArray(data.prompts) ||
    !data.prompts.length ||
    !Array.isArray(data.configurations) ||
    !data.configurations.length ||
    !Array.isArray(data.runs)
  )
    fail();
  for (const list of [data.prompts, data.configurations]) {
    if (
      list.some((item) => !nonempty(item?.id)) ||
      new Set(list.map((item) => item.id)).size !== list.length
    )
      fail();
  }
  if (data.prompts.some((prompt) => !nonempty(prompt.label) || !nonempty(prompt.text))) fail();
  if (data.runs.length !== data.prompts.length * data.configurations.length) fail();
  for (const config of data.configurations) {
    if (
      !finite(config.temperature) ||
      config.temperature <= 0 ||
      config.temperature > 2 ||
      !Number.isInteger(config.max_new_tokens) ||
      config.max_new_tokens < 1 ||
      config.max_new_tokens > 256 ||
      !Number.isInteger(config.seed) ||
      config.seed < 0 ||
      config.seed >= 2 ** 32
    )
      fail();
    for (const prompt of data.prompts) {
      const matches = data.runs.filter(
        (run) => run?.prompt_id === prompt.id && run.configuration_id === config.id,
      );
      if (matches.length !== 1) fail();
      const run = matches[0];
      if (
        typeof run.continuation !== 'string' ||
        run.parameters?.temperature !== config.temperature ||
        run.parameters?.max_new_tokens !== config.max_new_tokens ||
        run.parameters?.seed !== config.seed ||
        run.parameters?.do_sample !== true ||
        !finite(run.parameters?.top_p) ||
        !Number.isInteger(run.parameters?.top_k) ||
        !Number.isInteger(run.input_tokens) ||
        run.input_tokens < 1 ||
        !Number.isInteger(run.output_tokens) ||
        run.output_tokens < 1 ||
        run.output_tokens > config.max_new_tokens ||
        !finite(run.generation_seconds) ||
        run.generation_seconds < 0 ||
        !['eos', 'max_new_tokens'].includes(run.stop_reason)
      )
        fail();
    }
  }
  return data;
}
