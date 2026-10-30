# Detectar objetos en imágenes

Solución de Jairo-Patallo para la [issue #9](https://github.com/nahuelcostac/redes-generativas-26/issues/9).

La página carga una imagen y un modelo de detección localiza los objetos que reconoce. El modelo se ejecuta en el navegador. La imagen no sale del equipo.

## Ejecución

Desde la raíz del repositorio, ejecuta los comandos siguientes. Necesitas Node.js 22.12 o posterior.

```sh
npm ci
npm run build
npm run preview
```

Abre `/redes-generativas-26/solutions/9/jairo-patallo/web/index.html` en la dirección del servidor de vista previa.

Selecciona una imagen o usa un ejemplo. Pulsa **Detectar objetos**. La primera ejecución descarga y prepara el modelo. Las siguientes reutilizan la instancia mientras la página siga abierta. **Cancelar** detiene el worker y libera el modelo.

El control **Umbral de puntuación** filtra las detecciones sin volver a ejecutar el modelo. El modelo devuelve todas las detecciones con puntuación igual o mayor que 0,01. La página muestra solo las que superan el umbral.

## Modelo y procesamiento

- Modelo `Xenova/detr-resnet-50`. Es la conversión a ONNX de `facebook/detr-resnet-50`, con licencia Apache 2.0.
- Revisión `8be7ab59ff663484ee9ba2e8d8f267330d5ad03e`.
- Pipeline `object-detection` de Transformers.js `4.3.1`, fijado en `package.json` y `package-lock.json`.
- Pesos cuantizados a 8 bits (`onnx/model_quantized.onnx`, 43 102 531 bytes), descargados desde Hugging Face.
- CPU mediante WebAssembly, con un único hilo. La inferencia se ejecuta en un Web Worker.

El modelo escala la imagen por su cuenta, con el lado corto en 800 píxeles. El worker recibe el archivo, el pipeline lo decodifica y devuelve cajas relativas al tamaño de la imagen. La interfaz las dibuja encima con porcentajes, así que los recuadros se adaptan al tamaño mostrado.

Los scripts `config.mjs`, `detections.mjs` y `worker.js` separan los límites, la validación y la inferencia. `app.js` controla los archivos, el umbral, los estados y los mensajes del worker.

## Formatos y límites

- Formatos JPG, JPEG, PNG y WebP.
- Hasta 8 MB por archivo.
- Hasta 4096 píxeles por lado.

Se rechazan los archivos vacíos, los formatos no admitidos, los archivos demasiado grandes y los que el navegador no puede decodificar. Una extensión válida con contenido incorrecto se rechaza al decodificar. El límite de 4096 píxeles lo comprueba una prueba de código. No se ha probado con una imagen real de ese tamaño.

## Categorías

El modelo se entrenó con COCO, que usa 80 categorías. La página muestra los nombres en inglés tal como los devuelve el modelo.

person, bicycle, car, motorcycle, airplane, bus, train, truck, boat, traffic light, fire hydrant, stop sign, parking meter, bench, bird, cat, dog, horse, sheep, cow, elephant, bear, zebra, giraffe, backpack, umbrella, handbag, tie, suitcase, frisbee, skis, snowboard, sports ball, kite, baseball bat, baseball glove, skateboard, surfboard, tennis racket, bottle, wine glass, cup, fork, knife, spoon, bowl, banana, apple, sandwich, orange, broccoli, carrot, hot dog, pizza, donut, cake, chair, couch, potted plant, bed, dining table, toilet, tv, laptop, mouse, remote, keyboard, cell phone, microwave, oven, toaster, sink, refrigerator, book, clock, vase, scissors, teddy bear, hair drier, toothbrush.

El `config.json` del modelo lista 91 identificadores. La página descarta la etiqueta `N/A`. Todo lo que no está en esa lista se detecta como otra categoría o no se detecta.

## Imágenes de ejemplo

Las ocho fotografías las hizo Jairo-Patallo. Se publican con la solución. Las versiones de `results/` tienen un máximo de 1280 píxeles, calidad JPEG 82 y ningún metadato EXIF. Los originales se quedan fuera del repositorio. En `ejemplo-callejon.jpg` se difuminó la matrícula de la moto.

`results/examples.json` registra el título, el autor y la licencia de cada una.

## Comprobaciones

Equipo: Intel Core i7-1260P, 16 hilos, 16 GB de RAM, Windows 11. Navegador: el de la aplicación de escritorio de Claude, basado en Chrome 152. No se probó en otros navegadores.

Se ejecutó cada ejemplo una vez con el servidor de desarrollo de Vite. El modelo detectó lo siguiente con umbral 0,50.

| Ejemplo                 | Detecciones                          | Observación                                                                                 |
| ----------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------- |
| Panda comiendo bambú    | 1: `bear` 1,00                       | Un objeto. Detección correcta.                                                              |
| Callejón con moto       | 2: `motorcycle` 0,99, `bicycle` 0,91 | La bicicleta está parcialmente oculta y se detecta.                                         |
| Calle de noche          | 16                                   | Varias `person`, `car`, `truck` y `umbrella`. Los carteles luminosos se detectan como `tv`. |
| Templo con visitantes   | 61 de 67                             | Muchas `person` pequeñas y varios `umbrella`.                                               |
| Muralla con visitantes  | 39                                   | Muchas `person` pequeñas. Un tramo de la muralla se detecta como `train` con 0,99.          |
| Ciudad desde un mirador | 16                                   | Casi todo es `boat`. No se ha comprobado una a una. Hay un `bird` con 0,90.                 |
| Monos en una barandilla | 2: `bear` 0,77, `bird` 0,71          | Detecciones incorrectas. No hay macacos en COCO. La cría no se detecta.                     |
| Detalle de un tejado    | 0                                    | Sin objetos de COCO. No hay ninguna detección.                                              |

Las entradas inválidas se probaron con un `.txt`, un PNG vacío, un PNG con texto en su interior y un archivo de 9 MB. Todas se rechazaron con un mensaje. El botón de detectar siguió desactivado.

Tiempos observados. La inferencia tardó entre 5,3 s y 5,9 s en cada imagen. La carga del modelo tardó 8,1 s en la primera ejecución de la sesión. Los tiempos dependen del equipo, la conexión y la caché.

Pendiente de comprobar. Un fallo de red durante la descarga del modelo. Otros navegadores. Una imagen de 4096 píxeles por lado.

Las diez pruebas anteriores del repositorio y las cuatro de esta solución pasan. Las de esta solución están en `tests/object-detection.test.mjs`.

## Limitaciones

- DETR solo reconoce las categorías de COCO. Fuera de ellas, el resultado es incorrecto o vacío.
- Los objetos pequeños o muy ocultos se pierden con más frecuencia.
- La puntuación no es una probabilidad calibrada. Una detección con 0,99 puede ser incorrecta, como `train` en la muralla.

## Uso de agentes

Un agente escribió el módulo de validación, el worker, la interfaz y las pruebas, a partir del patrón de la solución de la issue #1. El agente eligió el modelo y fijó su revisión. Comprobó el flujo con las ocho fotografías, el umbral y las cuatro entradas inválidas en el navegador. También redujo las fotos y retiró sus metadatos antes de publicarlas. El alumno debe revisar estas decisiones.
