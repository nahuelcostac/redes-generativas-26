"""Responde preguntas con RAG y exporta los datos que consume la web.

El flujo tiene tres pasos. Divide los documentos en fragmentos, recupera los
más parecidos a la pregunta mediante embeddings y genera una respuesta con un
modelo de lenguaje. Cada pregunta se responde también sin contexto para poder
comparar ambas salidas.
"""

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

EMBEDDING_MODEL = "intfloat/multilingual-e5-small"
EMBEDDING_REVISION = "614241f622f53c4eeff9890bdc4f31cfecc418b3"
GENERATOR_MODEL = "Qwen/Qwen2.5-1.5B-Instruct"
GENERATOR_REVISION = "989aa7980e4cf806f80c7fef2b1adb7bc71aa306"
EMBEDDING_MAX_TOKENS = 512
QUESTION_TYPES = ("directa", "combinada", "sin-respuesta")
# Secciones de Wikipedia sin contenido útil en el texto plano.
SKIPPED_SECTIONS = {"referencias", "enlaces externos", "bibliografía", "bibliografía utilizada",
                    "véase también", "redes sociales", "notas"}
NO_ANSWER = "No puedo responder con los documentos disponibles."
SYSTEM_WITH_CONTEXT = (
    "Eres un asistente que responde preguntas sobre la Universidad de Oviedo. "
    "Responde en español y usa solo la información de los fragmentos. "
    "Cita los fragmentos que uses con su número entre corchetes, por ejemplo [1]. "
    f"Si los fragmentos no contienen la respuesta, responde exactamente: {NO_ANSWER}"
)
SYSTEM_WITHOUT_CONTEXT = (
    "Eres un asistente que responde preguntas sobre la Universidad de Oviedo. "
    "Responde en español de forma breve."
)
DEFAULT_PARAMETERS = {"chunk_words": 120, "overlap_words": 30, "top_k": 4, "max_new_tokens": 256}


def validate_parameters(parameters):
    merged = {**DEFAULT_PARAMETERS, **(parameters or {})}
    for key, value in merged.items():
        if type(value) is not int:
            raise ValueError(f"{key} debe ser un entero.")
    if not 20 <= merged["chunk_words"] <= 300:
        raise ValueError("chunk_words debe estar entre 20 y 300.")
    if not 0 <= merged["overlap_words"] < merged["chunk_words"]:
        raise ValueError("overlap_words debe ser menor que chunk_words y no negativo.")
    if not 1 <= merged["top_k"] <= 10:
        raise ValueError("top_k debe estar entre 1 y 10.")
    if not 1 <= merged["max_new_tokens"] <= 1024:
        raise ValueError("max_new_tokens debe estar entre 1 y 1024.")
    return merged


def validate_spec(spec):
    """Valida el lote antes de cargar las dependencias o descargar los modelos."""
    if not isinstance(spec, dict):
        raise ValueError("El lote debe ser un objeto JSON.")
    questions = spec.get("questions")
    if not isinstance(questions, list) or not questions:
        raise ValueError("questions debe contener al menos una pregunta.")
    ids = set()
    for question in questions:
        if not isinstance(question, dict):
            raise ValueError("Cada pregunta debe ser un objeto.")
        key = question.get("id")
        if not isinstance(key, str) or not re.fullmatch(r"[a-z0-9-]+", key) or key in ids:
            raise ValueError("Cada id debe ser único y usar minúsculas, números o guiones.")
        ids.add(key)
        text = question.get("text")
        if not isinstance(text, str) or not text.strip():
            raise ValueError("El texto de la pregunta no puede estar vacío.")
        if len(text) > 500:
            raise ValueError("La pregunta no puede superar 500 caracteres.")
        if question.get("type") not in QUESTION_TYPES:
            raise ValueError(f"El tipo debe ser uno de {', '.join(QUESTION_TYPES)}.")
    return {"parameters": validate_parameters(spec.get("parameters")), "questions": questions}


