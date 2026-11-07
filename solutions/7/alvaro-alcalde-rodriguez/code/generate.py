"""Genera imágenes reales con SD-Turbo y exporta un catálogo reproducible."""

import argparse
import ctypes
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import sys
import time
from datetime import datetime, timezone

MODEL = "stabilityai/sd-turbo"
ROOT = Path(__file__).resolve().parents[1]
EXAMPLES = [
    ("tetera", "Una tetera roja", "A studio photograph of a single red ceramic teapot on a white table, plain white background."),
    ("cactus", "Un cactus en una maceta", "A studio photograph of a small green cactus in a terracotta pot on a wooden table, plain beige background."),
    ("escena", "Bicicleta, banco y casa", "A red bicycle beside a blue bench in front of a yellow house, a green tree on the left, daytime, photograph."),
]


def arguments():
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--suite", action="store_true", help="Generar los doce experimentos.")
    group.add_argument("--prompt", help="Descripción para generar una imagen nueva.")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--steps", type=int, default=1)
    parser.add_argument("--revision", required=True, help="SHA completo de la revisión del modelo.")
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cpu")
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--offline", action="store_true", help="Usar solo los pesos ya descargados.")
    parser.add_argument("--output", type=Path, default=ROOT / "results")
    args = parser.parse_args()
    if args.prompt is not None and not args.prompt.strip():
        parser.error("El texto no puede estar vacío.")
    if not 0 <= args.seed < 2**32:
        parser.error("La semilla debe estar entre 0 y 4294967295.")
    if not 1 <= args.steps <= 4:
        parser.error("SD-Turbo admite en esta práctica entre 1 y 4 pasos.")
    if args.threads < 1:
        parser.error("El número de hilos debe ser positivo.")
    if len(args.revision) != 40 or any(c not in "0123456789abcdef" for c in args.revision):
        parser.error("La revisión debe ser un SHA de 40 caracteres hexadecimales.")
    cache = Path(os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface")).resolve()
    repo = ROOT.parents[2]
    if cache.is_relative_to(repo):
        parser.error("Configura HF_HOME fuera del repositorio antes de descargar los pesos.")
    args.cache_dir = cache / "hub"
    return args


def hardware():
    cpu = platform.processor()
    memory = None
    if sys.platform == "win32":
        import winreg

        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, r"HARDWARE\DESCRIPTION\System\CentralProcessor\0") as key:
            cpu = winreg.QueryValueEx(key, "ProcessorNameString")[0].strip()

        class MemoryStatus(ctypes.Structure):
            _fields_ = [("length", ctypes.c_ulong), ("load", ctypes.c_ulong)] + [
                (name, ctypes.c_ulonglong) for name in
                ("total", "available", "page_total", "page_available", "virtual_total", "virtual_available", "extended")
            ]

        status = MemoryStatus()
        status.length = ctypes.sizeof(status)
        if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(status)):
            memory = status.total
    return {"os": platform.platform(), "cpu": cpu, "ram_bytes": memory}


def main():
    args = arguments()
    # Las entradas inválidas se rechazan antes de importar o descargar el modelo.
    import torch
    from diffusers import AutoPipelineForText2Image

    torch.set_num_threads(args.threads)
    if args.device == "cuda" and not torch.cuda.is_available():
        raise RuntimeError("Se pidió CUDA, pero PyTorch no detecta una GPU compatible.")
    args.output.mkdir(parents=True, exist_ok=True)
    manifest_path = args.output / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists() else {"schema_version": 1, "images": []}
    if args.suite:
        jobs = [(slug, title, prompt, seed, steps) for slug, title, prompt in EXAMPLES
                for seed, steps in [(42, 1), (314, 1), (42, 2), (42, 4)]]
    else:
        slug = "personalizado-" + hashlib.sha256(args.prompt.strip().encode()).hexdigest()[:10]
        jobs = [(slug, "Texto personalizado", args.prompt.strip(), args.seed, args.steps)]

    print("Cargando SD-Turbo. La primera ejecución descarga los pesos fuera del repositorio.", flush=True)
    start = time.perf_counter()
    dtype = torch.float32 if args.device == "cpu" else torch.float16
    pipe = AutoPipelineForText2Image.from_pretrained(
        MODEL, revision=args.revision, variant="fp16", torch_dtype=dtype, cache_dir=str(args.cache_dir),
        use_safetensors=True, local_files_only=args.offline,
    ).to(args.device)
    pipe.enable_attention_slicing()
    load_seconds = time.perf_counter() - start
    environment = {
        **hardware(), "python": platform.python_version(), "device": args.device,
        "dtype": str(dtype), "threads": args.threads,
        "packages": {p: importlib.metadata.version(p) for p in
                     ["torch", "diffusers", "transformers", "accelerate", "Pillow", "safetensors", "huggingface-hub"]},
    }
    for slug, title, prompt, seed, steps in jobs:
        identifier = f"{slug}-s{seed}-p{steps}"
        previous = next((item for item in manifest["images"] if item["id"] == identifier), None)
        if previous:
            if (previous["model_revision"] != args.revision or previous["prompt"] != prompt):
                raise ValueError(f"El experimento {identifier} ya existe con otros parámetros. Usa otro --output.")
            file = args.output / previous["file"]
            if file.exists() and hashlib.sha256(file.read_bytes()).hexdigest() == previous["sha256"]:
                print(f"Conservado {identifier} (integridad comprobada).", flush=True)
                continue
        print(f"Generando {identifier}", flush=True)
        generator = torch.Generator(device=args.device).manual_seed(seed)
        start = time.perf_counter()
        result = pipe(prompt=prompt, num_inference_steps=steps, guidance_scale=0.0,
                      width=512, height=512, generator=generator)
        if args.device == "cuda":
            torch.cuda.synchronize()
        elapsed = time.perf_counter() - start
        if getattr(result, "nsfw_content_detected", None) and any(result.nsfw_content_detected):
            raise RuntimeError("El modelo ha bloqueado una salida. No se añade al catálogo.")
        image_path = args.output / f"{identifier}.png"
        result.images[0].save(image_path)
        record = {
            "id": identifier, "example": slug, "title": title, "prompt": prompt,
            "seed": seed, "steps": steps, "width": 512, "height": 512,
            "guidance_scale": 0.0, "model_id": MODEL, "model_revision": args.revision,
            "weight_variant": "fp16", "scheduler": type(pipe.scheduler).__name__,
            "scheduler_config": dict(pipe.scheduler.config),
            "file": image_path.name, "sha256": hashlib.sha256(image_path.read_bytes()).hexdigest(),
            "inference_seconds": round(elapsed, 3), "load_seconds": round(load_seconds, 3),
            "created_at": datetime.now(timezone.utc).isoformat(), "environment": environment,
        }
        manifest["images"] = [item for item in manifest["images"] if item["id"] != identifier] + [record]
        temporary = manifest_path.with_suffix(".tmp")
        temporary.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        temporary.replace(manifest_path)
        print(f"Guardado {image_path.name}. Inferencia {elapsed:.2f} s.", flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Error de generación. {error}", file=sys.stderr)
        sys.exit(1)
