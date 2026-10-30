const fail = () => {
  throw new Error('El archivo de resultados está incompleto o no tiene un formato válido.');
};
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const nonempty = (value) => typeof value === 'string' && value.trim().length > 0;
const count = (value) => Number.isInteger(value) && value >= 0;

export const QUESTION_TYPES = {
  directa: 'Respuesta en un fragmento',
  combinada: 'Combina varios fragmentos',
  'sin-respuesta': 'Sin respuesta en la colección',
};

function validateGeneration(generation, maxNewTokens) {
  if (
    typeof generation?.answer !== 'string' ||
    !nonempty(generation.prompt) ||
    !count(generation.input_tokens) ||
    !count(generation.output_tokens) ||
    generation.output_tokens > maxNewTokens ||
    !finite(generation.generation_seconds) ||
    generation.generation_seconds < 0 ||
    !['eos', 'length'].includes(generation.stop_reason)
  )
    fail();
}

export function validateResults(data) {
  const parameters = data?.parameters;
  if (
    !nonempty(data?.models?.embedding?.id) ||
    !nonempty(data.models.embedding.revision) ||
    !nonempty(data.models.generator?.id) ||
    !nonempty(data.models.generator.revision) ||
    !Number.isInteger(parameters?.top_k) ||
    parameters.top_k < 1 ||
    !Number.isInteger(parameters.max_new_tokens) ||
    !Number.isInteger(parameters.chunk_words) ||
    !Number.isInteger(parameters.overlap_words) ||
    !nonempty(parameters.system_with_context) ||
    !nonempty(parameters.system_without_context) ||
    !nonempty(data.runtime?.device) ||
    !nonempty(data.runtime?.hardware?.processor) ||
    !Array.isArray(data.documents) ||
    !data.documents.length ||
    !Array.isArray(data.chunks) ||
    !Array.isArray(data.questions) ||
    !data.questions.length
  )
    fail();
  const documents = new Map(data.documents.map((document) => [document?.id, document]));
  if (
    documents.size !== data.documents.length ||
    data.documents.some((document) => !nonempty(document.title) || !nonempty(document.url))
  )
    fail();
  const chunks = new Map(data.chunks.map((chunk) => [chunk?.id, chunk]));
  if (
    chunks.size !== data.chunks.length ||
    data.chunks.some(
      (chunk) =>
        !documents.has(chunk.document_id) || !nonempty(chunk.section) || !nonempty(chunk.text),
    )
  )
    fail();
  const ids = new Set();
  for (const question of data.questions) {
    if (!nonempty(question?.id) || ids.has(question.id) || !nonempty(question.text)) fail();
    ids.add(question.id);
    if (!(question.type in QUESTION_TYPES)) fail();
    if (!Array.isArray(question.retrieved) || question.retrieved.length !== parameters.top_k)
      fail();
    question.retrieved.forEach((item, index) => {
      if (item?.rank !== index + 1 || !chunks.has(item.chunk_id) || !finite(item.score)) fail();
      if (index && item.score > question.retrieved[index - 1].score) fail();
    });
    validateGeneration(question.with_context, parameters.max_new_tokens);
    validateGeneration(question.without_context, parameters.max_new_tokens);
    if (
      !Array.isArray(question.with_context.cited) ||
      question.with_context.cited.some(
        (number) => !Number.isInteger(number) || number < 1 || number > parameters.top_k,
      )
    )
      fail();
  }
  return data;
}

export function findQuestion(data, id) {
  const question = data.questions.find((item) => item.id === id);
  if (!question) fail();
  const chunks = new Map(data.chunks.map((chunk) => [chunk.id, chunk]));
  const documents = new Map(data.documents.map((document) => [document.id, document]));
  return {
    ...question,
    fragments: question.retrieved.map((item) => {
      const chunk = chunks.get(item.chunk_id);
      return {
        ...item,
        ...chunk,
        document: documents.get(chunk.document_id),
        cited: question.with_context.cited.includes(item.rank),
      };
    }),
  };
}

export function validateReview(review, data) {
  if (!nonempty(review?.method) || typeof review.verdicts !== 'object') fail();
  for (const question of data.questions) {
    for (const side of ['with_context', 'without_context']) {
      const entry = review.questions?.[question.id]?.[side];
      if (!(entry?.verdict in review.verdicts) || !nonempty(entry.note)) fail();
    }
  }
  return review;
}
