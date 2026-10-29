# Eliminar el fondo de una imagen

Solución de `jorgegr1` para [la issue #8](https://github.com/nahuelcostac/redes-generativas-26/issues/8).

## Ejecución local

Desde la raíz del repositorio, con Node.js 22.12 o posterior.

```sh
npm ci
npm run build
npm run preview
```

Abre `http://127.0.0.1:4173/redes-generativas-26/solutions/8/jorgegr1/web/index.html`.
Para desarrollar puedes usar `npm run dev` y la misma ruta en el puerto que indique Vite.
No hace falta publicar la rama ni subir la imagen a un servidor.

Selecciona un archivo o un ejemplo y pulsa **Eliminar fondo**. Compara los contornos y descarga el PNG. Puedes cancelar el cálculo. El botón de registro exporta un JSON con el archivo, dimensiones, modelo, revisión, navegador y tiempos reales de esa ejecución. Añade por separado tu revisión visual y las características de tu equipo.

## Modelo y decisiones

- Modelo [BRIA RMBG-1.4](https://huggingface.co/briaai/RMBG-1.4).
- Revisión fija `2ceba5a5efaec153162aedea169f76caf9b46cf8`.
- Transformers.js `4.3.1`, dependencia ya presente en el repositorio.
- `AutoModel` y `AutoProcessor` de Transformers.js, precisión `fp32`, backend WASM con un hilo.
- Preprocesamiento del modelo a 1024 × 1024. El resultado conserva las dimensiones de entrada.
- Inferencia en un Web Worker. La interfaz sigue disponible para cancelar.
- La máscara se combina con el canal alfa original para conservar transparencias previas.

Se eligió un modelo de primer plano general para admitir personas y objetos. Su licencia permite uso no comercial; consulta las condiciones del modelo antes de reutilizarlo fuera de la práctica. Se carga el grafo ONNX con `AutoModel` porque la configuración original de BRIA no es compatible con el selector del pipeline en esta versión. El procesador prepara la imagen; la salida se normaliza entre su mínimo y máximo, se redimensiona y se aplica como canal alfa. No se ejecuta código Python remoto.

La primera carga necesita Internet para descargar el modelo y sus archivos de configuración desde Hugging Face. El navegador puede conservarlos en caché. La imagen se decodifica y procesa en el dispositivo. Los pesos y la caché no se guardan en el repositorio.

## Entradas y limitaciones

JPEG, PNG y WebP estáticas. Máximo 15 MiB, 4096 píxeles por lado y 16 millones de píxeles. Se rechazan los archivos vacíos, los formatos distintos y las dimensiones superiores. No se reduce automáticamente la imagen. El tamaño máximo es una restricción de la aplicación, no una garantía de rendimiento en todos los equipos.

No se admiten GIF, SVG ni HEIC. Las imágenes animadas no forman parte del flujo admitido. La segmentación puede perder pelo, transparencias y detalles finos, o conservar elementos del fondo. No es una herramienta de edición manual ni una garantía de recorte perfecto.

La barra informa del progreso del archivo que se descarga. Durante la preparación del modelo y la inferencia es indeterminada. Los tiempos distinguen carga del modelo, inferencia y total. La carga puede incluir descarga o lectura de caché; no se presenta como tiempo de red aislado.

## Imágenes de ejemplo

Las dos imágenes son entradas reales incluidas en `results/`. No son resultados precalculados.

- `fondo-uniforme.jpg`, retrato con pared oscura, 800 × 1199. [Foto 532220 en Pexels](https://www.pexels.com/photo/man-in-black-suit-jacket-532220/). [Archivo descargado](https://images.pexels.com/photos/532220/pexels-photo-532220.jpeg?auto=compress&cs=tinysrgb&w=800). Licencia Pexels. Hay una sombra y un mueble además de la pared.
- `fondo-complejo.jpg`, jirafas en una sabana, 933 × 1405. [Ejemplo público de BRIA](https://huggingface.co/briaai/RMBG-1.4/blob/2ceba5a5efaec153162aedea169f76caf9b46cf8/example_input.jpg). Se conserva la referencia al repositorio de origen y sus condiciones. La ficha consultada no identifica al fotógrafo.

## Comprobación

Los tests de `tests/background-removal.test.mjs` verifican los formatos, archivos vacíos, el límite de bytes y las dimensiones. Se añaden al directorio compartido porque `npm test` recoge sus archivos automáticamente. No se modifican las soluciones de otros alumnos ni el catálogo.

Pruebas realizadas el 29 de octubre de 2026 con `npm run preview`, en el navegador integrado de Codex. El registro identifica Chrome 155.0.0.0. Equipo observado mediante el sistema, MacBook Air con Apple M2, 8 núcleos, 16 GB de RAM y macOS 26.6.2. El userAgent reduce la información del sistema operativo; no se ha usado para identificar el equipo.

| Entrada                                   | Carga del modelo | Inferencia | Total   |
| ----------------------------------------- | ---------------- | ---------- | ------- |
| Retrato, primera ejecución observada      | 28,34 s          | 13,47 s    | 41,90 s |
| Jirafas, modelo en memoria                | 0,00 s           | 13,34 s    | 13,38 s |
| Retrato, repetición con modelo en memoria | 0,00 s           | 14,06 s    | 14,09 s |

Estos tiempos pertenecen a ejecuciones concretas, no a un promedio ni a una garantía. El cero redondeado significa que el modelo ya estaba en memoria. Los registros JSON corresponden a las jirafas y a la repetición del retrato.

- Retrato. Conserva cabeza, pelo, manos y chaqueta. Elimina la pared y casi todo el mueble. Queda un resto fino del borde del mueble bajo el codo izquierdo de la imagen y un halo tenue alrededor del pelo. No se aprecian pérdidas grandes del sujeto a la escala revisada.
- Jirafas. Conserva ambas, con sus cuernos y patas. Elimina vegetación y casi todas las cebras. Queda un fragmento de cebra junto al flanco derecho y restos de hierba y suelo entre las patas y bajo las pezuñas. Los detalles finos presentan halos. No se aprecian pérdidas grandes de las jirafas a la escala revisada.
- Entrada inválida. El botón de prueba crea un archivo de texto. La interfaz muestra el error de formato, desactiva el procesamiento y permite elegir después una imagen válida.
- Descarga. Se descargaron ambos PNG desde la interfaz y se abrieron para revisión. El PNG de las jirafas tiene dimensiones 933 × 1405 y tipo RGBA de 8 bits. El patrón de la interfaz permite comprobar la transparencia.

En `results/` se conservan los dos PNG generados, los registros JSON y una captura de la comparación del retrato. Son evidencias de pruebas reales. La interfaz sigue ejecutando el modelo, no utiliza estos PNG como resultados precalculados.

`npm run check`, `npm run format:check` y `npm run build` pasan. Hay 13 pruebas de código en el repositorio, incluidas las tres nuevas sobre validación. La solución tiene estado `ready` tras ejecutar su flujo principal. No se ha publicado ni se han creado commits o pull requests.

Para repetir la revisión, procesa ambos ejemplos y una entrada inválida. Revisa el pelo, los bordes de la chaqueta, los cuernos, las patas y los huecos entre los animales. Comprueba el PNG sobre un fondo de color. Repite con una imagen propia si lo necesitas.

## Uso de agentes

El agente creó la estructura mediante el comando del repositorio, implementó la interfaz y el worker, fijó el modelo y añadió validaciones. El alumno debe revisar la elección del modelo, los límites de entrada y los contornos obtenidos. Los tiempos se miden con `performance.now()`. No se han inventado salidas ni métricas de calidad.
