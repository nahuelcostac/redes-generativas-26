# Transcribir audio

Solución de `nahuelcostac` para la primera issue de la clase, identificada como [#1 en GitHub](https://github.com/nahuelcostac/redes-generativas-26/issues/1).

## Ejecutar

Desde la raíz del repositorio, ejecuta los siguientes comandos.

```sh
npm ci
npm run build
npm run preview
```

Abre `/redes-generativas-26/solutions/1/nahuelcostac/web/index.html` en la dirección del servidor de vista previa.

Selecciona un audio o usa uno de los ejemplos. Puedes reproducirlo antes de pulsar **Transcribir**. La primera ejecución descarga y prepara el modelo. Las siguientes reutilizan la instancia mientras permanezca abierta la página. **Cancelar** detiene el worker y libera la instancia.

El botón **Descargar texto** guarda la transcripción en un archivo TXT.

## Modelo y procesamiento

- Modelo `onnx-community/whisper-tiny`.
- Revisión `ff4177021cc41f7db950912b73ea4fdf7d01d8e7`.
- Transformers.js `4.3.1`, fijado en `package.json` y `package-lock.json`.
- Pesos cuantizados a 8 bits, descargados desde Hugging Face.
- CPU mediante WebAssembly, con un único hilo. La inferencia se ejecuta en un Web Worker.
- Idioma español y tarea de transcripción, con generación determinista.

El navegador decodifica el archivo a 16 kHz. Si el audio tiene varios canales, se calcula su media para obtener una señal mono. El worker recibe las muestras y devuelve el texto. El audio no se envía a un servicio de inferencia.

Los scripts `config.mjs`, `audio.mjs` y `worker.js` separan los límites, la validación del audio y la inferencia. `app.js` controla los archivos, los estados de la interfaz y los mensajes del worker.

## Formatos y límites

Se aceptan archivos WAV, MP3, M4A, OGG y WebM de hasta 30 segundos y 15 MB. La decodificación de cada códec depende del navegador. Un archivo con una extensión válida pero contenido incorrecto se rechaza al decodificarlo.

Se rechazan archivos vacíos, archivos demasiado grandes, audios demasiado largos y señales compuestas solo por silencio. La detección de silencio no identifica todos los casos de ausencia de voz, como ruido sin habla.

La página muestra por separado el tiempo de descarga y preparación del modelo y el tiempo de inferencia. Los tiempos dependen del equipo, la conexión y la caché. El progreso de descarga corresponde al archivo del modelo que se está descargando en ese momento.

Whisper Tiny puede cometer errores con ruido, nombres propios, números y habla poco clara. Una transcripción necesita revisión humana.

## Audios de ejemplo

Los dos audios se generaron para esta práctica con la voz sintética Mónica de macOS. No contienen grabaciones de alumnos. Se convirtieron a WAV mono de 16 kHz con FFmpeg.

`results/ejemplo-es.wav` dura 4,907 segundos y contiene esta frase.

> Hola, esta es una prueba de transcripción. Hoy vamos a trabajar con modelos de lenguaje.

`results/ejemplo-ruido.wav` dura 5,871 segundos. Contiene la frase siguiente, mezclada con ruido blanco con semilla 42.

> El código es equis zeta siete, be dos. La reunión será en Gijón, a las dieciséis y cuarenta y cinco.

Las frases son referencias para comprobar la salida. La aplicación siempre ejecuta el modelo al transcribir.

## Comprobaciones

Las siete pruebas del repositorio pasan. Las de audio comprueban formatos, tamaño, duración, conversión a mono, silencio y muestras inválidas. También pasan `npm run format:check` y `npm run build`.

Comprobado de nuevo el 27 de octubre de 2026 en el navegador integrado de Codex (IAB), en macOS, con Apple M4 Pro y 48 GB de RAM. No se registró la versión exacta del navegador ni se vació la caché. Los tiempos se leyeron de la interfaz y están redondeados a una décima de segundo.

| Prueba                         | Carga del modelo | Inferencia | Resultado                                          |
| ------------------------------ | ---------------- | ---------- | -------------------------------------------------- |
| WAV limpio de 4,9 s            | 1,3 s            | 1,2 s      | Frase reconocida, con una diferencia de puntuación |
| WAV con ruido de 5,9 s         | Ya cargado       | 2,5 s      | Texto incorrecto y repetitivo                      |
| WAV limpio después de cancelar | 1,2 s            | 1,1 s      | Transcripción correcta                             |

La salida del ejemplo limpio fue la siguiente.

> Hola, esta es una prueba de transcripción, hoy vamos a trabajar con modelos de lenguaje.

En el ejemplo ruidoso, la salida empezó por «Y también hay una gran gran gran» y continuó repitiendo «gran». No corresponde a la frase de referencia.

Se comprobó la reproducción, el rechazo de un TXT, la cancelación y una nueva transcripción. El archivo TXT descargado coincide con la salida mostrada. La vista móvil se comprobó con un viewport de 390 × 844 px, con una columna y sin desbordamiento horizontal.

Las salidas completas y los tiempos están en `results/verification-2026-10-27.json`. Para repetir las pruebas, abre cada ejemplo y pulsa **Transcribir**. Prueba también a cargar un archivo de texto y a cancelar una transcripción antes de iniciarla de nuevo.

Se conserva la comprobación anterior del 20 de octubre en `results/verification.json`. Incluye pruebas con MP3, WAV corrupto, WAV de 31 segundos y decodificación de M4A, OGG y WebM. Estas pruebas adicionales no se repitieron el día 27. No se han comprobado otros motores de navegador ni otros equipos.

## Uso de agentes

El agente implementó la conexión entre la interfaz y el worker, la validación y las pruebas. Se eligió una revisión fija del modelo y ejecución en CPU para que la página pueda funcionar en GitHub Pages. La verificación debe incluir inferencia real, revisión de las transcripciones y prueba de entradas inválidas.
