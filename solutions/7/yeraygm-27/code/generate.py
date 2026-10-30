"""Genera los ejemplos locales de la solución con Diffusers y SD-Turbo."""

import argparse
import json
import time
from pathlib import Path

import torch
from diffusers import AutoPipelineForText2Image


MODEL_ID = "stabilityai/sd-turbo"
MODEL_REVISION = "0096a99066b73650354282eeef18114cf0dab75c"
WIDTH = 512
HEIGHT = 512
DEFAULT_PROMPTS = [
    (
        "taza",
        "Una taza roja",
        "Una taza roja de cerámica sobre una mesa de madera, con luz suave de mañana.",
        "A single red ceramic mug on a wooden table, soft morning window light, "
        "simple composition, realistic photograph",
        "La taza roja aparece en las nueve imágenes. Cambian el fondo, el encuadre y algunos detalles de forma.",
    ),
    (
        "parque",
        "Perro, bicicleta y globo",
        "Un perro marrón junto a una bicicleta azul y un globo rojo atado al manillar, en un parque.",
        "A small brown dog beside one blue bicycle with one red balloon tied to its "
        "handlebar in a green city park, all three subjects clearly visible, sunny afternoon, "
        "realistic photograph",
        "El perro y la bicicleta aparecen en las nueve; algunas imágenes cambian el color de la bicicleta o añaden globos.",
    ),
    (
        "bodegon",
        "Manzana, plátano y botella",
        "Una manzana roja, un plátano amarillo y una botella de vidrio transparente sobre una mesa blanca.",
        "Exactly one red apple, one yellow banana and one clear glass bottle, spaced "
        "apart on a plain white table, all three objects fully visible, simple product "
        "photograph, soft natural daylight",
        "La manzana, el plátano y la botella aparecen en las nueve; algunas imágenes añaden fruta o recortan objetos en los bordes.",
    ),
]


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--device", choices=("auto", "cuda", "cpu"), default="auto")
    parser.add_argument("--seeds", nargs="+", type=int, default=[17, 41, 99])
    parser.add_argument("--steps", nargs="+", type=int, default=[1, 2, 4])
    parser.add_argument(
        "--prompt",
        action="append",
        metavar="TEXTO",
        help="Texto libre adicional. Se puede repetir; se añade como un ejemplo nuevo.",
    )
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parent.parent / "results")
    return parser.parse_args()


def main():
    args = parse_args()
    if any(steps < 1 or steps > 4 for steps in args.steps):
        raise SystemExit("SD-Turbo admite entre 1 y 4 pasos para esta comparación.")
    if not args.seeds:
        raise SystemExit("Indica al menos una semilla.")
    if len(set(args.seeds)) != len(args.seeds):
        raise SystemExit("No repitas semillas en una misma ejecución.")
    if len(set(args.steps)) != len(args.steps):
        raise SystemExit("No repitas pasos en una misma ejecución.")
    if any(not prompt.strip() for prompt in args.prompt or []):
        raise SystemExit("El texto de entrada no puede estar vacío.")

    device = args.device
    if device == "auto":
        device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cuda" and not torch.cuda.is_available():
        raise SystemExit("Se pidió CUDA, pero PyTorch no detecta una GPU compatible.")

    dtype = torch.float16 if device == "cuda" else torch.float32
    args.output.mkdir(parents=True, exist_ok=True)
    prompts = list(DEFAULT_PROMPTS)
    for index, text in enumerate(args.prompt or [], start=1):
        prompts.append(
            (
                f"personalizado-{index}",
                f"Texto personalizado {index}",
                text,
                text,
                "Pendiente de revisión visual.",
            )
        )

    print(f"Cargando {MODEL_ID} ({MODEL_REVISION}) en {device}...")
    started = time.perf_counter()
    pipeline = AutoPipelineForText2Image.from_pretrained(
        MODEL_ID,
        revision=MODEL_REVISION,
        torch_dtype=dtype,
        use_safetensors=True,
    ).to(device)
    load_seconds = time.perf_counter() - started
    generations = []
    timings = []

    for prompt_id, title, description, prompt, observation in prompts:
        for seed in args.seeds:
            for steps in args.steps:
                generator = torch.Generator(device=device).manual_seed(seed)
                started = time.perf_counter()
                image = pipeline(
                    prompt=prompt,
                    num_inference_steps=steps,
                    guidance_scale=0.0,
                    width=WIDTH,
                    height=HEIGHT,
                    generator=generator,
                ).images[0]
                elapsed = time.perf_counter() - started
                filename = f"{prompt_id}-semilla-{seed}-pasos-{steps}.png"
                image.save(args.output / filename)
                generations.append(
                    {
                        "promptId": prompt_id,
                        "prompt": prompt,
                        "seed": seed,
                        "steps": steps,
                        "guidanceScale": 0.0,
                        "width": WIDTH,
                        "height": HEIGHT,
                        "image": filename,
                    }
                )
                timings.append(
                    {
                        "promptId": prompt_id,
                        "seed": seed,
                        "steps": steps,
                        "seconds": round(elapsed, 3),
                    }
                )
                print(f"{filename}: {elapsed:.2f} s")

    manifest = {
        "model": MODEL_ID,
        "revision": MODEL_REVISION,
        "resolution": {"width": WIDTH, "height": HEIGHT},
        "device": device,
        "dtype": str(dtype),
        "modelLoadSeconds": round(load_seconds, 3),
        "prompts": [
            {
                "id": prompt_id,
                "title": title,
                "description": description,
                "modelPrompt": prompt,
                "observation": observation,
            }
            for prompt_id, title, description, prompt, observation in prompts
        ],
        "generations": generations,
        "timingsSeconds": timings,
    }
    (args.output / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"Guardados {len(generations)} resultados en {args.output}")


if __name__ == "__main__":
    main()
