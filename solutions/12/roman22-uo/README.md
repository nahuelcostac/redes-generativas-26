# Responder preguntas sobre documentos

[Issue #12](https://github.com/nahuelcostac/redes-generativas-26/issues/12) · Autor `Roman22-uo`

La interfaz permite elegir una pregunta, comparar la respuesta generada con contexto y sin él, consultar los fragmentos y ver una revisión manual del respaldo documental. Es una solución `precomputed`: la web solo presenta los datos exportados. El script ejecuta el RAG en local.

## Ejecución local

Se necesita Python 3.10 o posterior. La primera instalación y descarga de modelos requieren conexión a Internet. Desde la raíz del repositorio:

```sh
python -m pip install -r solutions/12/roman22-uo/code/requirements.txt
python solutions/12/roman22-uo/code/run_rag.py
```

El script admite `--top-k`, `--max-new-tokens`, `--threads` y `--output`; consulta `python solutions/12/roman22-uo/code/run_rag.py --help`. Los pesos se guardan en la caché de Hugging Face, fuera del repositorio.

## Modelos y datos

- Embeddings: `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`, revisión `e8f8c211226b894fcb81acc59f3b34ba3efd5f42`.
- Generación: `Qwen/Qwen2.5-0.5B-Instruct`, revisión `7ae557604adf67be50417f59c2c2f167def9a775`, en `float32` y con generación determinista (`do_sample=False`).
- `code/documents.json` contiene dos textos ficticios redactados para esta práctica. No representan instituciones ni datos reales.
- Cada documento se divide en ventanas de 42 palabras con solapamiento de 10. Se recuperan los dos fragmentos con mayor similitud coseno.
- `results/examples.json` contiene preguntas, respuestas, puntuaciones, fragmentos, parámetros, revisiones y tiempos. No incluye pesos.

El script no llama a una API de inferencia. Al regenerar los resultados, vuelve a revisar manualmente las respuestas y actualiza sus etiquetas de evaluación. La revisión guardada describe solo las salidas publicadas.

## Resultados observados

Se probaron un dato directo, una pregunta que combina cifras de los dos documentos y una pregunta cuya respuesta no aparece en la colección.

- La producción de 21.600 kWh está respaldada por la guía.
- Para el porcentaje, los documentos dan 15.000 / 30.000 = 50 %. El modelo respondió 75 %, así que la respuesta no está respaldada.
- Ningún documento indica cuántos paneles hay. El modelo respondió 20; también es una salida no respaldada.
- Sin contexto, el modelo se abstuvo en las tres preguntas.

Las salidas no contienen citas textuales. La interfaz muestra los fragmentos recuperados para contrastarlas. Las evaluaciones visibles distinguen las respuestas respaldadas de las que fallan. El modelo puede equivocarse y este ejemplo no garantiza cómo responderá a otras preguntas.

## Equipo y tiempos

La ejecución se hizo en Windows 10, Python 3.10.7 y CPU Intel64, familia 6, modelo 58. El sistema informó 7,9 GiB de memoria. Se usaron cuatro hilos de CPU. Versiones: PyTorch 2.2.2+cpu, Transformers 4.45.2 y Sentence Transformers 3.2.1. La carga desde caché tardó 12,581 s para embeddings y 9,998 s para el generador; no incluye la primera descarga.

| Pregunta               | Con contexto | Sin contexto |
| ---------------------- | -----------: | -----------: |
| Electricidad producida |     20,630 s |      5,478 s |
| Proporción del consumo |     36,041 s |      6,261 s |
| Número de paneles      |     11,045 s |      8,660 s |

Cada consulta se ejecutó una vez. Los tiempos dependen del equipo y no son una evaluación de rendimiento.

## Comprobaciones

Las dos pruebas Python comprueban el solapamiento entre fragmentos y el tratamiento de un documento vacío. También se probaron las tres preguntas con inferencia real en CPU. `npm run check` y `npm run build` pasaron. Los archivos de esta solución pasan Prettier; `npm run format:check` global señala numerosos archivos preexistentes sin formato y no se reformatearon contribuciones ajenas. El servidor de vista previa arrancó, pero queda pendiente revisar visualmente la interfaz en el navegador.

## Trabajo con el agente

El agente implementó la fragmentación, recuperación semántica, generación con y sin contexto, interfaz y exportación. Revisa el recorrido `code/documents.json` → `code/run_rag.py` → `results/examples.json` → `web/app.js`, y verifica por qué el 75 % y los 20 paneles no tienen respaldo documental.
