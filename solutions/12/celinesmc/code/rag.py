"""Responde preguntas con RAG y exporta los datos que consume la web."""

import argparse
import importlib.metadata
import json
import os
import platform
import re
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

EMBEDDING_ID = "intfloat/multilingual-e5-small"
EMBEDDING_REVISION = "614241f622f53c4eeff9890bdc4f31cfecc418b3"
GENERATOR_ID = "Qwen/Qwen2.5-1.5B-Instruct"
GENERATOR_REVISION = "989aa7980e4cf806f80c7fef2b1adb7bc71aa306"
NOT_FOUND = "No encuentro la respuesta en los documentos."
SYSTEM_RAG = (
    "Eres un asistente que responde en español. Usa solo la información de los fragmentos. "
    "Cita los fragmentos que utilices con su número entre corchetes, por ejemplo [2]. "
    f"Si los fragmentos no contienen la respuesta, responde exactamente: {NOT_FOUND}"
)
SYSTEM_PLAIN = "Eres un asistente que responde en español de forma breve y precisa."


def validate_questions(spec):
    """Valida antes de cargar las dependencias o descargar los modelos."""
    questions = spec.get("questions") if isinstance(spec, dict) else None
    if not isinstance(questions, list) or not questions:
        raise ValueError("questions debe contener al menos una pregunta.")
    ids = set()
    for question in questions:
        if not isinstance(question, dict):
            raise ValueError("Cada pregunta debe ser un objeto.")
        key = question.get("id")
        if not isinstance(key, str) or not key.strip() or key in ids:
            raise ValueError("Cada id de pregunta debe ser un texto único y no vacío.")
        ids.add(key)
        for field in ("label", "text"):
            if not isinstance(question.get(field), str) or not question[field].strip():
                raise ValueError(f"El campo {field} de la pregunta {key} está vacío.")
        if len(question["text"]) > 1000:
            raise ValueError("Una pregunta no puede superar 1000 caracteres.")
        if question.get("type") not in ("direct", "combined", "unanswerable", "custom"):
            raise ValueError(f"Tipo de pregunta incorrecto en {key}.")
        expected = question.get("expected", [])
        if not isinstance(expected, list) or not all(isinstance(item, str) and item.strip()
                                                     for item in expected):
            raise ValueError(f"expected debe ser una lista de textos en {key}.")
    return spec


def validate_documents(data):
    documents = data.get("documents") if isinstance(data, dict) else None
    if not isinstance(documents, list) or not documents:
        raise ValueError("La colección debe contener al menos un documento.")
    for document in documents:
        for field in ("id", "title", "url", "text"):
            if not isinstance(document.get(field), str) or not document[field].strip():
                raise ValueError(f"Falta {field} en un documento.")
    if len({document["id"] for document in documents}) != len(documents):
        raise ValueError("Los ids de los documentos deben ser únicos.")
    return data


def split_long(paragraph, max_chars):
    """Divide un párrafo largo por frases sin superar max_chars cuando es posible."""
    sentences = re.split(r"(?<=[.!?])\s+", paragraph)
    parts, current = [], ""
    for sentence in sentences:
        if current and len(current) + 1 + len(sentence) > max_chars:
            parts.append(current)
            current = sentence
        else:
            current = f"{current} {sentence}".strip()
    if current:
        parts.append(current)
    return parts


def chunk_documents(documents, max_chars):
    """Agrupa párrafos consecutivos de una misma sección en fragmentos."""
    chunks = []
    for document in documents:
        section, buffer, first = "Introducción", [], len(chunks)

        def flush():
            if buffer:
                chunks.append({"id": f"{document['id']}-{len(chunks) - first + 1}",
                               "document_id": document["id"], "title": document["title"],
                               "section": section, "text": "\n".join(buffer)})
                buffer.clear()

        for line in document["text"].splitlines():
            if not line.strip():
                continue
            if line.startswith("#"):
                flush()
                section = line.lstrip("#").strip()
                continue
            for part in split_long(line.strip(), max_chars):
                if buffer and len("\n".join(buffer)) + 1 + len(part) > max_chars:
                    flush()
                buffer.append(part)
        flush()
    return chunks


def check_facts(expected, text):
    """Indica si cada dato esperado aparece en el texto, sin distinguir mayúsculas."""
    return {fact: fact.lower() in text.lower() for fact in expected}


def hardware_info():
    """Recoge datos del equipo sin usuario, rutas personales ni números de serie."""
    info = {"system": platform.system(), "release": platform.release(),
            "architecture": platform.machine(), "logical_cpus": os.cpu_count(),
            "processor": platform.processor() or platform.machine()}
    if platform.system() == "Windows":
        try:
            import ctypes

            class MemoryStatus(ctypes.Structure):
                _fields_ = [("length", ctypes.c_ulong), ("load", ctypes.c_ulong),
                            ("total", ctypes.c_ulonglong), ("available", ctypes.c_ulonglong),
                            ("page_total", ctypes.c_ulonglong), ("page_free", ctypes.c_ulonglong),
                            ("virtual_total", ctypes.c_ulonglong),
                            ("virtual_free", ctypes.c_ulonglong), ("extended", ctypes.c_ulonglong)]

            status = MemoryStatus(length=ctypes.sizeof(MemoryStatus))
            if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
                info["memory_bytes"] = status.total
        except (AttributeError, OSError):
            # La exportación debe funcionar aunque el sistema no exponga estos datos.
            pass
    return info


