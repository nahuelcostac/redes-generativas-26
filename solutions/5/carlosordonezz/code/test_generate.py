"""Pruebas sin modelo. Ejecutar desde code/ con: python -m unittest -v"""

import json
import tempfile
import unittest
import wave
from pathlib import Path
from unittest import mock

import numpy as np

import generate
from check_asr import normalize_words, word_error_rate

VALID = {
    "texts": [{"id": "uno", "label": "Uno", "text": "Hola."}],
    "configurations": [{"id": "base", "label": "Base", "speaking_rate": 1.0, "noise_scale": 0.667,
                        "noise_scale_duration": 0.8, "seed": 42}],
}


def variant(path, value):
    spec = json.loads(json.dumps(VALID))
    target = spec
    for key in path[:-1]:
        target = target[key]
    target[path[-1]] = value
    return spec


class ValidateSpec(unittest.TestCase):
    def test_accepts_valid_spec(self):
        self.assertIs(generate.validate_spec(VALID), VALID)

    def test_rejects_invalid_values(self):
        cases = [
            (("texts",), []),
            (("texts", 0, "text"), "   "),
            (("texts", 0, "text"), "a" * 1001),
            (("texts", 0, "id"), "Con espacios"),
            (("texts", 0, "label"), ""),
            (("configurations", 0, "speaking_rate"), 0.4),
            (("configurations", 0, "speaking_rate"), float("nan")),
            (("configurations", 0, "noise_scale"), -0.1),
            (("configurations", 0, "noise_scale_duration"), 2),
            (("configurations", 0, "noise_scale"), True),
            (("configurations", 0, "seed"), 1.5),
            (("configurations", 0, "seed"), 2**32),
        ]
        for path, value in cases:
            with self.subTest(path=path, value=value):
                with self.assertRaises(ValueError):
                    generate.validate_spec(variant(path, value))

    def test_rejects_duplicated_ids(self):
        spec = json.loads(json.dumps(VALID))
        spec["texts"].append(dict(spec["texts"][0]))
        with self.assertRaises(ValueError):
            generate.validate_spec(spec)


class WriteWav(unittest.TestCase):
    def test_writes_pcm_and_reports_clipping(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "a.wav"
            samples = np.array([0.0, 0.5, -1.5, 1.2], dtype=np.float32)
            measures = generate.write_wav(path, samples, 16000)
            with wave.open(str(path), "rb") as stream:
                self.assertEqual((stream.getnchannels(), stream.getsampwidth(),
                                  stream.getframerate(), stream.getnframes()), (1, 2, 16000, 4))
                pcm = np.frombuffer(stream.readframes(4), dtype="<i2")
            self.assertEqual(pcm.tolist(), [0, 16384, -32767, 32767])
            self.assertEqual(measures["clipped_samples"], 2)
            self.assertEqual(measures["duration_seconds"], 0.0003)


class Run(unittest.TestCase):
    def test_failure_keeps_previous_results(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / "examples.json"
            output.write_text("{}", encoding="utf-8")
            audio = Path(folder) / "audio" / "examples"
            audio.mkdir(parents=True)
            (audio / "old.wav").write_bytes(b"old")
            with mock.patch.object(generate, "synthesize", side_effect=RuntimeError("fallo")):
                with self.assertRaises(RuntimeError):
                    generate.run(VALID, output, 1)
            self.assertEqual(output.read_text(encoding="utf-8"), "{}")
            self.assertTrue((audio / "old.wav").exists())
            self.assertEqual(sorted(p.name for p in Path(folder).iterdir()), ["audio", "examples.json"])


class WordErrorRate(unittest.TestCase):
    def test_normalizes_punctuation_and_case(self):
        self.assertEqual(normalize_words("¿Qué tal? ¡Bien!"), ["qué", "tal", "bien"])
        self.assertEqual(word_error_rate("Hola, ¿qué tal?", "hola qué tal"), 0)

    def test_counts_substitutions_insertions_and_deletions(self):
        self.assertAlmostEqual(word_error_rate("a b c d", "a x c"), 0.5)
        self.assertAlmostEqual(word_error_rate("a b", "a b c d"), 1.0)


if __name__ == "__main__":
    unittest.main()
