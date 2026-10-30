# Detectar objetos en imágenes

Solución de `uo300038` para la [issue #9](https://github.com/nahuelcostac/redes-generativas-26/issues/9).

## Ejecución

Se necesita Node.js 22.12 o posterior y npm. Desde la raíz del repositorio, ejecuta los siguientes comandos.

```sh
npm ci
npm run build
npm run preview
```

Abre `/redes-generativas-26/solutions/9/uo300038/web/index.html` en la dirección del servidor de vista previa. Con `npm run dev` también funciona durante el desarrollo.

1. Selecciona una imagen, arrástrala a la zona de carga o pulsa uno de los ejemplos.
2. Pulsa **Detectar objetos**. La primera vez se descarga el modelo, unos 43 MB. La barra muestra el progreso de cada archivo.
3. Mueve el **Umbral de puntuación** para filtrar las detecciones. El modelo no se vuelve a ejecutar.
4. Pasa el ratón por una fila de la tabla o por un recuadro para resaltarlo.

**Cancelar** detiene el worker y libera el modelo. La siguiente detección lo vuelve a cargar.

No hay dependencias de ejecución local. Todo se ejecuta en el navegador. La carpeta `code/` está vacía.

## Modelo y datos

- Modelo `Xenova/detr-resnet-50`, versión ONNX de [`facebook/detr-resnet-50`](https://huggingface.co/facebook/detr-resnet-50).
- Revisión `8be7ab59ff663484ee9ba2e8d8f267330d5ad03e`.
- Pesos `onnx/model_quantized.onnx`, cuantizados a 8 bits (43,1 MB). Se descargan desde Hugging Face y no están en el repositorio.
- Transformers.js `4.3.1`, ya fijado en `package.json` y `package-lock.json`. No se han añadido dependencias.
- CPU mediante WebAssembly con un único hilo, como en la solución de la issue #1. Así la página funciona en GitHub Pages sin cabeceras de aislamiento.
- La inferencia se ejecuta en un Web Worker y la interfaz no se bloquea.

He elegido DETR ResNet-50 porque es el modelo de detección de referencia en la documentación de Transformers.js. Tiene una revisión ONNX estable y una versión cuantizada de tamaño razonable para el navegador.

### Procesamiento

El navegador comprueba el archivo y lee sus dimensiones. El worker convierte la imagen a RGB y ejecuta el pipeline `object-detection` una sola vez con un umbral de 0,1. Las coordenadas se piden en proporción a la imagen (`percentage: true`). La interfaz recorta los recuadros a la imagen, los ordena por puntuación y filtra en el navegador según el umbral elegido. El umbral inicial es 0,7.

`config.mjs` contiene el modelo y los límites. `detections.mjs` contiene la validación, el filtrado, el recuento y la traducción de las categorías. Este módulo no depende del navegador y tiene pruebas en `tests/object-detection-uo300038.test.mjs`. `worker.js` ejecuta el modelo. `app.js` controla la interfaz.

### Categorías

El modelo se entrenó con COCO 2017 y reconoce 80 categorías. La interfaz las muestra en español y conserva el nombre original entre paréntesis.

persona, bicicleta, coche, moto, avión, autobús, tren, camión, barco, semáforo, boca de incendios, señal de stop, parquímetro, banco, pájaro, gato, perro, caballo, oveja, vaca, elefante, oso, cebra, jirafa, mochila, paraguas, bolso, corbata, maleta, frisbi, esquís, snowboard, pelota, cometa, bate de béisbol, guante de béisbol, monopatín, tabla de surf, raqueta de tenis, botella, copa de vino, taza, tenedor, cuchillo, cuchara, cuenco, plátano, manzana, sándwich, naranja, brócoli, zanahoria, perrito caliente, pizza, dónut, pastel, silla, sofá, planta en maceta, cama, mesa, inodoro, televisor, portátil, ratón, mando a distancia, teclado, teléfono móvil, microondas, horno, tostadora, fregadero, frigorífico, libro, reloj, jarrón, tijeras, osito de peluche, secador y cepillo de dientes.

La configuración del modelo tiene 91 identificadores. Algunos, como plato, sombrero o ventana, no tienen anotaciones en COCO 2017. En la práctica el modelo no los detecta.

### Formatos y límites

- JPEG, PNG y WebP. Se comprueban la extensión y el tipo MIME. Si el navegador no puede decodificar el archivo, se rechaza.
- Hasta 10 MB.
- Lado mayor de 4096 px como máximo y lado menor de 32 px como mínimo.
- El procesador del modelo redimensiona la imagen para que su lado menor mida 800 px y su lado mayor no supere 1333 px. Por eso una resolución mayor no aporta más detalle al modelo.

El modelo no da distancias ni identifica personas. La puntuación indica la confianza del modelo y no es una probabilidad calibrada.

### Imágenes de ejemplo

Las tres imágenes proceden de Wikimedia Commons. Se descargaron con la miniatura de 1280 px de ancho que ofrece la API de Commons. Los datos completos están en `results/fuentes.json`.

| Archivo     | Contenido                            | Autor         | Licencia     | Origen                                                                                                                                                                                   |
| ----------- | ------------------------------------ | ------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gato.jpg`  | Un gato. Un único objeto             | Paul Danese   | CC BY-SA 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:20231125_housecat_south_meadows_PD100306.jpg)                                                                                          |
| `calle.jpg` | Calle con motos, coches y peatones   | PattayaPatrol | CC BY-SA 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:DFC_3731_Busy_city_street_with_motorcycles_cars_and_pedestrians_passing_shops_and_colorful_buildings_under_tangled_overhead_wires.jpg) |
| `mesa.jpg`  | Bandeja con comida, taza y cubiertos | Acabashi      | CC BY-SA 4.0 | [Commons](https://commons.wikimedia.org/wiki/File:A_brunch_at_Capel_Manor_College_Gardens_Enfield_London_England.jpg)                                                                    |

La calle contiene muchos objetos pequeños y parcialmente ocultos. La mesa contiene objetos pequeños y categorías que el modelo no conoce, como las patatas fritas.

## Resultados

Las comprobaciones se hicieron el 29 de octubre de 2026 en Google Chrome 156.0.8078.47 sobre Linux, en la máquina virtual del agente, sin GPU. No se vació la caché. Los tiempos se leyeron de la interfaz y están redondeados a una décima de segundo. Los datos completos están en `results/verification-2026-10-29.json`.

| Prueba         | Carga del modelo | Detección | Resultado con umbral 70 %                                      |
| -------------- | ---------------- | --------- | -------------------------------------------------------------- |
| Gato           | 1,9 s            | 7,8 s     | 1 gato al 100 %                                                |
| Calle          | Ya cargado       | 4,5 s     | 43 de 60. 20 persona, 13 moto, 7 coche y 3 camión              |
| Mesa           | Ya cargado       | 5,1 s     | 28 de 36. 24 zanahoria, 1 cuchillo, 1 mesa, 1 taza y 1 tenedor |
| Gato, de nuevo | Ya cargado       | 7,1 s     | Igual que la primera vez                                       |

En la calle, el umbral cambia mucho el resultado. Con 90 % quedan 25 detecciones y con 30 % se muestran las 60.

### Errores y omisiones observados

- **Mesa.** El plato no se detecta, porque «plato» no tiene anotaciones en COCO. Las patatas fritas, los guisantes y el filete empanado no son categorías del modelo y no aparecen. Las 24 zanahorias son trozos reales de zanahoria. La bandeja se detecta como «mesa».
- **Calle.** Las motos aparcadas a la izquierda están superpuestas. Sus recuadros se solapan y es difícil saber cuántas hay. Con umbrales bajos aparecen detecciones dudosas sobre zonas con objetos muy pequeños del fondo.
- **Gato.** Detección correcta y sin falsos positivos.

Estas observaciones salen de las capturas. Conviene que el alumno revise de nuevo cada recuadro, sobre todo en la calle, y anote los falsos positivos y los objetos omitidos que encuentre.

### Entradas inválidas

- `texto.txt` se rechaza antes de ejecutar el modelo con el mensaje «Formato no admitido. Usa una imagen JPEG, PNG o WebP.».
- Un archivo de texto renombrado como `danada.png` se rechaza con «No se pudo leer la imagen. El archivo puede estar dañado.».
- Los límites de tamaño y resolución están cubiertos por las pruebas de código.

### Otras comprobaciones

- Al mover el umbral cambian los recuadros, la tabla y el resumen. El modelo no se vuelve a ejecutar.
- Al pasar el ratón por una fila, su recuadro se resalta y el resto de la imagen se oscurece.
- Después de los errores, el modelo se reutiliza y aparece «Ya cargado».
- Con 400 px de ancho, la página pasa a una columna.
- Cancelación comprobada en Chrome 156 sin interfaz gráfica, con un script que pulsa los botones mediante el protocolo de DevTools. Al pulsar **Cancelar** durante la carga del modelo aparece «Detección cancelada.». Ocho segundos después no llega ningún resultado tardío. Una nueva detección carga el modelo en 2,2 s, tarda 4,9 s y devuelve las mismas 43 de 60 detecciones.
- Pasan `npm run check` (incluye las 15 pruebas del repositorio, 5 de ellas de esta solución), `npm run format:check` y `npm run build`.

### Pendiente

- No se han probado Firefox, Safari ni dispositivos móviles reales.
- Los tiempos son de una máquina virtual sin GPU. Repite las pruebas en tu equipo y sustituye los tiempos por los tuyos.

## Uso de agentes

Un agente de Cursor creó la estructura con `npm run new`, eligió el modelo y las imágenes, escribió la interfaz y las pruebas, y ejecutó las comprobaciones. Una decisión revisada fue ejecutar el modelo una sola vez con umbral bajo y filtrar después. Así el control deslizante responde sin esperar al modelo. Otra decisión fue usar WASM con un hilo para que la página funcione en GitHub Pages.

Las pruebas en el navegador las hizo un subagente. Su informe de texto contenía datos que no coincidían con las capturas, como varios gatos en la primera imagen. Por eso solo se han registrado los valores que se ven en las capturas de pantalla.
