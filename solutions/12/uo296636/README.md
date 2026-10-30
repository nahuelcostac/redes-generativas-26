# Preguntas sobre la Universidad de Oviedo con RAG

[Issue en GitHub](https://github.com/nahuelcostac/redes-generativas-26/issues/12) · Autor `UO296636`

La solución responde preguntas sobre la Universidad de Oviedo. Usa una colección de 14 artículos de Wikipedia sobre sus campus, escuelas, facultades y grados. El flujo sigue el esquema RAG:

1. Divide los artículos en fragmentos.
2. Calcula un embedding para cada fragmento y para la pregunta.
3. Recupera los fragmentos más parecidos.
4. Da esos fragmentos como contexto a un modelo generativo.

Cada pregunta se responde también sin contexto con el mismo modelo. Así se puede comparar el efecto de los documentos. La web solo muestra resultados calculados previamente. No ejecuta ningún modelo.

## Qué muestra la interfaz

- Un selector con siete preguntas de tres tipos.
- La respuesta con contexto documental y la respuesta sin contexto, una al lado de la otra.
- Los cuatro fragmentos recuperados, con su similitud, su sección y un enlace a la revisión exacta del artículo.
- El prompt completo de cada respuesta.
- Los parámetros, los modelos, el equipo y los tiempos.
- La lista de documentos de la colección y su licencia.
- Una revisión manual de cada respuesta. Indica si los documentos la respaldan.

## Modelos y decisiones

| Función    | Modelo                                                                                                                                | Revisión                                   | Licencia   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ---------- |
| Embeddings | [intfloat/multilingual-e5-small](https://huggingface.co/intfloat/multilingual-e5-small/tree/614241f622f53c4eeff9890bdc4f31cfecc418b3) | `614241f622f53c4eeff9890bdc4f31cfecc418b3` | MIT        |
| Generación | [Qwen/Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct/tree/989aa7980e4cf806f80c7fef2b1adb7bc71aa306)         | `989aa7980e4cf806f80c7fef2b1adb7bc71aa306` | Apache-2.0 |

Los dos modelos se cargan con Transformers. No se usa LangChain ni una base de datos vectorial. La colección es pequeña (157 fragmentos), por lo que basta un producto matricial en PyTorch. Así el código del flujo es corto y se puede revisar entero en `code/rag.py`.

- **Embeddings.** E5 multilingüe funciona bien en español y ocupa poco. Necesita los prefijos `query: ` y `passage: `. Se aplica _mean pooling_ y normalización L2. La similitud es el coseno.
- **Fragmentos.** Cada sección del artículo se divide en ventanas de 120 palabras con 30 de solapamiento. Una ventana nunca cruza dos secciones. Cada fragmento se indexa con el título del artículo y el nombre de la sección. Se descartan las secciones de referencias y enlaces. El fragmento más largo tiene 270 tokens. El límite de E5 es 512, así que no se trunca ninguno.
- **Generación.** Qwen2.5-1.5B-Instruct responde en español y cabe en una GPU de 8 GB en `float16`. Se usa decodificación voraz (`do_sample=False`) para que las respuestas sean reproducibles. El límite es de 256 tokens nuevos.
- **Instrucción con contexto.** Pide responder solo con los fragmentos, citarlos con `[n]` y usar una frase fija cuando no hay respuesta. El texto exacto aparece en la interfaz y en `results/answers.json`.

## Documentos

`results/documents.json` contiene el texto plano de 14 artículos de [Wikipedia en español](https://es.wikipedia.org/), con licencia [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.es). Se descargaron el 30 de octubre de 2026 con la API de MediaWiki. Cada documento guarda su título, su número de revisión y un enlace `oldid` a esa revisión. La lista de artículos está en `code/articles.json`.

Los artículos cubren la universidad en general, los campus de El Milán, El Cristo, Los Catalanes, Gijón y Mieres, la Escuela de Ingeniería Informática, las politécnicas de Gijón y Mieres, la Escuela de Minas, las facultades de Derecho, Enfermería de Gijón y Jovellanos, y el Museo de Geología.

No se usaron las páginas de uniovi.es. Su contenido no tiene una licencia libre que permita copiarlo al repositorio.

## Ejecutar en local

Se comprobó en Windows 10 con un entorno conda. Desde la carpeta `code/`:

```sh
conda create -n redes-generativas python=3.10
conda activate redes-generativas
pip install --index-url https://download.pytorch.org/whl/cu126 torch==2.9.0
pip install -r requirements.txt
```

`requirements.txt` fija las dependencias principales. `requirements-lock.txt` registra todas las versiones instaladas en la ejecución. La línea `torch==2.9.0+cu126` necesita el índice de PyTorch indicado arriba. Sin GPU NVIDIA, instala `torch==2.9.0` desde PyPI y usa `--device cpu`. La ruta en CPU no se ha probado.

Para descargar otra vez los documentos (sustituye `results/documents.json`):

```sh
python fetch_documents.py --titles articles.json --output ../results/documents.json
```

Para repetir las siete preguntas publicadas:

```sh
python rag.py --questions questions.json --device cuda --output ../results/answers.json
```

Para hacer una pregunta nueva:

```sh
python rag.py --question "¿Dónde está la Facultad de Química?" --top-k 4 --output ../results/mi-consulta.json
```

`--top-k` y `--max-new-tokens` cambian esos parámetros. Los demás están en `questions.json`. La salida tiene el mismo formato que `results/answers.json`. La web lee ese archivo. Para publicar otras preguntas, edita `questions.json` y genera de nuevo `results/answers.json`. Después actualiza `results/review.json`: la interfaz exige una revisión por respuesta.

La primera ejecución descarga los pesos a la caché de Hugging Face, fuera del repositorio. Después, `HF_HUB_OFFLINE=1` permite repetir la ejecución sin red. Así se ejecutó la consulta de `results/verification-top-k-8.json`.

Las preguntas vacías, los tipos desconocidos, los identificadores repetidos y los parámetros fuera de rango se rechazan antes de cargar los modelos. Un error no deja un JSON parcial.

## Ejecución observada

Los resultados se generaron el 30 de octubre de 2026 a las 14:39 UTC.

- Equipo: NVIDIA GeForce RTX 4060 (8 GiB), Intel de 12 procesadores lógicos (Family 6 Model 158), 32 GiB de RAM, Windows 10.
- Software: Python 3.10.22, PyTorch 2.9.0+cu126, Transformers 4.57.1, huggingface-hub 0.36.0, CUDA 12.6.
- Carga del modelo de embeddings: 10,6 s. Incluye la descarga.
- Indexación de los 157 fragmentos: 0,6 s.
- Carga del generador: 56,3 s. Incluye la descarga de unos 3 GB. Con la caché llena tardó 2,7 s.
- Memoria máxima de GPU asignada por PyTorch durante las preguntas: 3,5 GiB.

| Pregunta         | Tipo          | Recuperación | Con contexto       | Sin contexto      |
| ---------------- | ------------- | ------------ | ------------------ | ----------------- |
| fundacion        | directa       | 0,017 s      | 25 tokens, 1,5 s   | 24 tokens, 1,1 s  |
| sede-informatica | directa       | 0,010 s      | 33 tokens, 1,5 s   | 37 tokens, 1,7 s  |
| grados-mieres    | directa       | 0,010 s      | 236 tokens, 10,7 s | 78 tokens, 3,5 s  |
| campus-gijon     | combinada     | 0,013 s      | 211 tokens, 9,7 s  | 172 tokens, 7,7 s |
| derecho-letras   | combinada     | 0,010 s      | 38 tokens, 1,8 s   | 42 tokens, 1,8 s  |
| precio-matricula | sin respuesta | 0,011 s      | 9 tokens, 0,5 s    | 88 tokens, 4,0 s  |
| nota-medicina    | sin respuesta | 0,012 s      | 9 tokens, 0,5 s    | 84 tokens, 3,9 s  |

Cada tiempo corresponde a una sola ejecución. No es un estudio de rendimiento. Todas las respuestas terminaron con el token de fin del modelo.

## Resultados y limitaciones

La revisión de las respuestas está en `results/review.json` y en la interfaz. La hizo ChatGPT. Comparó las 14 respuestas con los fragmentos recuperados y con el texto completo de los 14 artículos. Evaluó por separado el respaldo de cada afirmación y la corrección de las citas `[n]`. En las respuestas sin contexto, «no respaldada» significa que la respuesta contradice la colección o no tiene apoyo en ella.

En las siete preguntas evaluadas, el uso de contexto documental permitió obtener tres respuestas respaldadas, dos parcialmente respaldadas y dos abstenciones correctas. Las respuestas sin contexto presentaron errores factuales o afirmaciones no respaldadas por la colección. Estos resultados describen únicamente esta muestra y no constituyen una estimación general de precisión. El modelo tampoco respetó correctamente el requisito de citas en ninguna de las cinco respuestas factuales con contexto.

Problemas observados con contexto:

- **grados-mieres.** Los seis grados son correctos, pero la respuesta también presenta los másteres como grados. Además cita el fragmento [1] cuando la lista está en el [2].
- **campus-gijon.** Los cuatro centros son correctos. La respuesta no enumera los grados reales de la Facultad Jovellanos: usa etiquetas genéricas y llama «postgrado» a dos grados. El fragmento con su oferta académica no está entre los cuatro recuperados. La pregunta mezcla dos temas y el embedding de la pregunta se parece más a los fragmentos generales de la facultad. Se repitió la consulta con `--top-k 8` (`results/verification-top-k-8.json`). Ese fragmento tampoco apareció y la respuesta empeoró: repite una lista inventada hasta el límite de 256 tokens. Una mejora posible es dividir las preguntas combinadas en subconsultas.
- **Citas.** La instrucción pide citar los fragmentos con `[n]`. Cuatro respuestas factuales no citan nada. La de grados-mieres cita un fragmento que no contiene la lista.

La abstención funcionó en las dos preguntas sin respuesta. Con solo dos casos no se puede generalizar. La revisión manual no es una métrica automática.

## Comprobaciones

Desde la raíz del repositorio:

```sh
npm run check
npm run format:check
npm run build
npm run preview
```

Desde `code/`:

```sh
python -m unittest -v test_rag
```

Se comprobaron estos casos:

- Ejecución real de las siete preguntas en GPU y de una consulta suelta sin red.
- Nueve pruebas Python. Verifican la división en secciones y ventanas, el orden de recuperación, los prompts con y sin contexto, la extracción de citas, el rechazo de lotes inválidos y el rechazo de una pregunta vacía antes de cargar los modelos.
- Tres pruebas JavaScript en `tests/rag-documents.test.mjs`. Verifican que cada fragmento mostrado procede del texto de los documentos, que el prompt con contexto los contiene y el otro no, y que la interfaz rechaza resultados incoherentes.
- Interfaz compilada en el navegador integrado de Claude Code. Para las siete preguntas, las respuestas, los fragmentos y los prompts mostrados coinciden con `results/answers.json`.
- Fallo de carga al retirar temporalmente `answers.json` de la compilación. Se mostró el error y el botón de recarga recuperó la interfaz al restaurar el archivo.
- Pantalla de 375 × 812. Los paneles se apilan y no hay desbordamiento horizontal.

## Trabajo con el agente

El agente (Claude Code) propuso la colección, escribió los scripts, ejecutó los modelos y construyó la interfaz. El alumno eligió el tema de los documentos y el entorno conda. La primera revisión de las respuestas la hizo Claude Code. Después el alumno la sustituyó por una revisión más detallada, hecha con ChatGPT.

La decisión principal fue no usar una librería RAG. El flujo completo cabe en `code/rag.py` y cada paso queda visible: `split_sections` → `chunk_documents` → `embed` → `rank` → `build_messages` → `generate`. Otra decisión fue responder cada pregunta también sin contexto. Esa comparación muestra que los datos correctos proceden de los documentos y no del modelo.

Para revisar la solución, sigue el recorrido `articles.json` → `fetch_documents.py` → `results/documents.json` → `rag.py` → `results/answers.json` → `web/app.js`. Comprueba en la interfaz la pregunta `campus-gijon`: allí se ve un fallo real de la recuperación.
