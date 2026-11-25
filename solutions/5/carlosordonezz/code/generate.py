"""Sintetiza voz en español en local y exporta los audios y los datos que consume la web."""

import argparse
import importlib.metadata
import json
import math
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import time
import wave
from datetime import datetime, timezone
from pathlib import Path

MODEL_ID = "facebook/mms-tts-spa"
REVISION = "833b96c0278c85cf09776d565ba8f1cb2819f7ec"
MAX_TEXT_CHARS = 1000
ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,39}$")
# Rangos aceptados. Fuera de ellos el audio deja de ser útil para comparar.
LIMITS = {
    "speaking_rate": (0.5, 2.0),
    "noise_scale": (0.0, 1.5),
    "noise_scale_duration": (0.0, 1.5),
}


def is_number(value):
    return type(value) in (int, float) and math.isfinite(value)


def validate_spec(spec):
    """Valida el lote antes de importar PyTorch o descargar el modelo."""
    if not isinstance(spec, dict):
        raise ValueError("El lote debe ser un objeto JSON.")
    for field in ("texts", "configurations"):
        items = spec.get(field)
        if not isinstance(items, list) or not items:
            raise ValueError(f"{field} debe contener al menos un elemento.")
        ids = set()
        for item in items:
            if not isinstance(item, dict):
                raise ValueError(f"Cada elemento de {field} debe ser un objeto.")
            key = item.get("id")
            if not isinstance(key, str) or not ID_PATTERN.match(key) or key in ids:
                raise ValueError(
                    f"Cada id de {field} debe ser único y usar solo minúsculas, cifras y guiones."
                )
            ids.add(key)
            if not isinstance(item.get("label"), str) or not item["label"].strip():
                raise ValueError(f"Cada elemento de {field} necesita una etiqueta.")
    for text in spec["texts"]:
        if not isinstance(text.get("text"), str) or not text["text"].strip():
            raise ValueError("El texto de entrada no puede estar vacío.")
        if len(text["text"]) > MAX_TEXT_CHARS:
            raise ValueError(f"El texto no puede superar {MAX_TEXT_CHARS} caracteres.")
    for config in spec["configurations"]:
        for name, (low, high) in LIMITS.items():
            value = config.get(name)
            if not is_number(value) or not low <= value <= high:
                raise ValueError(f"{name} debe ser un número entre {low} y {high}.")
        if type(config.get("seed")) is not int or not 0 <= config["seed"] < 2**32:
            raise ValueError("La semilla debe ser un entero entre 0 y 4294967295.")
    return spec


def hardware_info():
    """Recoge datos del equipo sin usuario, rutas personales ni números de serie."""
    info = {"system": platform.system(), "release": platform.release(),
            "architecture": platform.machine(), "logical_cpus": os.cpu_count(),
            "processor": platform.processor() or platform.machine()}
    try:
        if platform.system() == "Darwin":
            for key, name in (("machdep.cpu.brand_string", "processor"),
                              ("hw.memsize", "memory_bytes")):
                result = subprocess.run(["sysctl", "-n", key], capture_output=True,
                                        text=True, check=True)
                info[name] = int(result.stdout) if name == "memory_bytes" else result.stdout.strip()
        elif platform.system() == "Linux":
            cpuinfo = Path("/proc/cpuinfo").read_text(encoding="utf-8")
            match = re.search(r"^model name\s*:\s*(.+)$", cpuinfo, re.MULTILINE)
            if match:
                info["processor"] = match.group(1).strip()
            meminfo = Path("/proc/meminfo").read_text(encoding="utf-8")
            match = re.search(r"^MemTotal:\s*(\d+) kB$", meminfo, re.MULTILINE)
            if match:
                info["memory_bytes"] = int(match.group(1)) * 1024
    except (OSError, subprocess.CalledProcessError, ValueError):
        # La exportación debe funcionar aunque el sistema no exponga estos datos.
        pass
    return info


