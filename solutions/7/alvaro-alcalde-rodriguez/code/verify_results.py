"""Comprueba PNG, hashes y diseño del experimento sin cargar el modelo."""

import hashlib
import json
from pathlib import Path
import struct
from PIL import Image

from generate import EXAMPLES

root = Path(__file__).resolve().parents[1] / "results"
manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
images = manifest["images"]
expected = {f"{slug}-s{seed}-p{steps}" for slug, _, _ in EXAMPLES
            for seed, steps in [(42, 1), (314, 1), (42, 2), (42, 4)]}
assert expected.issubset({item["id"] for item in images}), "Faltan experimentos."
assert len({item["id"] for item in images}) == len(images), "Hay identificadores duplicados."
prompts = {slug: prompt for slug, _, prompt in EXAMPLES}
evaluation = json.loads((root / "evaluation.json").read_text(encoding="utf-8"))
assert {item["id"] for item in evaluation["images"]} == {item["id"] for item in images}, "Faltan revisiones visuales."
assert all(item["observation"].strip() for item in evaluation["images"]), "Hay observaciones vacías."
for item in images:
    assert item["id"] == f"{item['example']}-s{item['seed']}-p{item['steps']}", "Parámetros e identificador no coinciden."
    assert item["file"] == item["id"] + ".png", "Archivo e identificador no coinciden."
    assert item["prompt"] == prompts[item["example"]], "El texto no coincide con la entrada del experimento."
    file = root / item["file"]
    assert file.resolve().parent == root.resolve(), "Ruta fuera de results."
    content = file.read_bytes()
    assert content[:8] == b"\x89PNG\r\n\x1a\n", f"PNG incorrecto {file.name}"
    assert struct.unpack(">II", content[16:24]) == (512, 512), f"Dimensiones incorrectas {file.name}"
    assert hashlib.sha256(content).hexdigest() == item["sha256"], f"Hash incorrecto {file.name}"
    with Image.open(file) as image:
        image.verify()
    assert item["inference_seconds"] > 0
    assert item["environment"]["packages"]["diffusers"] == "0.35.2"
print(f"Verificadas {len(images)} imágenes, dimensiones, hashes y configuraciones de la práctica.")
