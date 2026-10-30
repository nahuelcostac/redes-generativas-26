const fail = () => {
  throw new Error('El archivo de resultados está incompleto o no tiene un formato válido.');
};
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const texts = (value) => Array.isArray(value) && value.every(nonempty);

export function findRun(data, promptId, configurationId) {
  const run = data.runs.find(
    (item) => item.prompt_id === promptId && item.configuration_id === configurationId,
  );
  if (!run) fail();
  return run;
}

export function findReview(review, promptId, configurationId) {
  const entry = review.reviews.find(
    (item) => item.prompt_id === promptId && item.configuration_id === configurationId,
  );
  if (!entry) fail();
  return entry;
}

export function splitText(text, charactersUsed) {
  return { read: text.slice(0, charactersUsed), unread: text.slice(charactersUsed) };
}

function validateRun(run, prompt, config, maxInputTokens) {
  const expectedTruncated = run.input_tokens_total > maxInputTokens;
  if (
    !nonempty(run.summary) ||
    run.parameters?.max_new_tokens !== config.max_new_tokens ||
    run.parameters?.num_beams !== config.num_beams ||
    run.parameters?.do_sample !== false ||
    !finite(run.parameters?.repetition_penalty) ||
    !Number.isInteger(run.parameters?.no_repeat_ngram_size) ||
    run.parameters?.min_new_tokens !== config.min_new_tokens ||
    !Number.isInteger(run.input_tokens_total) ||
    !Number.isInteger(run.input_tokens_used) ||
    run.input_tokens_used < 1 ||
    run.input_tokens_used > maxInputTokens ||
    run.input_tokens_used > run.input_tokens_total ||
    run.truncated !== expectedTruncated ||
    !Number.isInteger(run.input_characters_used) ||
    run.input_characters_used < 1 ||
    run.input_characters_used > prompt.text.length ||
    !Array.isArray(run.generated_token_ids) ||
    run.generated_token_ids.length !== run.output_tokens ||
    !Number.isInteger(run.output_tokens) ||
    run.output_tokens < 1 ||
    run.output_tokens > config.max_new_tokens ||
    !finite(run.generation_seconds) ||
    run.generation_seconds < 0 ||
    !['eos', 'max_new_tokens'].includes(run.stop_reason)
  )
    fail();
}

export function validateResults(data) {
  if (
    data?.schema_version !== 1 ||
    !nonempty(data.model?.id) ||
    !nonempty(data.model?.revision) ||
    !nonempty(data.model?.dtype) ||
    !Number.isInteger(data.model?.max_input_tokens) ||
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
      list.some((item) => !nonempty(item?.id) || !nonempty(item.label)) ||
      new Set(list.map((item) => item.id)).size !== list.length
    )
      fail();
  }
  if (
    data.prompts.some(
      (prompt) =>
        !nonempty(prompt.text) ||
        !nonempty(prompt.source?.site) ||
        !nonempty(prompt.source?.title) ||
        !nonempty(prompt.source?.url) ||
        !nonempty(prompt.source?.license),
    )
  )
    fail();
  if (data.runs.length !== data.prompts.length * data.configurations.length) fail();
  for (const config of data.configurations) {
    if (
      !Number.isInteger(config.max_new_tokens) ||
      !Number.isInteger(config.min_new_tokens) ||
      !Number.isInteger(config.num_beams)
    )
      fail();
    for (const prompt of data.prompts) {
      const matches = data.runs.filter(
        (run) => run?.prompt_id === prompt.id && run.configuration_id === config.id,
      );
      if (matches.length !== 1) fail();
      validateRun(matches[0], prompt, config, data.model.max_input_tokens);
    }
  }
  return data;
}

export function validateReview(review, data) {
  if (
    review?.schema_version !== 1 ||
    !['pendiente', 'confirmada'].includes(review.status) ||
    !nonempty(review.method) ||
    !Array.isArray(review.reviews) ||
    review.reviews.length !== data.runs.length
  )
    fail();
  for (const run of data.runs) {
    const matches = review.reviews.filter(
      (item) => item?.prompt_id === run.prompt_id && item.configuration_id === run.configuration_id,
    );
    if (matches.length !== 1) fail();
    if (!texts(matches[0].omissions) || !texts(matches[0].unsupported)) fail();
  }
  return review;
}
