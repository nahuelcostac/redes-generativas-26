"""Genera resultados RAG reproducibles para la interfaz de la solución."""

import argparse
import json
import os
import platform
import time
from pathlib import Path

os.environ.setdefault('USE_TF', '0')
import torch
from sentence_transformers import SentenceTransformer, util
from transformers import AutoModelForCausalLM, AutoTokenizer

ROOT = Path(__file__).resolve().parent.parent
INPUT = Path(__file__).with_name('documents.json')
OUTPUT = ROOT / 'results' / 'examples.json'
EMBEDDING_MODEL = 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'
GENERATOR_MODEL = 'Qwen/Qwen2.5-0.5B-Instruct'
EMBEDDING_REVISION = 'e8f8c211226b894fcb81acc59f3b34ba3efd5f42'
GENERATOR_REVISION = '7ae557604adf67be50417f59c2c2f167def9a775'
CHUNK_WORDS = 42
OVERLAP_WORDS = 10


def split_document(document):
    words = document['text'].split()
    chunks = []
    start = 0
    while start < len(words):
        end = min(start + CHUNK_WORDS, len(words))
        chunks.append({
            'chunk_id': f"{document['id']}-{len(chunks) + 1}",
            'document_id': document['id'],
            'document_title': document['title'],
            'source': document['source'],
            'text': ' '.join(words[start:end]),
        })
        if end == len(words):
            break
        start = end - OVERLAP_WORDS
    return chunks


def generate(model, tokenizer, prompt, max_new_tokens, device):
    messages = [{'role': 'user', 'content': prompt}]
    encoded = tokenizer.apply_chat_template(
        messages, tokenize=True, add_generation_prompt=True, return_tensors='pt', return_dict=True
    ).to(device)
    started = time.perf_counter()
    with torch.inference_mode():
        output = model.generate(
            **encoded, max_new_tokens=max_new_tokens, do_sample=False,
            temperature=None, top_p=None, top_k=None, pad_token_id=tokenizer.eos_token_id,
        )
    elapsed = time.perf_counter() - started
    generated = output[0, encoded['input_ids'].shape[1]:]
    return tokenizer.decode(generated, skip_special_tokens=True).strip(), elapsed, len(generated)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=OUTPUT)
    parser.add_argument('--top-k', type=int, default=2)
    parser.add_argument('--max-new-tokens', type=int, default=96)
    parser.add_argument('--threads', type=int, default=4)
    args = parser.parse_args()
    if not 1 <= args.top_k <= 5 or not 16 <= args.max_new_tokens <= 256 or args.threads < 1:
        parser.error('top-k debe estar entre 1 y 5, max-new-tokens entre 16 y 256 y threads debe ser positivo.')
    torch.set_num_threads(args.threads)
    data = json.loads(INPUT.read_text(encoding='utf-8'))
    chunks = [chunk for document in data['collection'] for chunk in split_document(document)]
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    embedding_started = time.perf_counter()
    embedder = SentenceTransformer(EMBEDDING_MODEL, revision=EMBEDDING_REVISION, device=device)
    vectors = embedder.encode([chunk['text'] for chunk in chunks], convert_to_tensor=True, normalize_embeddings=True)
    embedding_load_seconds = time.perf_counter() - embedding_started
    tokenizer = AutoTokenizer.from_pretrained(GENERATOR_MODEL, revision=GENERATOR_REVISION)
    model_started = time.perf_counter()
    generator = AutoModelForCausalLM.from_pretrained(
        GENERATOR_MODEL, revision=GENERATOR_REVISION, torch_dtype=torch.float32
    ).to(device).eval()
    generator_load_seconds = time.perf_counter() - model_started
    embedding_revision = embedder._first_module().auto_model.config._commit_hash
    generator_revision = generator.config._commit_hash
    records = []
    for question in data['questions']:
        query_vector = embedder.encode(question['question'], convert_to_tensor=True, normalize_embeddings=True)
        scores = util.cos_sim(query_vector, vectors)[0]
        best = torch.topk(scores, k=min(args.top_k, len(chunks)))
        retrieved = []
        for score, index in zip(best.values.tolist(), best.indices.tolist()):
            retrieved.append({**chunks[index], 'score': round(float(score), 6)})
        context = '\n'.join(f"[{i + 1}] {item['document_title']}: {item['text']}" for i, item in enumerate(retrieved))
        instruction = ('Responde en español y en un máximo de dos frases. Usa exclusivamente los fragmentos incluidos. '
                       'No uses conocimientos externos ni inventes datos. Si los fragmentos no permiten responder, '
                       'di exactamente: “No se puede determinar con los documentos disponibles”. Para cálculos, '
                       'muestra la operación. Cita las pruebas con [1] o [2].')
        with_context, with_time, with_tokens = generate(generator, tokenizer,
            f'{instruction}\n\nDocumentos:\n{context}\n\nPregunta: {question["question"]}', args.max_new_tokens, device)
        without_context, without_time, without_tokens = generate(generator, tokenizer,
            f'{instruction}\n\nNo hay documentos disponibles.\n\nPregunta: {question["question"]}', args.max_new_tokens, device)
        records.append({
            'id': question['id'], 'question': question['question'], 'expected_behavior': question['expected'],
            'answer_with_context': with_context, 'answer_without_context': without_context,
            'retrieved_chunks': retrieved,
            'parameters': {'top_k': args.top_k, 'chunk_words': CHUNK_WORDS, 'overlap_words': OVERLAP_WORDS,
                           'max_new_tokens': args.max_new_tokens, 'sampling': False, 'device': device, 'threads': args.threads},
            'with_context': {'generation_seconds': round(with_time, 4), 'new_tokens': with_tokens},
            'without_context': {'generation_seconds': round(without_time, 4), 'new_tokens': without_tokens},
        })
    result = {
        'generated_at_utc': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'model': {
            'embedding': {'id': EMBEDDING_MODEL, 'revision': embedding_revision},
            'generator': {'id': GENERATOR_MODEL, 'revision': generator_revision},
        },
        'runtime': {'python': platform.python_version(), 'platform': platform.platform(), 'torch': torch.__version__,
                    'device': device, 'threads': args.threads, 'embedding_load_seconds': round(embedding_load_seconds, 4),
                    'generator_load_seconds': round(generator_load_seconds, 4)},
        'documents': [{'id': d['id'], 'title': d['title'], 'source': d['source']} for d in data['collection']],
        'examples': records,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f"Guardados {len(records)} ejemplos en {args.output}")


if __name__ == '__main__':
    main()
