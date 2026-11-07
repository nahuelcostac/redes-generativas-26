"""Las entradas inválidas deben fallar antes de cargar o descargar el modelo."""

from pathlib import Path
import os
import subprocess
import sys
import unittest


class CommandValidation(unittest.TestCase):
    def test_invalid_inputs(self):
        script = Path(__file__).with_name("generate.py")
        base = [sys.executable, str(script), "--revision", "b261bac6fd2cf515557d5d0707481eafa0485ec2"]
        cases = [
            (["--prompt", " "], "El texto no puede estar"),
            (["--prompt", "prueba", "--steps", "0"], "entre 1 y 4 pasos"),
            (["--prompt", "prueba", "--seed", "-1"], "La semilla debe estar"),
            (["--prompt", "prueba", "--threads", "0"], "de hilos debe ser positivo"),
        ]
        for arguments, expected in cases:
            with self.subTest(arguments=arguments):
                process = subprocess.run(base + arguments, capture_output=True, text=True, encoding="utf-8",
                                         env={**os.environ, "PYTHONUTF8": "1"}, timeout=20)
                self.assertEqual(process.returncode, 2)
                self.assertIn(expected, process.stderr)
                self.assertNotIn("Cargando SD-Turbo", process.stdout)


if __name__ == "__main__":
    unittest.main()
