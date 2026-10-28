# Generador de texto

[Issue en GitHub](https://github.com/nahuelcostac/redes-generativas-26/issues/2) · Autor `nahuelcostac`

El modelo recibe un texto y genera una continuación en local. La web permite elegir una entrada y comparar dos de sus salidas guardadas. No ejecuta inferencia ni necesita un servidor de modelos.

## Modelo y decisiones

Se utiliza [Qwen/Qwen2.5-0.5B](https://huggingface.co/Qwen/Qwen2.5-0.5B/tree/060db6499f32faf8b98477b0a26969ef7d8b9987), revisión `060db6499f32faf8b98477b0a26969ef7d8b9987`, con licencia Apache-2.0. Es un modelo base preentrenado de unos 494 millones de parámetros. La ficha de la familia incluye el español entre sus idiomas.

Se eligió la versión base porque la tarea consiste en continuar un texto. No se aplica una plantilla de chat ni se realiza entrenamiento. Los pesos se cargan en `float32`, sin código remoto del repositorio del modelo. Se fijan la revisión y las versiones de las dependencias.

`code/requirements.txt` fija las dependencias principales. `code/requirements-lock.txt` registra todas las versiones instaladas durante la comprobación en macOS arm64 con Python 3.11.11. El entorno y los pesos quedan fuera del control de versiones. No se añaden dependencias JavaScript.

## Ejecutar en local

Desde esta carpeta, con Python 3.11 instalado y una conexión a Internet para la primera descarga, crea un entorno aislado.

```sh
cd code
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-lock.txt
```

Estos comandos se comprobaron en macOS. En otros sistemas puede ser necesario instalar versiones de PyTorch adecuadas al equipo. La opción `--device cpu` es la ruta comprobada. Se ofrecen `mps`, `cuda` y `auto`, pero no se han probado en esta solución.

Para introducir otro texto y elegir sus parámetros, ejecuta lo siguiente.

```sh
python generate.py \
  --prompt "Al abrir la puerta," \
  --temperature 0.7 \
  --max-new-tokens 96 \
  --seed 42 \
  --device cpu \
  --output ../results/mi-ejemplo.json
```

La salida contiene el texto de entrada, la continuación, los identificadores de los tokens, los parámetros, el modelo, el equipo y los tiempos. El script informa de cada generación por la terminal. `--output` guarda el JSON en la ruta indicada y sustituye el archivo si ya existe.

Para repetir los nueve ejemplos publicados, ejecuta lo siguiente desde `code/`.

```sh
python generate.py \
  --batch examples.json \
  --device cpu \
  --threads 4 \
  --output ../results/examples.json
```

`code/examples.json` contiene tres entradas y tres configuraciones. El script ejecuta todas las combinaciones. Los parámetros de la línea de comandos `--temperature`, `--max-new-tokens` y `--seed` se utilizan con `--prompt`. En un lote se toman del JSON.

Para publicar nuevas entradas, modifica ese lote y vuelve a generar `results/examples.json`. La web utiliza ese archivo. También puedes sustituirlo por el JSON producido con `--prompt`. No hace falta cambiar su código. Conserva una copia de los resultados anteriores si quieres compararlos.

La primera ejecución descarga los pesos a la caché de Hugging Face, fuera del repositorio. Se puede elegir otra ruta con `HF_HOME`. Una vez descargada la revisión completa, `HF_HUB_OFFLINE=1` permite repetir la ejecución sin red. Así se comprobó la repetición de un ejemplo.

## Parámetros y límites

- Temperatura mayor que 0 y como máximo 2. El muestreo está activado.
- Entre 1 y 256 tokens nuevos. Un token no equivale a una palabra.
- Semilla entera entre 0 y 4294967295. El valor publicado es 42.
- Muestreo con `top_p=0.95`, `top_k=50`, un haz y penalización de repetición 1.
- Máximo de 10000 caracteres y 1024 tokens de entrada. El script rechaza el exceso sin truncar.
- La generación termina al alcanzar el límite de tokens nuevos o el token de fin del modelo.

Las entradas vacías, los identificadores duplicados y los parámetros inválidos se rechazan antes de cargar el modelo. La longitud en tokens se valida después de cargar el tokenizador y antes de cargar los pesos. Un fallo no deja un JSON parcial ni sustituye resultados anteriores.

## Ejecución observada

Los nueve ejemplos se regeneraron el 28 de octubre de 2026 a las 08:27 UTC. Se usó un Apple M4 Pro, 48 GiB de memoria unificada, macOS arm64, CPU y cuatro hilos de PyTorch. El sistema informa de 14 procesadores lógicos. No se midió la memoria máxima consumida.

Las versiones fueron Python 3.11.11, Transformers 4.57.1, PyTorch 2.9.0, tokenizers 0.22.2 y huggingface-hub 0.36.0. La carga inicial tardó 12,205 s e incluyó el tokenizador, la descarga necesaria, la carga de pesos y la preparación del dispositivo. No incluye el arranque de Python ni la importación de dependencias.

| Entrada                | Temperatura | Máximo de tokens nuevos | Tokens obtenidos | Generación |
| ---------------------- | ----------- | ----------------------- | ---------------- | ---------- |
| Un relato              | 0.3         | 96                      | 96               | 2.371 s    |
| Un relato              | 0.9         | 96                      | 96               | 2.199 s    |
| Un relato              | 0.9         | 32                      | 32               | 0.724 s    |
| Una explicación        | 0.3         | 96                      | 96               | 2.217 s    |
| Una explicación        | 0.9         | 96                      | 96               | 2.251 s    |
| Una explicación        | 0.9         | 32                      | 32               | 0.779 s    |
| Una secuencia de pasos | 0.3         | 96                      | 96               | 2.196 s    |
| Una secuencia de pasos | 0.9         | 96                      | 96               | 2.182 s    |
| Una secuencia de pasos | 0.9         | 32                      | 32               | 0.739 s    |

Cada tiempo corresponde a una sola ejecución. Mide la llamada de generación con sincronización del dispositivo. La decodificación y la escritura del JSON quedan fuera. No son tiempos de descarga ni un estudio de rendimiento.

Se comprobó también una entrada propia con `--prompt`, temperatura 0,7, 32 tokens y semilla 42, con `HF_HUB_OFFLINE=1`. La carga desde caché tardó 0,388 s y la generación 0,839 s. La entrada y la salida están registradas en `results/verification.json`.

## Resultado y limitaciones

Las nueve salidas se muestran sin correcciones. Todas alcanzaron el límite de tokens, por lo que pueden terminar a mitad de frase. Los ejemplos cortos conservan los primeros 32 tokens de su comparación larga con la misma semilla y temperatura.

En el relato con temperatura 0,3 aparecen preguntas repetidas. La explicación sobre energía solar incluye afirmaciones incorrectas y cifras sin fundamento. La secuencia de pasos pierde coherencia y repite instrucciones. Una temperatura mayor no resuelve estos problemas. Estas observaciones corresponden a los ejemplos guardados y no constituyen una evaluación general del modelo.

La interfaz permite explorar solo las combinaciones exportadas. Para escribir un texto nuevo o usar otra temperatura hay que ejecutar el script en local. La selección de parámetros no solicita inferencia a ningún servicio.

## Comprobaciones

Desde la raíz del repositorio, ejecuta las comprobaciones de la web.

```sh
npm run check
npm run format:check
npm run build
npm run preview
```

Desde `code/`, ejecuta las pruebas del script.

```sh
python -m unittest discover -p 'test_*.py' -v
```

Se comprobaron los siguientes casos.

- Generación real de las nueve combinaciones en CPU y ejecución de una entrada propia sin red.
- Cinco pruebas Python para parámetros y entradas inválidos, identificadores ambiguos, error de la línea de comandos, escritura del JSON sin pérdida de datos y recogida opcional del equipo.
- Diez pruebas JavaScript del repositorio. Las tres de esta solución verifican la correspondencia entre entradas, parámetros y salidas, el rechazo de resultados incompletos y la relación entre las generaciones cortas y largas.
- Interfaz compilada en el navegador integrado de Codex. Se recorrieron las nueve combinaciones en ambos paneles y se compararon sus textos con el JSON exportado.
- Fallo de carga al retirar temporalmente el JSON de la compilación. Se mostró el error y se recuperó la interfaz con el botón de recarga después de restaurar el archivo.
- Consulta de los datos del modelo, parámetros, equipo y tiempos desde la interfaz.
- Pantalla estrecha de 390 × 844. Los paneles se apilan y la página no presenta desbordamiento horizontal.

## Trabajo con el agente

El agente preparó el script, la exportación y la interfaz. La decisión principal fue usar un modelo base para continuar textos y conservar sus salidas completas. La comprobación relaciona los datos generados en Python con los textos mostrados en el navegador.

Para revisar esta solución, sigue el recorrido `examples.json` → `generate.py` → `results/examples.json` → `web/app.js`. Comprueba cómo `max_new_tokens` limita solo la continuación y cómo se separan los tokens de entrada antes de decodificar la salida.
