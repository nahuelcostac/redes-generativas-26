import copy
import json
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path

from generate import export_json, hardware_info, validate_spec

EXAMPLES = json.loads(Path(__file__).with_name("examples.json").read_text(encoding="utf-8"))


class GeneratorTests(unittest.TestCase):
    def test_hardware_information_is_optional_in_restricted_environments(self):
        with patch("generate.platform.system", return_value="Darwin"), patch(
            "generate.subprocess.run", side_effect=OSError("Consulta no permitida")
        ):
            info = hardware_info()
        self.assertTrue(info["processor"])
        self.assertNotIn("memory_bytes", info)

    def test_rejects_invalid_inputs_and_parameters(self):
        for field, values in (("temperature", [0, -1, float("nan"), float("inf"), True]),
                              ("max_new_tokens", [0, 257, 2.5, True]),
                              ("seed", [-1, 2**32, True])):
            for value in values:
                with self.subTest(field=field, value=value):
                    data = copy.deepcopy(EXAMPLES)
                    data["configurations"][0][field] = value
                    with self.assertRaises(ValueError):
                        validate_spec(data)
        data = copy.deepcopy(EXAMPLES)
        data["prompts"][0]["text"] = " \n "
        with self.assertRaises(ValueError):
            validate_spec(data)

    def test_rejects_ambiguous_ids(self):
        data = copy.deepcopy(EXAMPLES)
        data["prompts"][1]["id"] = data["prompts"][0]["id"]
        with self.assertRaises(ValueError):
            validate_spec(data)

    def test_invalid_cli_exits_without_creating_results(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "results.json"
            result = subprocess.run([
                sys.executable, str(Path(__file__).with_name("generate.py")),
                "--prompt", "Hola", "--temperature", "0", "--output", str(target),
            ], capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertIn("temperatura", result.stderr)
            self.assertFalse(target.exists())

    def test_export_preserves_unicode_and_existing_file_on_failure(self):
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / "nested" / "results.json"
            export_json(target, {"texto": "¡Energía!"})
            self.assertEqual(json.loads(target.read_text())["texto"], "¡Energía!")
            before = target.read_bytes()
            with self.assertRaises(ValueError):
                export_json(target, {"invalid": float("nan")})
            self.assertEqual(target.read_bytes(), before)
            self.assertEqual(list(target.parent.iterdir()), [target])


if __name__ == "__main__":
    unittest.main()
