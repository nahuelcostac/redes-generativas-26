"""Reanuda el peso UNet oficial si falla la transferencia de Hugging Face."""

import hashlib
import os
from pathlib import Path
import shutil
import subprocess
import sys

from generate import ROOT

REVISION = "b261bac6fd2cf515557d5d0707481eafa0485ec2"
SHA256 = "40ec400881e27d1376c7c95c5bd495f407b33756e80eb6365e301c33a07af6e5"
URL = f"https://huggingface.co/stabilityai/sd-turbo/resolve/{REVISION}/unet/diffusion_pytorch_model.fp16.safetensors?download=true"


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def main():
    curl = shutil.which("curl.exe") or shutil.which("curl")
    if not curl:
        raise RuntimeError("No se encuentra curl. Utiliza el generador con el cliente de Hugging Face.")
    cache = Path(os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface")).resolve()
    if cache.is_relative_to(ROOT.parents[2]):
        raise RuntimeError("Configura HF_HOME fuera del repositorio.")
    folder = cache / "hub" / "models--stabilityai--sd-turbo" / "snapshots" / REVISION / "unet"
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / "diffusion_pytorch_model.fp16.safetensors"
    if target.exists():
        if digest(target) != SHA256:
            raise RuntimeError("El peso existente no coincide con la revisión esperada. No se modifica.")
        print("El peso ya existe y su SHA256 es correcto.")
        return
    partial = target.with_suffix(target.suffix + ".part")
    print("Reanudando el peso oficial en la caché externa. Se conserva el archivo parcial si falla.", flush=True)
    result = subprocess.run([
        curl, "--location", "--fail", "--continue-at", "-", "--connect-timeout", "20",
        "--max-time", "300", "--speed-limit", "1024", "--speed-time", "30",
        "--output", str(partial), URL,
    ])
    if result.returncode:
        raise RuntimeError("La descarga no ha terminado. Puedes repetir este comando para reanudarla.")
    if digest(partial) != SHA256:
        raise RuntimeError("El SHA256 no coincide. No se usa el peso descargado.")
    partial.replace(target)
    print("Peso completo y SHA256 verificado. Puedes ejecutar el generador con --offline si ya tienes los demás archivos.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Error de descarga. {error}", file=sys.stderr)
        sys.exit(1)
