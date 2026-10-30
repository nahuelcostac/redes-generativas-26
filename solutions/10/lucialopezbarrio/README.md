# Resumir documentos

[Issue en GitHub](https://github.com/nahuelcostac/redes-generativas-26/issues/10) · Autor `lucialopezbarrio`

El modelo recibe un texto en español y genera un resumen en local. La web permite elegir un texto, verlo junto a su resumen, consultar los parámetros y comparar dos configuraciones. La web no ejecuta el modelo. Solo muestra resultados calculados previamente.

## Modelo y decisiones

Se utiliza [ELiRF/mt5-base-dacsa-es](https://huggingface.co/ELiRF/mt5-base-dacsa-es/tree/27056b1969ac884f9f8eea6cb2068420f272a36a), revisión `27056b1969ac884f9f8eea6cb2068420f272a36a`. Es un mT5 base de unos 582 millones de parámetros. Está ajustado con 1,8 millones de pares de noticia y resumen en español del corpus DACSA. Se eligió porque es un modelo específico de resumen y de español. La ficha del modelo no declara una licencia. Hay que tenerlo en cuenta antes de reutilizarlo fuera de esta práctica.

El script usa `AutoModelForSeq2SeqLM` y `generate()`, no `pipeline("summarization")`. La rama principal de Transformers ha eliminado esa tarea del pipeline y esta forma no depende de ella.

Los valores de repetición, n-gramas y longitud mínima proceden de `task_specific_params.summarization` en la configuración del modelo. La búsqueda es determinista. No hay muestreo ni semilla.

Se añadió una longitud mínima porque la longitud máxima sola no cambia casi nada. El modelo escribe una frase y termina. Se explica en [Resultado y limitaciones](#resultado-y-limitaciones).

## Ejecutar en local

Se necesita Python 3.11, unos 4 GB de disco para las dependencias y los pesos, y conexión a Internet para la primera descarga. Desde `code/`, crea un entorno aislado.

```sh
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-lock.txt
```

`code/requirements.txt` fija las dependencias principales. `code/requirements-lock.txt` registra todas las versiones instaladas en macOS arm64 con Python 3.11.15. En otros sistemas puede hacer falta otra versión de PyTorch. `protobuf` es obligatorio. Sin él, el tokenizador no se puede cargar.

El repositorio del modelo incluye `model.safetensors` y `pytorch_model.bin`, de 2,3 GB cada uno. Para descargar solo lo necesario, ejecuta lo siguiente antes del primer uso.

```sh
python -c "from huggingface_hub import snapshot_download; snapshot_download('ELiRF/mt5-base-dacsa-es', revision='27056b1969ac884f9f8eea6cb2068420f272a36a', allow_patterns=['config.json', 'model.safetensors', 'spiece.model', 'tokenizer_config.json', 'special_tokens_map.json'])"
```

Para resumir un texto propio y elegir la longitud máxima, ejecuta lo siguiente.

```sh
python summarize.py --text "Texto que quieres resumir." --max-new-tokens 80
```

También puedes leer un archivo UTF-8 con `--file texto.txt`. El resumen aparece en la terminal. `--output salida.json` guarda además todos los datos de la ejecución.

Para repetir los resultados publicados, ejecuta lo siguiente.

```sh
python summarize.py --batch examples.json --device cpu --threads 4 --output ../results/examples.json
```

`code/examples.json` contiene cuatro textos y cinco configuraciones. El script ejecuta todas las combinaciones. Para publicar otros ejemplos, cambia ese archivo y vuelve a generar los resultados. Después hay que actualizar `results/review.json`, porque la web exige una revisión por resumen.

Los pesos quedan en la caché de Hugging Face, fuera del repositorio. Con los archivos descargados, `HF_HUB_OFFLINE=1` permite ejecutar sin red.

## Parámetros y límites

- **Longitud máxima de entrada: 768 tokens.** Es el valor de `model_max_length` en el tokenizador del modelo. Equivale aproximadamente a 2500 o 2800 caracteres en los textos probados. Un token no equivale a una palabra.
- El modelo no impone este límite. En una prueba aceptó 3441 tokens sin error. El script trunca a 768 porque es el valor que fijaron los autores del modelo. El resultado registra los tokens totales, los leídos y los caracteres leídos. La terminal avisa y la web marca en gris la parte no leída.
- Longitud máxima del resumen entre 10 y 256 tokens. Por defecto, 80.
- Longitud mínima entre 1 y la máxima. Por defecto, 24 o la máxima si es menor.
- Entre 1 y 8 haces. Por defecto, 4.
- Penalización de repetición 2 y sin repetir n-gramas de 3 tokens.

Los textos vacíos, los identificadores duplicados y los parámetros inválidos se rechazan antes de cargar el modelo. Un fallo no deja un JSON parcial ni sustituye resultados anteriores.

## Textos de ejemplo

| Texto                  | Fuente                                                                                                            | Licencia     | Tokens | Palabras |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------ | ------ | -------- |
| Sonda china en la Luna | [Wikinoticias, «Primera sonda china orbita la Luna»](https://es.wikinews.org/w/index.php?oldid=406137)            | CC BY 4.0    | 169    | 105      |
| Riñones de laboratorio | [Wikinoticias, «Investigadores estadounidenses crean riñones…»](https://es.wikinews.org/w/index.php?oldid=611401) | CC BY 4.0    | 517    | 300      |
| Río Ebro               | [Wikipedia, «Ebro»](https://es.wikipedia.org/w/index.php?oldid=175905347), fragmento inicial                      | CC BY-SA 4.0 | 603    | 320      |
| Ada Lovelace           | [Wikipedia, «Ada Lovelace»](https://es.wikipedia.org/w/index.php?oldid=175886330), fragmento inicial              | CC BY-SA 4.0 | 1809   | 1064     |

Los textos se obtuvieron el 30 de octubre de 2026 de la API de cada sitio, en la revisión enlazada. Las licencias son las que indica esa API. Se retiraron los títulos de sección, las listas de fuentes, los espacios de ancho cero y las marcas `[cita requerida]`. En el texto del Ebro también se retiró un párrafo largo sobre el origen del río, para que quedara por debajo del límite.

Las noticias se parecen a los datos de entrenamiento. Los artículos de Wikipedia se alejan de ellos. El texto de Ada Lovelace supera el límite a propósito.

## Ejecución observada

Los 20 resúmenes publicados se generaron el 30 de octubre de 2026 a las 15:40 UTC. Se usó un Apple M5, 16 GiB de memoria, Darwin 25.6.0 arm64, CPU y cuatro hilos de PyTorch. No se midió la memoria máxima consumida.

Las versiones fueron Python 3.11.15, Transformers 5.22.1, PyTorch 2.15.0, tokenizers 0.23.3 y huggingface-hub 2.4.0. La descarga de los pesos tardó unos 45 s. La carga desde caché tardó 0,753 s en ese lote. En una primera carga se midieron 5,5 s.

| Texto                  | Tokens de entrada | Corto, máx. 40 | Medio, máx. 80 | Largo, máx. 150 | Extenso, mín. 80 | Medio, un haz |
| ---------------------- | ----------------- | -------------- | -------------- | --------------- | ---------------- | ------------- |
| Sonda china en la Luna | 169               | 1,57 s         | 1,48 s         | 1,49 s          | 3,88 s           | 0,65 s        |
| Riñones de laboratorio | 517               | 1,37 s         | 1,35 s         | 1,35 s          | 4,70 s           | 0,67 s        |
| Río Ebro               | 603               | 1,63 s         | 1,61 s         | 1,61 s          | 5,52 s           | 0,71 s        |
| Ada Lovelace           | 768 de 1809       | 1,95 s         | 2,14 s         | 2,14 s          | 4,20 s           | 0,82 s        |

Cada tiempo corresponde a una sola ejecución de la llamada de generación. El lote completo en CPU sumó 40,9 s de generación. Repetido en `mps`, sumó 22,9 s, y los 20 resúmenes tuvieron exactamente los mismos tokens. La carga en `mps` tardó 2,17 s. Los resultados publicados son los de CPU.

## Resultado y limitaciones

La revisión completa de cada resumen está en `results/review.json` y se ve en la web. **La revisión la preparó un agente y falta que la confirme quien firma la solución.** Para confirmarla, cambia `status` a `confirmada` en ese archivo.

- **Longitud.** Con un mínimo de 24 tokens, el modelo termina solo en 30 a 37 tokens. Por eso las configuraciones de 80 y 150 tokens dan el mismo resumen en los cuatro textos. El mismo resumen sale con 40 tokens en tres de ellos. Solo Ada Lovelace llega al límite de 40 y queda cortado a mitad de frase.
- **Omisiones.** Es el problema principal. Los resúmenes de una frase pierden datos centrales. En la noticia de la sonda, el resumen de una frase con 4 haces no dice que la sonda es china. En la de los riñones, ninguna configuración menciona que la técnica aún no se puede aplicar en humanos. En el Ebro, el resumen de una frase trata solo de la cuenca y no dice que es un río.
- **Afirmaciones sin respaldo.** Cuatro de los 20 resúmenes tienen problemas. Todos usan un haz o una longitud mínima forzada. No se encontraron datos totalmente inventados. Lo que aparece son distorsiones: con un haz, el Ebro parece el tercer río más largo y Ada Lovelace se relaciona con «el algoritmo de una máquina». El resumen extenso de la noticia altera una cita textual y el del Ebro altera una palabra griega. En el resumen extenso de la sonda también aparece un error gramatical, «un vehículos».
- **Texto largo.** En Ada Lovelace solo se leen 768 de 1809 tokens, unos 2747 de 6365 caracteres. Todo lo posterior a la introducción queda fuera. Ningún resumen recoge las dudas sobre su papel, aunque están en la parte leída.
- **Estilo.** El modelo copia frases casi literales. Actúa más como un extractor que como un redactor. Esto parece limitar las afirmaciones falsas en estos ejemplos, pero el modelo elige una frase y descarta el resto.

Estas observaciones corresponden a los ejemplos guardados y no son una evaluación general del modelo. La web solo permite explorar las combinaciones exportadas. Para resumir un texto nuevo hay que ejecutar el script en local.

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
python -m unittest
```

Se comprobaron los siguientes casos.

- Generación real de las 20 combinaciones en CPU y en `mps`, sin red después de la descarga.
- Texto propio con `--text` y con `--file`. El archivo de 1809 tokens mostró el aviso de truncado.
- Rechazo de un texto vacío, de una longitud fuera de rango y de `--batch` sin `--output`.
- Seis pruebas Python de validación y cuatro pruebas JavaScript de esta solución. Las JavaScript comprueban los resultados y la revisión exportados, el truncado y el rechazo de datos alterados.
- Interfaz compilada en el navegador integrado de Claude. Se recorrieron las 20 combinaciones en los dos paneles y se compararon con los JSON exportados. No hubo errores en la consola.
- Fallo de carga al retirar `review.json` de la compilación. Se mostró el error y el botón de recarga recuperó la interfaz.
- Pantalla estrecha de 375 × 812. Los paneles se apilan y no hay desbordamiento horizontal.

## Trabajo con el agente

El agente preparó el script, la exportación, la interfaz, las pruebas y un borrador de la revisión. Las decisiones principales fueron usar un modelo específico de resumen en español, truncar la entrada de forma visible y añadir una longitud mínima al ver que la máxima no cambiaba los resúmenes.

Para revisar esta solución, sigue el recorrido `examples.json` → `summarize.py` → `results/examples.json` → `web/app.js`. Después lee varios resúmenes junto a su original y comprueba si estás de acuerdo con `results/review.json`.
