# Buscar textos por su significado

Solución de `GuillermoAlvarezPrado` para la issue [#3 en GitHub](https://github.com/nahuelcostac/redes-generativas-26/issues/3).

## Uso

Desde la raíz del repositorio, ejecuta `npm ci` y `npm run dev`. Abre la ruta `solutions/3/guillermoalvarezprado/web/index.html`. También se puede comprobar la versión de producción con `npm run build` y `npm run preview`.

La interfaz incluye 18 textos de ejemplo sobre servicios universitarios y cinco consultas preparadas. También admite consultas propias. La primera búsqueda descarga el modelo en el navegador. Después compara los tres primeros resultados por similitud coseno con un orden por coincidencias de palabras, y muestra un mapa PCA de los embeddings de la colección.

## Modelo y datos

- Modelo: [`Xenova/paraphrase-multilingual-MiniLM-L12-v2`](https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2), exportación ONNX para Transformers.js.
- Revisión: `7e3d5398ff67a776281d0a27b2d47a964d5bfffb`.
- Transformers.js: `@huggingface/transformers` `4.3.1`, dependencia existente del repositorio.
- Ejecución: WebAssembly en CPU, un hilo y cuantización q8, dentro de un Web Worker.
- Datos: 18 textos breves escritos para esta demostración. No describen servicios reales ni incluyen datos personales.

El worker genera embeddings con pooling medio y normalización L2. La similitud coseno entre vectores normalizados ordena los textos. La comparación literal cuenta términos únicos compartidos después de normalizar acentos y retirar palabras frecuentes en español. En caso de empate, utiliza la similitud coseno para estabilizar el orden.

La gráfica centra la matriz de similitud de los embeddings y obtiene las dos componentes principales por iteración de potencia. Es una proyección de exploración; no participa en el ranking y puede ocultar distancias presentes en el espacio original.

## Limitaciones y comprobaciones

El modelo multilingüe puede relacionar consultas en español, pero la clasificación depende de cómo se redactaron los textos y del dominio con el que se entrenó. La similitud no es una probabilidad ni prueba que un resultado sea correcto. La colección pequeña solo permite una demostración. El buscador recupera textos, no genera respuestas.

Comprobado el 29 de octubre de 2026 en la vista previa con el navegador integrado de Codex. La página cargó y la consulta vacía mostró su error de validación. Al lanzar una consulta válida, el worker empezó a descargar el modelo, pero el progreso permaneció en el 1 % durante más de un minuto. No se obtuvieron embeddings ni resultados; por eso no hay tiempos de carga o inferencia y la solución sigue en `draft`. El equipo físico no quedó identificado en esta sesión. El procesamiento previsto se realiza en el navegador; el código no envía las consultas a un servicio propio.

La comprobación automatizada del catálogo y las diez pruebas existentes pasan. También pasan Prettier para esta solución y la compilación Vite. El chequeo global de formato del repositorio señala archivos anteriores fuera de esta solución; no se reformatearon contribuciones ajenas.

## Uso de agentes

El agente preparó la interfaz, la colección y el cálculo de similitud. Se eligió ejecución local en el navegador para que las consultas no dependan de un servidor. La elección de PCA se revisó para que la gráfica no afecte al ranking, y la interfaz explica que la proyección pierde información. El autor puede revisar el worker, la lista de textos y la fórmula de palabras clave en `web/`.
