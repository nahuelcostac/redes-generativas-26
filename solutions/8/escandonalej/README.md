# Eliminar el fondo de una imagen

Solución de escandonalej para la issue #8.

## Ejecución

Desde la raíz del repositorio, instala las dependencias y ejecuta la aplicación:

```sh
npm ci
npm run dev
```

Abre la dirección local que indique Vite. Selecciona una imagen admitida o carga uno de los ejemplos y pulsa «Eliminar fondo». La primera ejecución descarga los archivos del modelo desde Hugging Face. El navegador los conserva en su caché. Después, el procesamiento se ejecuta en el navegador y la imagen no se envía a un servidor. Descarga el resultado como PNG.

La interfaz admite PNG, JPEG, WebP y AVIF. Rechaza imágenes de más de 12 megapíxeles o de más de 4096 píxeles por lado. Estos son límites preventivos de esta interfaz, no una limitación publicada por MODNet. La memoria disponible puede imponer un límite menor. SVG y GIF no se admiten como entradas cargadas por el usuario.

## Modelo y datos

Se usa [`Xenova/modnet`](https://huggingface.co/Xenova/modnet) con la tarea `background-removal` de [`@huggingface/transformers` 4.3.1](https://huggingface.co/docs/transformers.js/api/pipelines). La canalización devuelve una imagen RGBA, que se codifica como PNG para conservar la transparencia. La referencia del modelo es `main`, por lo que sigue la revisión vigente del repositorio de Hugging Face y no fija un commit inmutable.

Los ejemplos de `web/examples/` son ilustraciones SVG originales creadas para esta práctica y rasterizadas en el navegador al cargarlas. No contienen fotografías ni proceden de un conjunto de datos externo. El ejemplo uniforme usa un fondo plano. El ejemplo complejo usa formas y un patrón de hojas.

## Resultados

La interfaz valida el tipo MIME, decodifica la imagen y aplica el límite de resolución antes de permitir el procesamiento. Muestra la carga del modelo, el estado de procesamiento, los errores y una vista comparativa con fondo de transparencia cuadriculado.

**Comprobación manual comunicada por el autor:** se probaron imágenes de forma manual. En general, el resultado es correcto, aunque presenta fallos. Cuando el objeto de interés rodea una zona de fondo, el modelo no la reconoce como fondo y la conserva en el resultado. Es una limitación visible de la segmentación.

Quedan por anotar el navegador y su versión, el equipo y los tiempos de descarga y procesamiento. También falta dejar constancia explícita del resultado de la entrada inválida. La solución sigue como `draft` hasta completar esos datos y esa comprobación.

La segmentación puede fallar en sujetos parcialmente ocultos, fondos complejos, bordes finos o imágenes con varios elementos. La carga inicial requiere conexión a Hugging Face. La revisión `main` no garantiza que futuras versiones del modelo produzcan exactamente el mismo resultado.

## Uso de agentes

El agente preparó la interfaz, la validación de entradas y la conversión del resultado a PNG. Se eligió MODNet porque Transformers.js documenta su uso con la canalización específica de eliminación de fondo. Revisé que el flujo conserve la imagen original para compararla y que la conversión no descarte el canal alfa. Las pruebas manuales del modelo y la inspección de los contornos siguen pendientes.
