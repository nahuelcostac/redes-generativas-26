"""Transcribe los audios generados con Whisper y mide cuánto se parecen al texto de entrada.

Es una comprobación automática de inteligibilidad. No sustituye la escucha humana.
"""

import argparse
import json
import platform
import re
import sys
import time
import unicodedata
import wave
from datetime import datetime, timezone
from pathlib import Path

from generate import export_json

ASR_MODEL_ID = "openai/whisper-small"
ASR_REVISION = "973afd24965f72e36ca33b3055d56a652f456b4d"


def normalize_words(text):
    """Minúsculas, sin puntuación y con espacios simples. Conserva tildes y cifras."""
    text = unicodedata.normalize("NFC", text.lower())
    text = re.sub(r"[^\w\s]", " ", text)
    return text.split()


def word_error_rate(reference, hypothesis):
    """Distancia de edición entre palabras dividida por las palabras de la referencia."""
    ref, hyp = normalize_words(reference), normalize_words(hypothesis)
    if not ref:
        raise ValueError("La referencia no puede estar vacía.")
    previous = list(range(len(hyp) + 1))
    for i, word in enumerate(ref, start=1):
        current = [i]
        for j, other in enumerate(hyp, start=1):
            current.append(min(previous[j] + 1, current[j - 1] + 1,
                               previous[j - 1] + (word != other)))
        previous = current
    return previous[-1] / len(ref)


def read_wav(path):
    import numpy as np

    with wave.open(str(path), "rb") as stream:
        if stream.getnchannels() != 1 or stream.getsampwidth() != 2:
            raise ValueError(f"{path.name} no es un WAV mono de 16 bits.")
        rate = stream.getframerate()
        frames = stream.readframes(stream.getnframes())
    return np.frombuffer(frames, dtype="<i2").astype(np.float32) / 32768, rate


def check(results_path, threads):
    import torch
    import transformers
    from transformers import WhisperForConditionalGeneration, WhisperProcessor

    data = json.loads(results_path.read_text(encoding="utf-8"))
    texts = {item["id"]: item for item in data["texts"]}
    torch.set_num_threads(threads)
    started = time.perf_counter()
    processor = WhisperProcessor.from_pretrained(ASR_MODEL_ID, revision=ASR_REVISION)
    model = WhisperForConditionalGeneration.from_pretrained(
        ASR_MODEL_ID, revision=ASR_REVISION, use_safetensors=True).eval()
    load_seconds = time.perf_counter() - started
    checks = []
    for run in data["runs"]:
        audio, rate = read_wav(results_path.parent / run["audio"])
        if rate != 16000:
            raise ValueError("Whisper necesita audio a 16 kHz.")
        features = processor(audio, sampling_rate=rate, return_tensors="pt").input_features
        started = time.perf_counter()
        with torch.inference_mode():
            ids = model.generate(features, language="es", task="transcribe", num_beams=1,
                                 do_sample=False)
        seconds = time.perf_counter() - started
        transcript = processor.batch_decode(ids, skip_special_tokens=True)[0].strip()
        reference = texts[run["text_id"]]["text"]
        wer = word_error_rate(reference, transcript)
        checks.append({"text_id": run["text_id"], "configuration_id": run["configuration_id"],
                       "transcript": transcript, "wer": round(wer, 4),
                       "seconds": round(seconds, 6)})
        print(f"{run['text_id']} / {run['configuration_id']} · WER {wer:.2f} · {transcript}",
              file=sys.stderr, flush=True)
    return {
        "schema_version": 1, "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": results_path.name,
        "model": {"id": ASR_MODEL_ID, "revision": ASR_REVISION, "license": "Apache-2.0",
                  "language": "es", "decoding": "greedy"},
        "runtime": {"python": platform.python_version(), "torch": torch.__version__,
                    "transformers": transformers.__version__, "device": "cpu",
                    "threads": threads},
        "normalization": "Minúsculas, sin puntuación. Se conservan tildes y cifras.",
        "load_seconds": round(load_seconds, 6), "checks": checks,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--results", type=Path, required=True, help="JSON creado por generate.py.")
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        if not 1 <= args.threads <= 64:
            raise ValueError("El número de hilos debe estar entre 1 y 64.")
        export_json(args.output, check(args.results, args.threads))
    except (ValueError, OSError, RuntimeError, ImportError, KeyError,
            json.JSONDecodeError) as error:
        parser.exit(1, f"Error. {error}\n")


if __name__ == "__main__":
    main()
