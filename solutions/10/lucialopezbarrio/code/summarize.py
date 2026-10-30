"""Genera resúmenes reales en español y exporta los datos que consume la web."""

import argparse
import importlib.metadata
import json
import os
import platform
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

MODEL_ID = "ELiRF/mt5-base-dacsa-es"
REVISION = "27056b1969ac884f9f8eea6cb2068420f272a36a"
# Valor de model_max_length en el tokenizador del modelo. El modelo no lo impone por sí mismo.
MAX_INPUT_TOKENS = 768
# Valores de task_specific_params.summarization en la configuración del modelo.
MIN_SUMMARY_TOKENS = 24
REPETITION_PENALTY = 2.0
NO_REPEAT_NGRAM_SIZE = 3
MIN_MAX_NEW_TOKENS = 10
MAX_MAX_NEW_TOKENS = 256


def validate_spec(spec):
    """Valida antes de cargar las dependencias o descargar el modelo."""
    if not isinstance(spec, dict):
        raise ValueError("El lote debe ser un objeto JSON.")
    for field in ("prompts", "configurations"):
        items = spec.get(field)
        if not isinstance(items, list) or not items:
            raise ValueError(f"{field} debe contener al menos un elemento.")
        ids = set()
        for item in items:
            if not isinstance(item, dict):
                raise ValueError(f"Cada elemento de {field} debe ser un objeto.")
            key = item.get("id")
            if not isinstance(key, str) or not key.strip() or key in ids:
                raise ValueError(f"Cada id de {field} debe ser un texto único y no vacío.")
            ids.add(key)
    for prompt in spec["prompts"]:
        if not isinstance(prompt.get("text"), str) or not prompt["text"].strip():
            raise ValueError("El texto de entrada no puede estar vacío.")
        if not isinstance(prompt.get("label"), str) or not prompt["label"].strip():
            raise ValueError("Cada texto necesita una etiqueta.")
    for config in spec["configurations"]:
        maximum = config.get("max_new_tokens")
        if type(maximum) is not int or not MIN_MAX_NEW_TOKENS <= maximum <= MAX_MAX_NEW_TOKENS:
            raise ValueError(
                f"La longitud máxima debe estar entre {MIN_MAX_NEW_TOKENS} "
                f"y {MAX_MAX_NEW_TOKENS} tokens."
            )
        minimum = config.get("min_new_tokens")
        if type(minimum) is not int or not 1 <= minimum <= maximum:
            raise ValueError("La longitud mínima debe estar entre 1 y la longitud máxima.")
        if type(config.get("num_beams")) is not int or not 1 <= config["num_beams"] <= 8:
            raise ValueError("El número de haces debe estar entre 1 y 8.")
        if not isinstance(config.get("label"), str) or not config["label"].strip():
            raise ValueError("Cada configuración necesita una etiqueta.")
    return spec


def hardware_info():
    """Recoge datos del equipo sin usuario, rutas personales ni números de serie."""
    info = {"system": platform.system(), "release": platform.release(),
            "architecture": platform.machine(), "logical_cpus": os.cpu_count(),
            "processor": platform.processor() or platform.machine()}
    if platform.system() == "Darwin":
        for key, name in (("machdep.cpu.brand_string", "processor"), ("hw.memsize", "memory_bytes")):
            try:
                result = subprocess.run(["sysctl", "-n", key], capture_output=True,
                                        text=True, check=True)
                info[name] = int(result.stdout) if name == "memory_bytes" else result.stdout.strip()
            except (OSError, subprocess.CalledProcessError, ValueError):
                # La exportación debe funcionar aunque el entorno no exponga estos datos.
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


def encode(tokenizer, text):
    """Trunca a la longitud admitida e informa de la parte del texto que lee el modelo."""
    total = len(tokenizer(text, verbose=False)["input_ids"])
    inputs = tokenizer(text, truncation=True, max_length=MAX_INPUT_TOKENS, return_tensors="pt",
                       return_offsets_mapping=True)
    offsets = inputs.pop("offset_mapping")[0].tolist()
    used = inputs["input_ids"].shape[1]
    return inputs, {
        "input_tokens_total": total, "input_tokens_used": used, "truncated": total > used,
        "input_characters_used": max(end for _, end in offsets),
    }