def export_json(path, data):
    """No deja un archivo parcial si se interrumpe la escritura."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent,
                                         delete=False) as stream:
            temporary = Path(stream.name)
            json.dump(data, stream, ensure_ascii=False, indent=2, allow_nan=False)
            stream.write("\n")
        temporary.replace(path)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def context_message(question, retrieved):
    blocks = [f"[{index}] {chunk['title']} · {chunk['section']}\n{chunk['text']}"
              for index, chunk in enumerate(retrieved, 1)]
    return "Fragmentos:\n\n" + "\n\n".join(blocks) + f"\n\nPregunta: {question}"


def run(spec, documents, device_name, top_k, max_chars, max_new_tokens):
    import torch
    import torch.nn.functional as F
    import transformers
    from transformers import AutoModel, AutoModelForCausalLM, AutoTokenizer, GenerationConfig

    if device_name == "auto":
        device_name = "cuda" if torch.cuda.is_available() else "cpu"
    if device_name == "cuda" and not torch.cuda.is_available():
        raise ValueError("CUDA no está disponible. Usa --device cpu.")
    device = torch.device(device_name)
    dtype = torch.float16 if device_name == "cuda" else torch.float32

    def synchronize():
        if device_name == "cuda":
            torch.cuda.synchronize()

    chunks = chunk_documents(documents["documents"], max_chars)

    started = time.perf_counter()
    embed_tokenizer = AutoTokenizer.from_pretrained(EMBEDDING_ID, revision=EMBEDDING_REVISION)
    embed_model = AutoModel.from_pretrained(
        EMBEDDING_ID, revision=EMBEDDING_REVISION, use_safetensors=True,
    ).to(device).eval()
    gen_tokenizer = AutoTokenizer.from_pretrained(GENERATOR_ID, revision=GENERATOR_REVISION)
    gen_model = AutoModelForCausalLM.from_pretrained(
        GENERATOR_ID, revision=GENERATOR_REVISION, dtype=dtype,
        trust_remote_code=False, use_safetensors=True,
    ).to(device).eval()
    synchronize()
    load_seconds = time.perf_counter() - started

    def embed(texts):
        """Embeddings E5: media de los estados ocultos y normalización L2."""
        vectors = []
        for start in range(0, len(texts), 16):
            batch = embed_tokenizer(texts[start:start + 16], padding=True, truncation=True,
                                    max_length=512, return_tensors="pt").to(device)
            with torch.inference_mode():
                hidden = embed_model(**batch).last_hidden_state
            mask = batch["attention_mask"].unsqueeze(-1).to(hidden.dtype)
            pooled = (hidden * mask).sum(1) / mask.sum(1)
            vectors.append(F.normalize(pooled, dim=-1))
        return torch.cat(vectors)

    # E5 necesita los prefijos "passage: " y "query: ".
    started = time.perf_counter()
    index = embed([f"passage: {c['title']}. {c['section']}. {c['text']}" for c in chunks])
    synchronize()
    index_seconds = time.perf_counter() - started

    parameters = {"do_sample": False, "max_new_tokens": max_new_tokens, "num_beams": 1,
                  "repetition_penalty": 1.0, "use_cache": True,
                  "eos_token_id": gen_model.generation_config.eos_token_id,
                  "pad_token_id": gen_tokenizer.pad_token_id}

    def answer(messages):
        text = gen_tokenizer.apply_chat_template(messages, tokenize=False,
                                                 add_generation_prompt=True)
        inputs = gen_tokenizer(text, return_tensors="pt").to(device)
        input_count = inputs["input_ids"].shape[1]
        synchronize()
        started = time.perf_counter()
        with torch.inference_mode():
            output = gen_model.generate(**inputs, generation_config=GenerationConfig(**parameters))
        synchronize()
        seconds = time.perf_counter() - started
        tokens = output[0, input_count:].tolist()
        eos_ids = parameters["eos_token_id"]
        eos_ids = eos_ids if isinstance(eos_ids, list) else [eos_ids]
        return {"messages": messages,
                "answer": gen_tokenizer.decode(tokens, skip_special_tokens=True).strip(),
                "input_tokens": input_count, "output_tokens": len(tokens),
                "generation_seconds": round(seconds, 6),
                "stop_reason": "eos" if tokens and tokens[-1] in eos_ids else "max_new_tokens"}

    runs = []
    for question in spec["questions"]:
        synchronize()
        started = time.perf_counter()
        query = embed([f"query: {question['text']}"])
        scores = (index @ query.T).squeeze(1).float()
        best = torch.topk(scores, k=min(top_k, len(chunks)))
        synchronize()
        retrieval_seconds = time.perf_counter() - started
        retrieved = [{**chunks[i], "rank": rank, "score": round(float(score), 6)}
                     for rank, (score, i) in enumerate(zip(best.values.tolist(),
                                                           best.indices.tolist()), 1)]
        with_context = answer([{"role": "system", "content": SYSTEM_RAG},
                               {"role": "user", "content": context_message(question["text"],
                                                                           retrieved)}])
        without_context = answer([{"role": "system", "content": SYSTEM_PLAIN},
                                  {"role": "user", "content": question["text"]}])
        expected = question.get("expected", [])
        context_text = "\n".join(chunk["text"] for chunk in retrieved)
        runs.append({
            "question_id": question["id"], "retrieval_seconds": round(retrieval_seconds, 6),
            "retrieved": retrieved, "with_context": with_context,
            "without_context": without_context,
            "checks": {"in_retrieved": check_facts(expected, context_text),
                       "in_answer_with_context": check_facts(expected, with_context["answer"]),
                       "in_answer_without_context": check_facts(expected,
                                                                without_context["answer"]),
                       "declined_with_context": NOT_FOUND.lower().rstrip(".") in
                       with_context["answer"].lower()},
        })
        print(f"{question['id']} · con contexto {with_context['generation_seconds']:.2f} s · "
              f"sin contexto {without_context['generation_seconds']:.2f} s",
              file=sys.stderr, flush=True)

    gpu = torch.cuda.get_device_name(0) if device_name == "cuda" else None
    return {
        "schema_version": 1, "generated_at": datetime.now(timezone.utc).isoformat(),
        "models": {
            "embedding": {"id": EMBEDDING_ID, "revision": EMBEDDING_REVISION,
                          "dtype": "float32", "license": "MIT"},
            "generator": {"id": GENERATOR_ID, "revision": GENERATOR_REVISION,
                          "dtype": str(dtype).removeprefix("torch."), "license": "Apache-2.0"},
        },
        "runtime": {"python": platform.python_version(), "torch": torch.__version__,
                    "transformers": transformers.__version__,
                    "tokenizers": importlib.metadata.version("tokenizers"),
                    "device": device_name, "gpu": gpu, "hardware": hardware_info()},
        "parameters": {"chunk_max_chars": max_chars, "top_k": top_k,
                       "similarity": "coseno", "system_rag": SYSTEM_RAG,
                       "system_plain": SYSTEM_PLAIN, "generation": parameters},
        "collection": {"documents": len(documents["documents"]), "chunks": len(chunks),
                       "source": documents.get("source"), "license": documents.get("license")},
        "load_seconds": round(load_seconds, 6), "index_seconds": round(index_seconds, 6),
        "questions": spec["questions"], "runs": runs,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--question", help="Pregunta nueva sobre la colección.")
    source.add_argument("--batch", type=Path, help="JSON con una lista questions.")
    parser.add_argument("--documents", type=Path, default=Path("../results/documents.json"))
    parser.add_argument("--top-k", type=int, default=4, help="Fragmentos recuperados. De 1 a 10.")
    parser.add_argument("--chunk-chars", type=int, default=800,
                        help="Tamaño máximo de un fragmento. De 200 a 2000 caracteres.")
    parser.add_argument("--max-new-tokens", type=int, default=256, help="De 16 a 512.")
    parser.add_argument("--device", choices=("cpu", "cuda", "auto"), default="auto")
    parser.add_argument("--output", type=Path, required=True, help="JSON de salida para la web.")
    args = parser.parse_args()
    try:
        if not 1 <= args.top_k <= 10:
            raise ValueError("--top-k debe estar entre 1 y 10.")
        if not 200 <= args.chunk_chars <= 2000:
            raise ValueError("--chunk-chars debe estar entre 200 y 2000.")
        if not 16 <= args.max_new_tokens <= 512:
            raise ValueError("--max-new-tokens debe estar entre 16 y 512.")
        if args.batch:
            spec = json.loads(args.batch.read_text(encoding="utf-8"))
        else:
            spec = {"questions": [{"id": "pregunta", "label": "Pregunta propia",
                                   "type": "custom", "text": args.question, "expected": []}]}
        validate_questions(spec)
        documents = validate_documents(json.loads(args.documents.read_text(encoding="utf-8")))
        data = run(spec, documents, args.device, args.top_k, args.chunk_chars,
                   args.max_new_tokens)
        export_json(args.output, data)
    except (ValueError, OSError, RuntimeError, ImportError, json.JSONDecodeError) as error:
        parser.exit(1, f"Error. {error}\n")


if __name__ == "__main__":
    main()
