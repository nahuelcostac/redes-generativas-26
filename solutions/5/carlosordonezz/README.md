# Convertir texto en voz

[Issue en GitHub](https://github.com/nahuelcostac/redes-generativas-26/issues/5) · Autor `carlosordonezz`

El modelo recibe un texto en español y genera un audio de voz en local. La web permite elegir un texto y comparar dos audios guardados con distintos parámetros de síntesis. No ejecuta inferencia ni necesita un servidor de modelos.

Cada audio se transcribe después con Whisper. Así se obtiene una medida objetiva de inteligibilidad, la tasa de error de palabras (WER). Esta medida no sustituye la escucha humana.

## Modelo y decisiones

Se utiliza [facebook/mms-tts-spa](https://huggingface.co/facebook/mms-tts-spa/tree/833b96c0278c85cf09776d565ba8f1cb2819f7ec), revisión `833b96c0278c85cf09776d565ba8f1cb2819f7ec`. Es un modelo VITS del proyecto Massively Multilingual Speech de Meta, con unos 36 millones de parámetros. Genera audio mono a 16 kHz.

La licencia es CC-BY-NC 4.0. Permite el uso académico, pero no el uso comercial. Los pesos se descargan a la caché de Hugging Face, fuera del repositorio.

Se eligió este modelo por estas razones.

- Está entrenado para español y se carga con `transformers` sin código remoto.
- Es pequeño y funciona en CPU en menos de un segundo por frase.
- VITS es estocástico. Tiene parámetros de síntesis que cambian el audio de forma audible, y eso permite la comparación que pide la issue.

Los parámetros que se comparan son estos.

| Parámetro              | Qué controla                                                   | Por defecto |
| ---------------------- | -------------------------------------------------------------- | ----------- |
| `speaking_rate`        | Velocidad de habla. Un valor mayor produce un audio más corto. | 1.0         |
| `noise_scale`          | Variación aleatoria de la voz (timbre y entonación).           | 0.667       |
| `noise_scale_duration` | Variación aleatoria de la duración de cada sonido (ritmo).     | 0.8         |
| `seed`                 | Semilla de PyTorch. Fija el ruido que usa el modelo.           | 42          |

Para la comprobación se usa [openai/whisper-small](https://huggingface.co/openai/whisper-small/tree/973afd24965f72e36ca33b3055d56a652f456b4d), revisión `973afd24965f72e36ca33b3055d56a652f456b4d`, con licencia Apache-2.0. Transcribe en español con decodificación voraz. El WER compara palabras después de pasar a minúsculas y quitar la puntuación. Se conservan las tildes y las cifras.

`code/requirements.txt` fija las dependencias principales. `code/requirements-lock.txt` registra las versiones instaladas durante la ejecución en Linux x86_64 con Python 3.13.18. No incluye los paquetes de CUDA que PyPI instala con PyTorch en Linux, porque no se usan. No se añaden dependencias JavaScript.

## Ejecutar en local

Desde esta carpeta, con Python 3.11 o posterior y conexión a Internet para la primera descarga, crea un entorno aislado.

```sh
cd code
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Estos comandos se comprobaron en Linux con Python 3.13. En macOS o Windows el mismo `requirements.txt` instala la versión de PyTorch adecuada. La ejecución es siempre en CPU.

Para sintetizar un texto propio con sus parámetros, ejecuta lo siguiente.

```sh
python generate.py \
  --text "Hola, esto es una prueba." \
  --speaking-rate 1.0 \
  --noise-scale 0.667 \
  --noise-scale-duration 0.8 \
  --seed 42 \
  --output ../results/mi-ejemplo.json
```

El script guarda el JSON en `--output` y los audios WAV en `audio/<nombre del JSON>/`, junto al JSON. El JSON contiene el texto original, el texto que lee el modelo, los parámetros, la ruta del audio, su duración, el pico, el nivel RMS, el modelo, el equipo y los tiempos. Si la salida ya existe, se sustituye.

Para repetir los 30 ejemplos publicados, ejecuta lo siguiente desde `code/`.

```sh
python generate.py --batch examples.json --threads 4 --output ../results/examples.json
python check_asr.py --results ../results/examples.json --output ../results/asr-check.json
```

`code/examples.json` contiene cinco textos y seis configuraciones. El script ejecuta todas las combinaciones. La web usa `results/examples.json`, `results/asr-check.json` y los audios de `results/audio/examples/`. Para publicar otros textos, modifica el lote y repite los dos comandos. No hace falta cambiar el código de la web.

La primera ejecución descarga unos 145 MB del modelo de voz y unos 970 MB de Whisper. Se puede elegir otra ruta para la caché con `HF_HOME`. Con los pesos descargados, `HF_HUB_OFFLINE=1` permite repetir la ejecución sin red. Así se comprobó `results/verification.json`.

En redes que bloquean el almacenamiento Xet de Hugging Face, `HF_HUB_DISABLE_XET=1` usa la descarga HTTP normal.

## Parámetros y límites

- Texto de 1 a 1000 caracteres. Debe contener al menos un carácter que el modelo pueda leer.
- `speaking_rate` entre 0.5 y 2.
- `noise_scale` y `noise_scale_duration` entre 0 y 1.5.
- Semilla entera entre 0 y 4294967295.
- Identificadores del lote únicos, en minúsculas, con cifras y guiones.

Las entradas inválidas se rechazan antes de cargar el modelo. Los audios se escriben primero en una carpeta temporal. Si la ejecución falla, no se sustituyen los resultados anteriores y no quedan archivos parciales.

## Ejecución observada

Los 30 audios se generaron el 11 de noviembre de 2026 a las 09:48 UTC. Se usó un contenedor Linux x86_64 con un Intel Xeon a 2,30 GHz, 4 procesadores lógicos, 15,7 GiB de memoria, CPU y cuatro hilos de PyTorch. No se midió la memoria máxima consumida.

Las versiones fueron Python 3.13.18, PyTorch 2.9.0, Transformers 4.57.1, huggingface-hub 0.36.0 y NumPy 2.5.4.

La carga del modelo de voz tardó 0,447 s con los pesos ya en caché. En la primera prueba, con descarga incluida, tardó unos 7 s. La carga de Whisper tardó 0,868 s desde caché.

| Texto                       | Configuración       | Audio   | Síntesis | WER  |
| --------------------------- | ------------------- | ------- | -------- | ---- |
| Frase corta                 | Valores por defecto | 4.64 s  | 0.774 s  | 0 %  |
| Frase corta                 | Otra semilla        | 4.21 s  | 0.585 s  | 0 %  |
| Frase corta                 | Habla lenta         | 5.81 s  | 0.857 s  | 0 %  |
| Frase corta                 | Habla rápida        | 3.65 s  | 0.484 s  | 0 %  |
| Frase corta                 | Sin ruido           | 4.29 s  | 0.550 s  | 0 %  |
| Frase corta                 | Ruido alto          | 5.42 s  | 0.719 s  | 0 %  |
| Pregunta y exclamación      | Valores por defecto | 5.52 s  | 0.763 s  | 0 %  |
| Pregunta y exclamación      | Otra semilla        | 4.82 s  | 0.639 s  | 0 %  |
| Pregunta y exclamación      | Habla lenta         | 6.82 s  | 0.953 s  | 0 %  |
| Pregunta y exclamación      | Habla rápida        | 4.32 s  | 0.656 s  | 0 %  |
| Pregunta y exclamación      | Sin ruido           | 4.59 s  | 0.558 s  | 0 %  |
| Pregunta y exclamación      | Ruido alto          | 6.11 s  | 0.714 s  | 9 %  |
| Números y fechas            | Valores por defecto | 7.65 s  | 1.013 s  | 50 % |
| Números y fechas            | Otra semilla        | 7.44 s  | 0.857 s  | 67 % |
| Números y fechas            | Habla lenta         | 9.71 s  | 1.349 s  | 67 % |
| Números y fechas            | Habla rápida        | 5.95 s  | 0.699 s  | 56 % |
| Números y fechas            | Sin ruido           | 6.88 s  | 0.891 s  | 56 % |
| Números y fechas            | Ruido alto          | 8.50 s  | 1.112 s  | 89 % |
| Números escritos con letras | Valores por defecto | 8.18 s  | 1.015 s  | 55 % |
| Números escritos con letras | Otra semilla        | 7.28 s  | 0.924 s  | 45 % |
| Números escritos con letras | Habla lenta         | 10.11 s | 1.571 s  | 55 % |
| Números escritos con letras | Habla rápida        | 6.56 s  | 0.885 s  | 55 % |
| Números escritos con letras | Sin ruido           | 6.77 s  | 0.906 s  | 45 % |
| Números escritos con letras | Ruido alto          | 8.91 s  | 1.100 s  | 59 % |
| Párrafo descriptivo         | Valores por defecto | 17.36 s | 3.514 s  | 3 %  |
| Párrafo descriptivo         | Otra semilla        | 16.18 s | 2.616 s  | 0 %  |
| Párrafo descriptivo         | Habla lenta         | 21.73 s | 4.033 s  | 0 %  |
| Párrafo descriptivo         | Habla rápida        | 13.92 s | 1.933 s  | 0 %  |
| Párrafo descriptivo         | Sin ruido           | 15.06 s | 1.978 s  | 3 %  |
| Párrafo descriptivo         | Ruido alto          | 18.99 s | 3.093 s  | 11 % |

Cada tiempo corresponde a una sola ejecución. Mide solo la llamada al modelo. La escritura del WAV y del JSON quedan fuera. No es un estudio de rendimiento. En todos los casos la síntesis es varias veces más rápida que la duración del audio.

Ningún audio supera el rango de [-1, 1]. El pico máximo observado es 0,90.

## Resultado y limitaciones

- **Frases normales.** Whisper reconoce casi todas las palabras con cualquier configuración. El WER está entre 0 % y 11 %.
- **Velocidad.** `speaking_rate` cambia la duración como se espera. Con 0,75 el audio es más largo y con 1,4 es más corto. La inteligibilidad no empeora en estos ejemplos.
- **Ruido.** El ruido alto (1,2) da el peor WER en cada texto. Aparecen palabras mal pronunciadas, como «grafada» por «grabada». Sin ruido, la duración es más corta y el audio es igual para cualquier semilla, porque el modelo no usa el ruido aleatorio.
- **Semilla.** Con los mismos parámetros, otra semilla cambia la duración y la entonación. La misma semilla reproduce el mismo audio byte a byte.
- **Puntuación.** El tokenizador pasa el texto a minúsculas y elimina los signos. El modelo no puede marcar una pregunta ni una exclamación con la entonación. La web muestra el texto que lee el modelo.
- **Cifras.** El modelo no sabe leer cifras. En «Números y fechas» Whisper transcribe palabras sin sentido, como «Irodembo» en lugar de «7 y 45». Hay que escribir los números con letras antes de sintetizar.
- **Números escritos con letras.** Whisper recupera el contenido, por ejemplo «7 y 40 y 5 del 12 de marzo de 2026». El WER sigue alto porque Whisper escribe cifras y la comparación es palabra a palabra. También hay errores reales, como «Landenteres» por «el andén tres».

Estas observaciones dependen de un segundo modelo, Whisper, que también comete errores. No constituyen una evaluación general de la calidad de la voz. No se hizo una prueba de escucha con personas.

La interfaz permite explorar solo los audios exportados. Para escribir un texto nuevo o usar otros parámetros hay que ejecutar el script en local.

## Comprobaciones

Desde la raíz del repositorio, ejecuta las comprobaciones de la web.

```sh
npm run check
npm run format:check
npm run build
npm run preview
```

Desde `code/`, ejecuta las pruebas del script. No necesitan descargar modelos.

```sh
python -m unittest -v
```

Se comprobaron los siguientes casos.

- Síntesis real de las 30 combinaciones en CPU y transcripción de todas con Whisper.
- Ejecución de `--text` sin red con `HF_HUB_OFFLINE=1`. El audio es idéntico byte a byte al del lote con la misma semilla. La carga desde caché tardó 0,110 s y la síntesis 0,785 s. Los datos están en `results/verification.json`.
- Rechazo de un texto vacío, de una velocidad fuera de rango y de un texto sin caracteres legibles, sin dejar archivos parciales.
- Siete pruebas Python. Validan el lote, la escritura del WAV y el recorte, la conservación de los resultados anteriores ante un fallo y el cálculo del WER.
- Cuatro pruebas JavaScript en `tests/text-to-speech-carlosordonezz.test.mjs`. Comprueban que cada audio existe con la cabecera y el tamaño correctos y que la interfaz rechaza resultados incompletos o alterados. También comprueban que la velocidad cambia la duración, que la semilla cambia el audio y que la verificación reproduce el ejemplo publicado.
- Interfaz compilada en Chromium con Playwright. El audio se carga en el navegador con la duración del JSON. Se comprobó el cambio de texto y de configuración y el clic en la tabla. Se comprobó también el error de carga, su recuperación con el botón y el rechazo de un JSON incompleto.
- Pantalla estrecha de 390 × 844. Los paneles se apilan, la tabla se desplaza dentro de su caja y la página no presenta desbordamiento horizontal.

`npm run format:check` avisa de un archivo de otra solución, `solutions/8/jorgegr1/web/validation.js`. El aviso ya existía en `main` y no se modificó ese archivo.

## Trabajo con el agente

El agente preparó el script de síntesis, la comprobación con Whisper, la exportación y la interfaz. La decisión principal fue usar un modelo VITS, porque sus parámetros de ruido y velocidad permiten comparar audios del mismo texto. El agente no puede escuchar el audio. Por eso añadió la transcripción con Whisper como medida objetiva.

Los resultados de Whisper mostraron que el modelo no lee cifras. Por eso se añadió el texto «Números escritos con letras» para comparar.

Para revisar esta solución, sigue el recorrido `examples.json` → `generate.py` → `results/examples.json` y `results/audio/` → `check_asr.py` → `results/asr-check.json` → `web/app.js`. Fíjate en cómo `generate.py` cambia los atributos `speaking_rate`, `noise_scale` y `noise_scale_duration` del modelo antes de cada síntesis y fija la semilla con `torch.manual_seed`.
