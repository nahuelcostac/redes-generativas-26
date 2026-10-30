# Generar descripciones de imágenes

Solución de `pedrovallina-uo` para la [issue #4](https://github.com/nahuelcostac/redes-generativas-26/issues/4).

La interfaz permite elegir una imagen y comparar dos descripciones generadas para esa misma imagen. Los resultados están calculados previamente. La web no descarga ni ejecuta el modelo.

## Ejecución local

Se necesita Node.js 22.12 o posterior y npm. La solución usa la dependencia `@huggingface/transformers` que ya incluye el repositorio. Desde la raíz, instala las dependencias con `npm ci`.

Para repetir las cuatro generaciones, ejecuta desde esta carpeta:

```sh
cd solutions/4/pedrovallina-uo/code
node generate.mjs --batch examples.json --output ../results/examples.json
```

La primera ejecución necesita Internet para descargar el modelo. El script guarda la caché en `~/.cache/huggingface/transformers-cache`, fuera del repositorio. La inferencia se ejecuta en CPU. `--batch` permite seleccionar otro archivo de entradas. `--output` indica dónde guardar los resultados.

El lote `code/examples.json` fija las imágenes, sus fuentes y las configuraciones. El script valida identificadores, archivos y parámetros antes de cargar el modelo. Escribe el resultado completo en `results/examples.json` solo después de terminar todas las generaciones.

## Modelo y datos

Se usa [Xenova/vit-gpt2-image-captioning](https://huggingface.co/Xenova/vit-gpt2-image-captioning/tree/215b4edcb7ec1fad5905a18a03f7b2007f6fabd0), revisión `215b4edcb7ec1fad5905a18a03f7b2007f6fabd0`, con licencia Apache-2.0. Es la versión ONNX para Transformers.js del modelo base [nlpconnect/vit-gpt2-image-captioning](https://huggingface.co/nlpconnect/vit-gpt2-image-captioning). Produce descripciones en inglés. La interfaz conserva el texto original para no alterar la salida del modelo.

Se utilizan `mishig/sample_images/teapot.jpg` y `mishig/sample_images/airport.jpg`, descargadas de la revisión `6003d93` del conjunto [mishig/sample_images](https://huggingface.co/datasets/mishig/sample_images/tree/6003d93). La primera muestra un objeto principal y la segunda una escena con un autobús y aviones. La ficha del conjunto no declara una licencia para sus archivos; la interfaz y este documento enlazan la procedencia de cada imagen.

Para cada imagen se exportan dos configuraciones:

- Búsqueda voraz, con un haz y hasta 32 tokens nuevos.
- Muestreo, con un haz, temperatura `0.8`, `top_k=50`, semilla `42` y hasta 32 tokens nuevos.

## Resultados observados

Las cuatro inferencias se ejecutaron el 30 de octubre de 2026 en Windows 10 x64, con Node.js `v24.22.1`, Transformers.js `4.3.1` y CPU. El equipo informó un Intel Core i5-10310U a 1.70 GHz, 8 procesadores lógicos y 16 GiB de RAM. Se usó ONNX Runtime con pesos cuantizados `q8`.

| Imagen     | Búsqueda voraz | Muestreo |
| ---------- | -------------: | -------: |
| Tetera     |        0,867 s |  1,152 s |
| Aeropuerto |        0,961 s |  1,016 s |

Los tiempos miden cada llamada de inferencia una vez cargado el modelo. No incluyen la descarga ni la carga inicial de los pesos. Las salidas son en inglés:

- Tetera: “a small ceramic pot with a flower on it” y “a small cup with a green and white handle on a table”. El modelo identifica un recipiente, pero confunde el objeto y añade detalles que no aparecen en la imagen.
- Aeropuerto: “a plane is on the tarmac with a bus” y “airplanes are parked at the tarmac of an airport”. Ambas describen los aviones; la segunda omite el autobús.

La búsqueda voraz y el muestreo permiten observar cómo cambian las salidas. La muestra es pequeña y no permite evaluar la calidad general del modelo. Los tiempos dependen del equipo.

## Comprobaciones

`npm run check` pasó con 17 pruebas y `npm run build` compiló el catálogo y las soluciones. Los archivos de esta solución pasan Prettier. El `npm run format:check` global detecta archivos sin formato en otras soluciones preexistentes, por lo que no se aplicó el formateo a carpetas de otros autores.

La vista previa se comprobó con `npm run preview` en el navegador. Se seleccionaron ambas imágenes y se verificó que coinciden los textos y parámetros con `results/examples.json`. También se abrió la sección de modelo, equipo y procedencia. El generador rechazó un lote sin modelo ni imágenes y terminó con código de salida `1`.

## Trabajo con el agente

El agente preparó el script de ejecución, el archivo de resultados y la interfaz. La decisión principal fue comparar búsqueda voraz y muestreo; la comparación inicial con búsqueda por haces produjo el mismo texto en las dos imágenes, así que se cambió a muestreo y se regeneraron las salidas. Se puede revisar el recorrido `code/examples.json` → `code/generate.mjs` → `results/examples.json` → `web/app.js`.