def split_sections(text):
    """Separa el texto plano de Wikipedia en (sección, contenido)."""
    sections = []
    current, lines = "Introducción", []
    for line in text.splitlines():
        heading = re.fullmatch(r"\s*(=+)\s*(.+?)\s*\1\s*", line)
        if heading:
            sections.append((current, "\n".join(lines).strip()))
            current, lines = heading.group(2).replace("\u200b", "").strip(), []
        else:
            lines.append(line)
    sections.append((current, "\n".join(lines).strip()))
    return [(name, body) for name, body in sections
            if body and name.lower() not in SKIPPED_SECTIONS]


def chunk_documents(documents, chunk_words, overlap_words):
    """Divide cada sección en ventanas de palabras con solapamiento."""
    chunks = []
    step = chunk_words - overlap_words
    for document in documents:
        for section, body in split_sections(document["text"]):
            words = body.replace("\u200b", "").split()
            start = 0
            while True:
                piece = words[start:start + chunk_words]
                chunks.append({
                    "id": f"{document['id']}-{len(chunks)}",
                    "document_id": document["id"],
                    "section": section,
                    "text": " ".join(piece),
                })
                if start + chunk_words >= len(words):
                    break
                start += step
    return chunks


def passage_text(chunk, documents_by_id):
    title = documents_by_id[chunk["document_id"]]["title"]
    return f"{title}. {chunk['section']}. {chunk['text']}"


def rank(scores, top_k):
    """Devuelve los índices de las puntuaciones más altas, en orden descendente."""
    return sorted(range(len(scores)), key=lambda index: (-scores[index], index))[:top_k]


def build_messages(question, passages=None):
    """Prepara los mensajes del modelo. Sin pasajes, la pregunta va sin contexto."""
    if passages is None:
        return [{"role": "system", "content": SYSTEM_WITHOUT_CONTEXT},
                {"role": "user", "content": question}]
    context = "\n\n".join(f"[{number}] {passage}"
                          for number, passage in enumerate(passages, start=1))
    return [{"role": "system", "content": SYSTEM_WITH_CONTEXT},
            {"role": "user", "content": f"Fragmentos:\n{context}\n\nPregunta: {question}"}]


def cited_fragments(answer, count):
    """Números de fragmento citados en la respuesta, sin repetir y dentro del rango."""
    cited = []
    for match in re.findall(r"\[(\d+)\]", answer):
        number = int(match)
        if 1 <= number <= count and number not in cited:
            cited.append(number)
    return cited


def hardware_info(torch, device_name):
    """Datos del equipo sin usuario, rutas personales ni números de serie."""
    info = {"system": platform.system(), "release": platform.release(),
            "architecture": platform.machine(), "logical_cpus": os.cpu_count(),
            "processor": platform.processor() or platform.machine()}
    if platform.system() == "Windows":
        import ctypes

        class MemoryStatus(ctypes.Structure):
            _fields_ = [("length", ctypes.c_ulong), ("load", ctypes.c_ulong),
                        ("total", ctypes.c_ulonglong), ("available", ctypes.c_ulonglong),
                        ("total_page", ctypes.c_ulonglong), ("available_page", ctypes.c_ulonglong),
                        ("total_virtual", ctypes.c_ulonglong),
                        ("available_virtual", ctypes.c_ulonglong),
                        ("available_extended", ctypes.c_ulonglong)]

        status = MemoryStatus(length=ctypes.sizeof(MemoryStatus))
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            info["memory_bytes"] = status.total
    if device_name == "cuda":
        properties = torch.cuda.get_device_properties(0)
        info["gpu"] = properties.name
        info["gpu_memory_bytes"] = properties.total_memory
        info["cuda"] = torch.version.cuda
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