def write_wav(path, samples, sampling_rate):
    """Guarda audio mono PCM de 16 bits. Recorta a [-1, 1] y devuelve sus medidas."""
    import numpy as np

    clipped = np.clip(samples, -1.0, 1.0)
    pcm = (clipped * 32767).round().astype("<i2")
    with wave.open(str(path), "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(sampling_rate)
        stream.writeframes(pcm.tobytes())
    peak = float(np.abs(samples).max()) if samples.size else 0.0
    rms = float(np.sqrt(np.mean(np.square(clipped)))) if samples.size else 0.0
    return {
        "samples": int(samples.size),
        "duration_seconds": round(samples.size / sampling_rate, 4),
        "peak": round(peak, 4),
        "rms_dbfs": round(20 * math.log10(rms), 2) if rms > 0 else None,
        "clipped_samples": int(np.count_nonzero(np.abs(samples) > 1.0)),
    }


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


def synthesize(spec, threads, staging, audio_prefix):
    import numpy
    import torch
    import transformers
    from transformers import AutoTokenizer, VitsModel

    torch.set_num_threads(threads)
    started = time.perf_counter()
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, revision=REVISION)
    # Tokenizar todo antes de cargar los pesos. Un texto sin caracteres válidos se rechaza.
    encoded = []
    for item in spec["texts"]:
        inputs = tokenizer(item["text"], return_tensors="pt")
        normalized = tokenizer.decode(inputs["input_ids"][0]).strip()
        if not normalized.replace("_", "").strip():
            raise ValueError(f"El texto {item['id']} no contiene caracteres que el modelo pueda leer.")
        encoded.append((item, inputs, normalized))
    model = VitsModel.from_pretrained(MODEL_ID, revision=REVISION, use_safetensors=True).eval()
    load_seconds = time.perf_counter() - started
    sampling_rate = model.config.sampling_rate
    defaults = {name: getattr(model, name) for name in LIMITS}

    runs = []
    for item, inputs, normalized in encoded:
        for config in spec["configurations"]:
            # VitsModel lee estos parámetros como atributos, no como argumentos de forward.
            for name in LIMITS:
                setattr(model, name, config[name])
            torch.manual_seed(config["seed"])
            started = time.perf_counter()
            with torch.inference_mode():
                waveform = model(**inputs).waveform[0]
            seconds = time.perf_counter() - started
            filename = f"{item['id']}--{config['id']}.wav"
            measures = write_wav(staging / filename, waveform.numpy().astype(numpy.float32),
                                 sampling_rate)
            runs.append({
                "text_id": item["id"], "configuration_id": config["id"],
                "parameters": {**{name: config[name] for name in LIMITS}, "seed": config["seed"]},
                "audio": f"{audio_prefix}/{filename}",
                "input_tokens": int(inputs["input_ids"].shape[1]),
                "generation_seconds": round(seconds, 6),
                "real_time_factor": round(seconds / measures["duration_seconds"], 4)
                if measures["duration_seconds"] else None,
                **measures,
            })
            print(f"{item['id']} / {config['id']} · {measures['duration_seconds']:.2f} s de audio"
                  f" · {seconds:.3f} s", file=sys.stderr, flush=True)
    return {
        "schema_version": 1, "generated_at": datetime.now(timezone.utc).isoformat(),
        "model": {"id": MODEL_ID, "revision": REVISION, "architecture": "VITS",
                  "dtype": "float32", "license": "CC-BY-NC-4.0",
                  "parameters": sum(p.numel() for p in model.parameters()),
                  "sampling_rate": sampling_rate, "defaults": defaults},
        "runtime": {"python": platform.python_version(), "torch": torch.__version__,
                    "transformers": transformers.__version__,
                    "huggingface_hub": importlib.metadata.version("huggingface-hub"),
                    "numpy": numpy.__version__, "device": "cpu", "threads": threads,
                    "hardware": hardware_info()},
        "load_seconds": round(load_seconds, 6),
        "texts": [{**item, "model_text": normalized} for item, _, normalized in encoded],
        "configurations": spec["configurations"], "runs": runs,
    }


def run(spec, output, threads):
    """Escribe los audios en una carpeta temporal y la publica solo si todo termina bien."""
    validate_spec(spec)
    output.parent.mkdir(parents=True, exist_ok=True)
    audio_prefix = f"audio/{output.stem}"
    target = output.parent / audio_prefix
    staging = Path(tempfile.mkdtemp(prefix=".audio-", dir=output.parent))
    try:
        data = synthesize(spec, threads, staging, audio_prefix)
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            shutil.rmtree(target)
        staging.replace(target)
        export_json(output, data)
    finally:
        shutil.rmtree(staging, ignore_errors=True)
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--text", help="Texto en español que se desea sintetizar.")
    source.add_argument("--batch", type=Path, help="JSON con texts y configurations.")
    parser.add_argument("--speaking-rate", type=float, default=1.0,
                        help="Solo con --text. Velocidad de habla, de 0.5 a 2. Por defecto 1.")
    parser.add_argument("--noise-scale", type=float, default=0.667,
                        help="Solo con --text. Variación de la voz, de 0 a 1.5. Por defecto 0.667.")
    parser.add_argument("--noise-scale-duration", type=float, default=0.8,
                        help="Solo con --text. Variación del ritmo, de 0 a 1.5. Por defecto 0.8.")
    parser.add_argument("--seed", type=int, default=42, help="Solo con --text. Por defecto 42.")
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--output", type=Path, required=True,
                        help="JSON de salida. Los audios se guardan en audio/<nombre>/ a su lado.")
    args = parser.parse_args()
    try:
        if not 1 <= args.threads <= 64:
            raise ValueError("El número de hilos debe estar entre 1 y 64.")
        if args.output.suffix != ".json":
            raise ValueError("La salida debe ser un archivo .json.")
        if args.batch:
            spec = json.loads(args.batch.read_text(encoding="utf-8"))
        else:
            spec = {"texts": [{"id": "entrada", "label": "Entrada propia", "text": args.text}],
                    "configurations": [{"id": "configuracion", "label": "Configuración propia",
                                        "speaking_rate": args.speaking_rate,
                                        "noise_scale": args.noise_scale,
                                        "noise_scale_duration": args.noise_scale_duration,
                                        "seed": args.seed}]}
        run(spec, args.output, args.threads)
    except (ValueError, OSError, RuntimeError, ImportError, json.JSONDecodeError) as error:
        parser.exit(1, f"Error. {error}\n")


if __name__ == "__main__":
    main()
