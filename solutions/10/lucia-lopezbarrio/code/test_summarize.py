"""Comprueba la validación sin cargar el modelo. Ejecuta `python -m unittest` en esta carpeta."""

import json
import unittest
from pathlib import Path

from summarize import MAX_MAX_NEW_TOKENS, validate_spec


def spec():
    return {
        "prompts": [{"id": "a", "label": "A", "text": "Texto."}],
        "configurations": [{"id": "b", "label": "B", "max_new_tokens": 80,
                            "min_new_tokens": 24, "num_beams": 4}],
    }


class ValidateSpec(unittest.TestCase):
    def test_acepta_el_lote_publicado(self):
        path = Path(__file__).with_name("examples.json")
        validate_spec(json.loads(path.read_text(encoding="utf-8")))

    def test_rechaza_textos_vacios(self):
        data = spec()
        data["prompts"][0]["text"] = "   "
        with self.assertRaisesRegex(ValueError, "vacío"):
            validate_spec(data)

    def test_rechaza_ids_duplicados(self):
        data = spec()
        data["prompts"].append(dict(data["prompts"][0]))
        with self.assertRaisesRegex(ValueError, "único"):
            validate_spec(data)

    def test_rechaza_longitudes_fuera_de_rango(self):
        for value in (9, MAX_MAX_NEW_TOKENS + 1, 80.0, True):
            data = spec()
            data["configurations"][0]["max_new_tokens"] = value
            with self.assertRaisesRegex(ValueError, "longitud máxima"):
                validate_spec(data)

    def test_rechaza_un_minimo_mayor_que_el_maximo(self):
        data = spec()
        data["configurations"][0]["min_new_tokens"] = 81
        with self.assertRaisesRegex(ValueError, "longitud mínima"):
            validate_spec(data)

    def test_rechaza_haces_fuera_de_rango(self):
        data = spec()
        data["configurations"][0]["num_beams"] = 0
        with self.assertRaisesRegex(ValueError, "haces"):
            validate_spec(data)


if __name__ == "__main__":
    unittest.main()
