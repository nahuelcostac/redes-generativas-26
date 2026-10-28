"""Genera continuaciones reales y exporta los datos que consume la web."""

import argparse
import importlib.metadata
import json
import math
import os
import platform
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path

MODEL_ID = "Qwen/Qwen2.5-0.5B"
REVISION = "060db6499f32faf8b98477b0a26969ef7d8b9987"
MAX_INPUT_TOKENS = 1024


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
        if len(prompt["text"]) > 10000:
            raise ValueError("El texto de entrada no puede superar 10000 caracteres.")
        if not isinstance(prompt.get("label"), str) or not prompt["label"].strip():
            raise ValueError("Cada entrada necesita una etiqueta.")
    for config in spec["configurations"]:
        temperature = config.get("temperature")
        if (type(temperature) not in (int, float) or not math.isfinite(temperature)
                or not 0 < temperature <= 2):
            raise ValueError("La temperatura debe ser mayor que 0 y como máximo 2.")
        if type(config.get("max_new_tokens")) is not int or not 1 <= config["max_new_tokens"] <= 256:
            raise ValueError("La longitud máxima debe estar entre 1 y 256 tokens nuevos.")
        if type(config.get("seed")) is not int or not 0 <= config["seed"] < 2**32:
            raise ValueError("La semilla debe ser un entero entre 0 y 4294967295.")
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


def generate(spec, device_name, threads):
    import torch
    import transformers
    from transformers import AutoModelForCausalLM, AutoTokenizer, GenerationConfig, set_seed

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
    # Validar todos los textos antes de cargar los pesos. Nunca truncar en silencio.
    encoded = []
    for prompt in spec["prompts"]:
        inputs = tokenizer(prompt["text"], return_tensors="pt")
        if inputs["input_ids"].shape[1] > MAX_INPUT_TOKENS:
            raise ValueError(f"La entrada {prompt['id']} supera {MAX_INPUT_TOKENS} tokens.")
        encoded.append(inputs)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID, revision=REVISION, dtype=torch.float32,
        trust_remote_code=False, use_safetensors=True,
    ).to(device).eval()
    synchronize()
    load_seconds = time.perf_counter() - started
    runs = []
    # Una configuración nueva evita heredar parámetros implícitos del modelo.
    for prompt, inputs in zip(spec["prompts"], encoded):
        inputs = {key: value.to(device) for key, value in inputs.items()}
        input_count = inputs["input_ids"].shape[1]
        for config in spec["configurations"]:
            parameters = {
                "do_sample": True, "temperature": config["temperature"],
                "max_new_tokens": config["max_new_tokens"], "top_p": 0.95, "top_k": 50,
                "repetition_penalty": 1.0, "num_beams": 1, "use_cache": True,
                "bos_token_id": model.config.bos_token_id,
                "eos_token_id": model.config.eos_token_id,
                "pad_token_id": tokenizer.eos_token_id,
            }
            set_seed(config["seed"])
            synchronize()
            started = time.perf_counter()
            with torch.inference_mode():
                output = model.generate(**inputs, generation_config=GenerationConfig(**parameters))
            synchronize()
            seconds = time.perf_counter() - started
            tokens = output[0, input_count:].tolist()
            eos_ids = parameters["eos_token_id"]
            eos_ids = eos_ids if isinstance(eos_ids, list) else [eos_ids]
            runs.append({
                "prompt_id": prompt["id"], "configuration_id": config["id"],
                "parameters": {**parameters, "seed": config["seed"]},
                "continuation": tokenizer.decode(tokens, skip_special_tokens=True),
                "generated_token_ids": tokens, "input_tokens": input_count,
                "output_tokens": len(tokens), "generation_seconds": round(seconds, 6),
                "stop_reason": "eos" if tokens and tokens[-1] in eos_ids else "max_new_tokens",
            })
            print(f"{prompt['id']} / {config['id']} · {len(tokens)} tokens · {seconds:.3f} s",
                  file=sys.stderr, flush=True)
    return {
        "schema_version": 1, "generated_at": datetime.now(timezone.utc).isoformat(),
        "model": {"id": MODEL_ID, "revision": REVISION, "dtype": "float32", "license": "Apache-2.0"},
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
    source.add_argument("--prompt", help="Texto que se desea continuar.")
    source.add_argument("--batch", type=Path, help="JSON con prompts y configurations.")
    parser.add_argument("--temperature", type=float, default=0.7, help="Solo con --prompt. Por defecto 0.7.")
    parser.add_argument("--max-new-tokens", type=int, default=96, help="Solo con --prompt. De 1 a 256.")
    parser.add_argument("--seed", type=int, default=42, help="Solo con --prompt. Por defecto 42.")
    parser.add_argument("--device", choices=("cpu", "mps", "cuda", "auto"), default="cpu")
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--output", type=Path, required=True, help="JSON de salida para la web.")
    args = parser.parse_args()
    try:
        if not 1 <= args.threads <= 64:
            raise ValueError("El número de hilos debe estar entre 1 y 64.")
        if args.batch:
            spec = json.loads(args.batch.read_text(encoding="utf-8"))
        else:
            spec = {"prompts": [{"id": "entrada", "label": "Entrada propia", "text": args.prompt}],
                    "configurations": [{"id": "configuracion", "temperature": args.temperature,
                                        "max_new_tokens": args.max_new_tokens, "seed": args.seed}]}
        validate_spec(spec)
        data = generate(spec, args.device, args.threads)
        export_json(args.output, data)
    except (ValueError, OSError, RuntimeError, ImportError) as error:
        parser.exit(1, f"Error. {error}\n")


if __name__ == "__main__":
    main()