def run(spec, corpus, device_name):
    import torch
    import transformers
    from transformers import AutoModel, AutoModelForCausalLM, AutoTokenizer

    if device_name == "auto":
        device_name = "cuda" if torch.cuda.is_available() else "cpu"
    if device_name == "cuda" and not torch.cuda.is_available():
        raise ValueError("CUDA no está disponible. Usa --device cpu.")
    device = torch.device(device_name)
    dtype = torch.float16 if device_name == "cuda" else torch.float32

    def synchronize():
        if device_name == "cuda":
            torch.cuda.synchronize()

    parameters = spec["parameters"]
    documents = corpus["documents"]
    documents_by_id = {document["id"]: document for document in documents}
    chunks = chunk_documents(documents, parameters["chunk_words"], parameters["overlap_words"])
    passages = [passage_text(chunk, documents_by_id) for chunk in chunks]

    # Índice de embeddings. E5 necesita los prefijos "passage: " y "query: ".
    started = time.perf_counter()
    embed_tokenizer = AutoTokenizer.from_pretrained(EMBEDDING_MODEL, revision=EMBEDDING_REVISION)
    embed_model = AutoModel.from_pretrained(EMBEDDING_MODEL, revision=EMBEDDING_REVISION,
                                            dtype=torch.float32).to(device).eval()
    synchronize()
    embedding_load_seconds = time.perf_counter() - started

    def embed(texts):
        vectors = []
        for start in range(0, len(texts), 32):
            batch = embed_tokenizer(texts[start:start + 32], padding=True, truncation=True,
                                    max_length=EMBEDDING_MAX_TOKENS, return_tensors="pt").to(device)
            with torch.inference_mode():
                hidden = embed_model(**batch).last_hidden_state
            mask = batch["attention_mask"].unsqueeze(-1).to(hidden.dtype)
            pooled = (hidden * mask).sum(1) / mask.sum(1)
            vectors.append(torch.nn.functional.normalize(pooled, dim=-1))
        return torch.cat(vectors)

    lengths = [len(ids) for ids in embed_tokenizer([f"passage: {p}" for p in passages])["input_ids"]]
    if max(lengths) > EMBEDDING_MAX_TOKENS:
        raise ValueError("Un fragmento supera el límite del modelo de embeddings. Reduce chunk_words.")
    started = time.perf_counter()
    index = embed([f"passage: {passage}" for passage in passages])
    synchronize()
    index_seconds = time.perf_counter() - started

    started = time.perf_counter()
    tokenizer = AutoTokenizer.from_pretrained(GENERATOR_MODEL, revision=GENERATOR_REVISION)
    model = AutoModelForCausalLM.from_pretrained(GENERATOR_MODEL, revision=GENERATOR_REVISION,
                                                 dtype=dtype).to(device).eval()
    synchronize()
    generator_load_seconds = time.perf_counter() - started
    eos = model.generation_config.eos_token_id
    eos_ids = set(eos if isinstance(eos, list) else [eos]) | {tokenizer.eos_token_id}

    def generate(messages):
        prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        inputs = tokenizer(prompt, return_tensors="pt").to(device)
        synchronize()
        started = time.perf_counter()
        with torch.inference_mode():
            output = model.generate(**inputs, do_sample=False, temperature=None, top_p=None,
                                    top_k=None, max_new_tokens=parameters["max_new_tokens"],
                                    pad_token_id=tokenizer.eos_token_id)
        synchronize()
        seconds = time.perf_counter() - started
        new_tokens = output[0, inputs["input_ids"].shape[1]:].tolist()
        return {
            "answer": tokenizer.decode(new_tokens, skip_special_tokens=True).strip(),
            "prompt": prompt,
            "input_tokens": inputs["input_ids"].shape[1],
            "output_tokens": len(new_tokens),
            "stop_reason": "eos" if new_tokens and new_tokens[-1] in eos_ids else "length",
            "generation_seconds": round(seconds, 3),
        }

    if device_name == "cuda":
        torch.cuda.reset_peak_memory_stats()
    results = []
    for question in spec["questions"]:
        print(f"Pregunta {question['id']}…", file=sys.stderr)
        started = time.perf_counter()
        query = embed([f"query: {question['text']}"])[0]
        scores = (index @ query).float().tolist()
        synchronize()
        retrieval_seconds = time.perf_counter() - started
        selected = rank(scores, parameters["top_k"])
        with_context = generate(build_messages(question["text"],
                                               [passages[position] for position in selected]))
        without_context = generate(build_messages(question["text"]))
        with_context["cited"] = cited_fragments(with_context["answer"], len(selected))
        results.append({
            **question,
            "retrieved": [{"chunk_id": chunks[position]["id"], "rank": rank_number,
                           "score": round(scores[position], 4)}
                          for rank_number, position in enumerate(selected, start=1)],
            "retrieval_seconds": round(retrieval_seconds, 4),
            "with_context": with_context,
            "without_context": without_context,
        })

    used = {item["chunk_id"] for result in results for item in result["retrieved"]}
    return {
        "created_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "models": {
            "embedding": {"id": EMBEDDING_MODEL, "revision": EMBEDDING_REVISION,
                          "dtype": "float32", "pooling": "mean", "normalized": True},
            "generator": {"id": GENERATOR_MODEL, "revision": GENERATOR_REVISION,
                          "dtype": str(dtype).removeprefix("torch.")},
        },
        "parameters": {**parameters, "do_sample": False,
                       "system_with_context": SYSTEM_WITH_CONTEXT,
                       "system_without_context": SYSTEM_WITHOUT_CONTEXT},
        "corpus": {
            "source": corpus["source"], "license": corpus["license"],
            "fetched_at": corpus["fetched_at"], "documents": len(documents),
            "chunks": len(chunks), "max_chunk_tokens": max(lengths),
        },
        "documents": [{key: document[key] for key in ("id", "title", "url", "revision")}
                      for document in documents],
        # Solo se publican los fragmentos recuperados. El resto se recalcula con el script.
        "chunks": [chunk for chunk in chunks if chunk["id"] in used],
        "runtime": {
            "device": device_name, "python": platform.python_version(),
            "torch": torch.__version__, "transformers": transformers.__version__,
            "huggingface_hub": importlib.metadata.version("huggingface-hub"),
            "hardware": hardware_info(torch, device_name),
            "peak_gpu_memory_bytes": (torch.cuda.max_memory_allocated()
                                      if device_name == "cuda" else None),
        },
        "timings": {"embedding_load_seconds": round(embedding_load_seconds, 3),
                    "index_seconds": round(index_seconds, 3),
                    "generator_load_seconds": round(generator_load_seconds, 3)},
        "questions": results,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__,
                                     formatter_class=argparse.RawDescriptionHelpFormatter)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--questions", help="Lote JSON con preguntas y parámetros.")
    source.add_argument("--question", help="Una pregunta suelta.")
    parser.add_argument("--type", default="directa", choices=QUESTION_TYPES,
                        help="Tipo de la pregunta suelta.")
    parser.add_argument("--documents", default="../results/documents.json")
    parser.add_argument("--top-k", type=int, help="Fragmentos recuperados. Sustituye al lote.")
    parser.add_argument("--max-new-tokens", type=int, help="Límite de la respuesta.")
    parser.add_argument("--device", default="auto", choices=("auto", "cuda", "cpu"))
    parser.add_argument("--output", required=True, help="Ruta del JSON de resultados.")
    args = parser.parse_args(argv)
    try:
        if args.questions:
            spec = json.loads(Path(args.questions).read_text(encoding="utf-8"))
        else:
            spec = {"questions": [{"id": "consulta", "type": args.type, "text": args.question}]}
        if isinstance(spec, dict):
            overrides = {"top_k": args.top_k, "max_new_tokens": args.max_new_tokens}
            spec["parameters"] = {**spec.get("parameters", {}),
                                  **{key: value for key, value in overrides.items()
                                     if value is not None}}
        spec = validate_spec(spec)
        corpus = json.loads(Path(args.documents).read_text(encoding="utf-8"))
        if not corpus.get("documents"):
            raise ValueError("La colección no contiene documentos.")
        data = run(spec, corpus, args.device)
    except (OSError, ValueError) as error:
        parser.exit(2, f"Error: {error}\n")
    export_json(Path(args.output), data)
    for result in data["questions"]:
        print(f"\n[{result['id']}] {result['text']}")
        print(f"Con contexto: {result['with_context']['answer']}")
        print(f"Sin contexto: {result['without_context']['answer']}")


if __name__ == "__main__":
    main()
