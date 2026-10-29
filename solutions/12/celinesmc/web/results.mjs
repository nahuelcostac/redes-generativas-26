const fail = () => {
  throw new Error('El archivo de resultados está incompleto o no tiene un formato válido.');
};
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const types = ['direct', 'combined', 'unanswerable', 'custom'];

export function findRun(data, questionId) {
  const run = data.runs.find((item) => item.question_id === questionId);
  if (!run) fail();
  return run;
}

function validateAnswer(answer, maxNewTokens) {
  if (
    typeof answer?.answer !== 'string' ||
    !Array.isArray(answer.messages) ||
    !answer.messages.length ||
    answer.messages.some((message) => !nonempty(message?.role) || !nonempty(message.content)) ||
    !Number.isInteger(answer.input_tokens) ||
    answer.input_tokens < 1 ||
    !Number.isInteger(answer.output_tokens) ||
    answer.output_tokens < 1 ||
    answer.output_tokens > maxNewTokens ||
    !finite(answer.generation_seconds) ||
    answer.generation_seconds < 0 ||
    !['eos', 'max_new_tokens'].includes(answer.stop_reason)
  )
    fail();
}

export function validateResults(data, documents) {
  const generation = data?.parameters?.generation;
  if (
    data?.schema_version !== 1 ||
    !nonempty(data.models?.embedding?.id) ||
    !nonempty(data.models?.embedding?.revision) ||
    !nonempty(data.models?.generator?.id) ||
    !nonempty(data.models?.generator?.revision) ||
    !nonempty(data.runtime?.device) ||
    !nonempty(data.runtime?.torch) ||
    !nonempty(data.runtime?.transformers) ||
    !Number.isInteger(data.parameters?.top_k) ||
    data.parameters.top_k < 1 ||
    !Number.isInteger(generation?.max_new_tokens) ||
    generation.do_sample !== false ||
    !finite(data.load_seconds) ||
    !finite(data.index_seconds) ||
    !Array.isArray(data.questions) ||
    !data.questions.length ||
    !Array.isArray(data.runs) ||
    data.runs.length !== data.questions.length ||
    !Array.isArray(documents?.documents)
  )
    fail();
  const documentIds = new Set(documents.documents.map((document) => document.id));
  const questionIds = new Set();
  for (const question of data.questions) {
    if (
      !nonempty(question?.id) ||
      questionIds.has(question.id) ||
      !nonempty(question.label) ||
      !nonempty(question.text) ||
      !types.includes(question.type) ||
      !Array.isArray(question.expected)
    )
      fail();
    questionIds.add(question.id);
    const matches = data.runs.filter((run) => run?.question_id === question.id);
    if (matches.length !== 1) fail();
    const run = matches[0];
    if (
      !Array.isArray(run.retrieved) ||
      run.retrieved.length < 1 ||
      run.retrieved.length > data.parameters.top_k ||
      run.retrieved.some(
        (chunk, index) =>
          chunk?.rank !== index + 1 ||
          !documentIds.has(chunk.document_id) ||
          !nonempty(chunk.text) ||
          !finite(chunk.score) ||
          (index > 0 && chunk.score > run.retrieved[index - 1].score),
      )
    )
      fail();
    validateAnswer(run.with_context, generation.max_new_tokens);
    validateAnswer(run.without_context, generation.max_new_tokens);
    // La respuesta con contexto debe haber recibido exactamente los fragmentos mostrados.
    const prompt = run.with_context.messages.at(-1).content;
    if (run.retrieved.some((chunk) => !prompt.includes(chunk.text))) fail();
    if (run.without_context.messages.some((message) => prompt === message.content)) fail();
  }
  return data;
}