def summarize(spec, device_name, threads):
    import torch
    import transformers
    from transformers import AutoModelForSeq2SeqLM, AutoTokenizer, GenerationConfig

    torch.set_num_threads(threads)
    if device_name == "auto":
        device_name = "cuda" if torch.cuda.is_available() else (
            "mps" if torch.backends.mps.is_available() else "cpu")
    if device_name == "mps" and not torch.backends.mps.is_available():
        raise ValueError("MPS no está disponible. Usa --device cpu.")
    if device_name == "cuda" and not torch.cuda.is_available():
        raise ValueError("CUDA no está disponible. Usa --device cpu.")
    device = torch.device(device_name)

    def synchronize():
        if device_name == "mps":
            torch.mps.synchronize()
        elif device_name == "cuda":
            torch.cuda.synchronize()

    started = time.perf_counter()
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, revision=REVISION, trust_remote_code=False)
    if not tokenizer.is_fast:
        raise RuntimeError("Se necesita un tokenizador rápido para medir el texto leído.")
    encoded = [encode(tokenizer, prompt["text"]) for prompt in spec["prompts"]]
    model = AutoModelForSeq2SeqLM.from_pretrained(
        MODEL_ID, revision=REVISION, dtype=torch.float32,
        trust_remote_code=False, use_safetensors=True,
    ).to(device).eval()
    synchronize()
    load_seconds = time.perf_counter() - started
    runs = []
    for prompt, (inputs, measures) in zip(spec["prompts"], encoded):
        inputs = {key: value.to(device) for key, value in inputs.items()}
        for config in spec["configurations"]:
            # Se indican todos los valores para que los resultados los registren.
            parameters = {
                "do_sample": False, "num_beams": config["num_beams"], "max_new_tokens": config["max_new_tokens"],
                "min_new_tokens": config["min_new_tokens"],
                "repetition_penalty": REPETITION_PENALTY,
                "no_repeat_ngram_size": NO_REPEAT_NGRAM_SIZE,
                "early_stopping": config["num_beams"] > 1, "use_cache": True,
                "decoder_start_token_id": model.config.decoder_start_token_id,
                "eos_token_id": model.config.eos_token_id,
                "pad_token_id": tokenizer.pad_token_id,
            }
            synchronize()
            started = time.perf_counter()
            with torch.inference_mode():
                output = model.generate(**inputs, generation_config=GenerationConfig(**parameters))
            synchronize()
            seconds = time.perf_counter() - started
            tokens = output[0, 1:].tolist()
            runs.append({
                "prompt_id": prompt["id"], "configuration_id": config["id"],
                "parameters": parameters, "summary": tokenizer.decode(tokens, skip_special_tokens=True),
                "generated_token_ids": tokens, **measures, "output_tokens": len(tokens),
                "generation_seconds": round(seconds, 6),
                "stop_reason": "eos" if tokens[-1] == model.config.eos_token_id else "max_new_tokens",
            })
            print(f"{prompt['id']} / {config['id']} · {len(tokens)} tokens · {seconds:.3f} s",
                  file=sys.stderr, flush=True)
    return {
        "schema_version": 1, "generated_at": datetime.now(timezone.utc).isoformat(),
        "model": {"id": MODEL_ID, "revision": REVISION, "dtype": "float32", "license": None,
                  "max_input_tokens": MAX_INPUT_TOKENS},
        "runtime": {"python": platform.python_version(), "torch": torch.__version__,
                    "transformers": transformers.__version__,
                    "tokenizers": importlib.metadata.version("tokenizers"),
                    "huggingface_hub": importlib.metadata.version("huggingface-hub"),
                    "device": device_name, "threads": threads, "hardware": hardware_info()},
        "load_seconds": round(load_seconds, 6),
        "prompts": spec["prompts"], "configurations": spec["configurations"], "runs": runs,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--text", help="Texto que se desea resumir.")
    source.add_argument("--file", type=Path, help="Archivo de texto UTF-8 que se desea resumir.")
    source.add_argument("--batch", type=Path, help="JSON con prompts y configurations.")
    parser.add_argument("--max-new-tokens", type=int, default=80,
                        help=f"Longitud máxima del resumen, de {MIN_MAX_NEW_TOKENS} "
                             f"a {MAX_MAX_NEW_TOKENS} tokens. Se ignora con --batch.")
    parser.add_argument("--min-new-tokens", type=int,
                        help=f"Longitud mínima. Por defecto {MIN_SUMMARY_TOKENS} o la máxima "
                             "si es menor. Se ignora con --batch.")
    parser.add_argument("--num-beams", type=int, default=4, help="De 1 a 8. Se ignora con --batch.")
    parser.add_argument("--device", choices=("cpu", "mps", "cuda", "auto"), default="cpu")
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--output", type=Path, help="JSON de salida. Obligatorio con --batch.")
    args = parser.parse_args()
    try:
        if not 1 <= args.threads <= 64:
            raise ValueError("El número de hilos debe estar entre 1 y 64.")
        if args.batch and not args.output:
            raise ValueError("--batch necesita --output.")
        if args.batch:
            spec = json.loads(args.batch.read_text(encoding="utf-8"))
        else:
            text = args.text if args.text is not None else args.file.read_text(encoding="utf-8")
            minimum = args.min_new_tokens
            if minimum is None:
                minimum = min(MIN_SUMMARY_TOKENS, args.max_new_tokens)
            spec = {"prompts": [{"id": "entrada", "label": "Texto propio", "text": text}],
                    "configurations": [{"id": "configuracion", "label": "Configuración propia",
                                        "max_new_tokens": args.max_new_tokens,
                                        "min_new_tokens": minimum,
                                        "num_beams": args.num_beams}]}
        validate_spec(spec)
        data = summarize(spec, args.device, args.threads)
        if args.output:
            export_json(args.output, data)
        if not args.batch:
            run = data["runs"][0]
            if run["truncated"]:
                print(f"Aviso. Solo se han leído {run['input_tokens_used']} de "
                      f"{run['input_tokens_total']} tokens.", file=sys.stderr)
            print(run["summary"])
    except (ValueError, OSError, RuntimeError, ImportError) as error:
        parser.exit(1, f"Error. {error}\n")


if __name__ == "__main__":
    main()
