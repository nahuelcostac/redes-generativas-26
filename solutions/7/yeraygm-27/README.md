# Generar imágenes a partir de texto

Solución de YerayGM-27 para la issue [#7](https://github.com/nahuelcostac/redes-generativas-26/issues/7).

La interfaz compara generaciones guardadas en `results/`. Permite escoger una descripción, una semilla y los pasos de inferencia. La comparación conserva el texto y cambia solo la semilla o los pasos. Las imágenes no se generan dentro del navegador.

## Ejecución local

Se necesita Python 3.10 o posterior. La lista fijada instala PyTorch para CPU y permite repetir esta ejecución en Windows. Una GPU compatible reduce el tiempo; para usar NVIDIA, instala el paquete de PyTorch apropiado para tu versión de CUDA y actualiza la línea de PyTorch en `code/requirements.txt`. Los pesos se descargan a la caché local de Hugging Face y no se guardan en este repositorio.

Desde esta carpeta:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r code\requirements.txt
python code\generate.py
```

El script descarga el modelo si no está en la caché y exporta las imágenes y los parámetros reales a `results/manifest.json` y a los PNG correspondientes. Para generar otras semillas y pasos:

```powershell
python code\generate.py --seeds 17 41 99 --steps 1 2 4
```

Se pueden añadir textos libres repitiendo `--prompt`:

```powershell
python code\generate.py --seeds 17 41 99 --steps 1 2 4 --prompt "A yellow kayak on a quiet lake"
```

El script rechaza textos vacíos y combinaciones de pasos fuera del rango 1–4.

La ejecución reemplaza el manifiesto y vuelve a escribir los PNG con los mismos nombres para los ejemplos predeterminados. Conserva una copia de `results/` si quieres guardar otras generaciones.

## Modelo y datos

- Modelo: [`stabilityai/sd-turbo`](https://huggingface.co/stabilityai/sd-turbo), revisión `0096a99066b73650354282eeef18114cf0dab75c`.
- Ejecución: Diffusers `0.35.2`, PyTorch `2.9.0`, Transformers `4.57.1`, Accelerate `1.11.0`, Pillow `11.3.0` y Safetensors `0.6.2`. Las versiones están fijadas en `code/requirements.txt`.
- Resolución: 512 × 512 píxeles. La guía se fija en `0.0`, como indica la ficha del modelo. Las comparaciones usan 1, 2 y 4 pasos y semillas 17, 41 y 99.
- Entradas: tres textos escritos para esta solución, uno sobre un objeto sencillo y dos sobre escenas con varios elementos. La interfaz enseña la descripción en español y permite desplegar el prompt inglés enviado al modelo. No se usa un conjunto de imágenes externo.

SD-Turbo es una destilación de Stable Diffusion 2.1 para síntesis rápida. Su ficha recomienda 512 × 512 y entre 1 y 4 pasos. El modelo puede omitir elementos de la descripción, especialmente en escenas complejas; las imágenes son ejemplos cualitativos, no una garantía de fidelidad.

## Resultados y comprobaciones

Estado actual: `ready`. Se generaron y revisaron las 27 combinaciones de `results/manifest.json` en esta máquina (tres textos, tres semillas y tres valores de pasos):

- Equipo observado: Windows, Intel Core i7-1165G7 a 2,80 GHz, 4 núcleos/8 hilos lógicos. PyTorch `2.9.0+cpu`; no se detectó CUDA. La inferencia se ejecutó en CPU.
- La primera carga, que descargó los pesos, tardó 205,6 s. La carga desde la caché para la matriz ampliada tardó 0,8 s.
- Las 27 inferencias de la matriz final quedaron entre 13,7 y 28,0 s. El manifiesto registra el tiempo de cada combinación.
- La taza roja aparece en las nueve imágenes. El perro y la bicicleta aparecen en las nueve escenas del parque; algunas imágenes cambian el color de la bicicleta o añaden globos. En el bodegón aparecen la manzana, el plátano y la botella en las nueve imágenes; algunas añaden fruta o recortan objetos en los bordes.

Los tiempos por imagen, las descripciones en ambos idiomas y las observaciones visuales están en `results/manifest.json`. Son valoraciones manuales, no resultados de un detector de objetos.

## Uso de agentes

El agente preparó la interfaz, el script local y un manifiesto común para que cada control apunte a una salida exportada. La muestra ampliada compara tres semillas y 1, 2 y 4 pasos sin cambiar el prompt. Las observaciones son una revisión visual, no una evaluación automática.
