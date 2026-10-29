# Responder preguntas sobre documentos

[Issue en GitHub](https://github.com/nahuelcostac/redes-generativas-26/issues/12) · Autora `celinesmc`

La solución responde preguntas sobre una colección de tres artículos de Wikipedia mediante RAG. Un modelo de embeddings recupera los fragmentos más parecidos a la pregunta. Un modelo generativo responde con esos fragmentos como contexto. El mismo modelo responde también sin contexto para comparar.

La web muestra cinco preguntas con sus resultados calculados previamente. No ejecuta inferencia ni necesita un servidor de modelos.

## Documentos

Los documentos están en `results/documents.json`. Son tres artículos de Wikipedia en español con licencia CC BY-SA 4.0. Cada documento guarda su URL de revisión.

| Documento              | Revisión  | Caracteres |
| ---------------------- | --------- | ---------- |
| Santiago Ramón y Cajal | 175838528 | 29589      |
| Severo Ochoa           | 175860039 | 12006      |
| Margarita Salas        | 175792385 | 13588      |

`code/fetch_documents.py` descarga el texto plano de los títulos de `code/documents.txt` con la API de Wikipedia. El script elimina las secciones de referencias, notas, bibliografía, obras y enlaces. También elimina los espacios de ancho cero que deja la API. La API devuelve siempre la revisión actual. Por eso, una nueva descarga puede producir un texto distinto. Los textos usados están guardados en el repositorio.

## Modelos y decisiones

- Embeddings. [intfloat/multilingual-e5-small](https://huggingface.co/intfloat/multilingual-e5-small/tree/614241f622f53c4eeff9890bdc4f31cfecc418b3), revisión `614241f622f53c4eeff9890bdc4f31cfecc418b3`, licencia MIT. Es multilingüe y pequeño, con unos 118 millones de parámetros. Se usa con los prefijos `query: ` y `passage: `, media de los estados ocultos y normalización L2. Se ejecuta en `float32`.
- Generador. [Qwen/Qwen2.5-1.5B-Instruct](https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct/tree/989aa7980e4cf806f80c7fef2b1adb7bc71aa306), revisión `989aa7980e4cf806f80c7fef2b1adb7bc71aa306`, licencia Apache-2.0. Es un modelo de instrucciones que admite español. Se ejecuta en `float16` en la GPU para caber en 4 GiB de memoria de vídeo. En CPU se usa `float32`.

Los dos modelos se cargan con Transformers, sin código remoto y con la revisión fija.

El texto se divide en fragmentos de hasta 800 caracteres. Un fragmento agrupa párrafos consecutivos de una misma sección. Un párrafo largo se divide por frases. Una frase de más de 800 caracteres queda entera. La colección produce 98 fragmentos. El texto que recibe el modelo de embeddings incluye el título y la sección del fragmento.

La recuperación calcula la similitud coseno con todos los fragmentos y toma los 4 mejores. No hay base de datos vectorial. El índice se calcula en cada ejecución porque solo tarda unos segundos.

La generación usa decodificación voraz, sin muestreo, con un máximo de 256 tokens nuevos. Así la salida no depende de una semilla. La instrucción con contexto pide usar solo los fragmentos, citarlos con su número y responder `No encuentro la respuesta en los documentos.` si falta la información. La instrucción sin contexto pide una respuesta breve y precisa. Las dos instrucciones completas se guardan en el JSON y se muestran en la web.

## Ejecutar en local

Se necesita Python 3.13 y conexión a Internet para la primera descarga. Desde `code/`, crea un entorno aislado. En Windows, el ejecutable del entorno está en `.venv\Scripts\python.exe`.

```sh
cd code
python -m venv .venv
.venv/Scripts/python -m pip install torch==2.9.0 --index-url https://download.pytorch.org/whl/cu126
.venv/Scripts/python -m pip install -r requirements.txt
```

La primera orden instala PyTorch para CUDA 12.6. Sin GPU NVIDIA, instala la versión de CPU con `pip install -r requirements.txt` y usa `--device cpu`. La ruta de CPU no se ha probado. `code/requirements-lock.txt` registra todas las versiones instaladas en la comprobación.

Para hacer una pregunta nueva, ejecuta lo siguiente.

```sh
python rag.py --question "¿Dónde nació Severo Ochoa?" --output ../results/mi-pregunta.json
```

Para repetir las cinco preguntas publicadas, ejecuta lo siguiente.

```sh
python rag.py --batch questions.json --device cuda --output ../results/answers.json
```

Opciones disponibles.

- `--top-k`. Fragmentos recuperados, de 1 a 10. Por defecto, 4.
- `--chunk-chars`. Tamaño máximo de un fragmento, de 200 a 2000 caracteres. Por defecto, 800.
- `--max-new-tokens`. Tokens nuevos de cada respuesta, de 16 a 512. Por defecto, 256.
- `--device`. `auto`, `cuda` o `cpu`. Por defecto, `auto`.
- `--documents`. Colección en JSON. Por defecto, `../results/documents.json`.

Para cambiar la colección, edita `documents.txt` y ejecuta `python fetch_documents.py`. Después, vuelve a ejecutar el lote. La web lee `results/answers.json` y `results/documents.json`, por lo que no hace falta cambiar su código.

El script rechaza preguntas vacías, identificadores repetidos y parámetros fuera de rango antes de cargar los modelos. Un fallo no deja un JSON parcial. Los pesos se guardan en la caché de Hugging Face, fuera del repositorio. Con los modelos descargados, `HF_HUB_OFFLINE=1` permite repetir la ejecución sin red.

## Ejecución observada

El lote se ejecutó el 29 de octubre de 2026 a las 17:37 UTC. El equipo tenía una NVIDIA GeForce RTX 3050 Ti Laptop GPU con 4 GiB, un Intel Core i5-11400H con 12 procesadores lógicos y 15,8 GiB de memoria. El sistema era Windows 11. Las versiones fueron Python 3.13.12, PyTorch 2.9.0+cu126, Transformers 4.57.1, tokenizers 0.22.2 y huggingface-hub 0.36.0.

La carga de los modelos tardó 350,4 s porque incluyó la primera descarga sin `hf_xet`. En la ejecución de verificación, sin red y con los modelos en caché, la carga tardó 11,0 s. El índice de 98 fragmentos tardó entre 2,9 y 3,1 s.

| Pregunta                  | Fragmentos recuperados          | Tokens de entrada con contexto | Con contexto | Sin contexto |
| ------------------------- | ------------------------------- | ------------------------------ | ------------ | ------------ |
| Nobel de Cajal            | Cajal 29, 26, 1, 27             | 634                            | 9,99 s       | 8,88 s       |
| Margarita Salas y Φ29     | Salas 8, 7, 10, 4               | 850                            | 7,53 s       | 8,99 s       |
| Ochoa y Salas             | Salas 4, 6, 1, 3                | 823                            | 21,33 s      | 4,96 s       |
| Premios Nobel de Medicina | Cajal 26, Ochoa 1, Cajal 27, 28 | 703                            | 14,71 s      | 17,55 s      |
| Nobel de Cela             | Cajal 29, 26, 28, 27            | 631                            | 3,08 s       | 3,99 s       |

Cada tiempo corresponde a una sola ejecución con sincronización de la GPU. La recuperación de cada pregunta tardó entre 18 y 185 ms. La generación fue lenta para un modelo de este tamaño. No se midió la memoria de vídeo, por lo que no se ha comprobado la causa.

## Revisión de las respuestas

La web marca si cada respuesta contiene los datos esperados de `questions.json`. Esta comprobación es automática y solo busca texto. La revisión siguiente la hizo el agente comparando cada respuesta con los fragmentos recuperados. La autora debe confirmarla.

- Nobel de Cajal. Respuesta en un fragmento. Con contexto, la respuesta (1906, con Camillo Golgi) está respaldada por los fragmentos 2 y 3. Sin contexto, el modelo también acierta con su conocimiento previo.
- Margarita Salas y Φ29. Respuesta en un fragmento. Con contexto, «ADN polimerasa» está respaldado por los fragmentos 1 y 2. Sin contexto, el modelo inventa una enzima inexistente.
- Ochoa y Salas. Varios fragmentos. Con contexto, la respuesta acierta la Universidad de Nueva York, que aparece en el fragmento 2. Sin embargo, afirma que Ochoa le enseñó en el laboratorio de Alberto Sols. Los fragmentos dicen que trabajó primero con Sols en Madrid y después con Ochoa en Estados Unidos. Por tanto, la respuesta solo está respaldada en parte. Sin contexto, el modelo inventa la Universidad de California en San Diego.
- Premios Nobel de Medicina. Varios fragmentos de dos documentos. Con contexto, la respuesta combina el fragmento de Cajal (1906) y el de Ochoa (1959) y está respaldada. Sin contexto, el modelo inventa una lista de premiados que no forman parte de la colección.
- Nobel de Cela. Sin respuesta en la colección. Con contexto, el modelo responde que no encuentra la respuesta, que es lo correcto. Sin contexto, responde 1989 con su conocimiento previo. La respuesta no procede de los documentos.

Ninguna respuesta con contexto cita los fragmentos con corchetes, aunque la instrucción lo pide. En la verificación sin red, la respuesta con contexto a «¿Dónde nació Severo Ochoa?» escribe «Larua» en lugar de Luarca. Sin contexto, el modelo responde Madrid, que es incorrecto. El resultado está en `results/verification.json`.

Estas observaciones corresponden a seis preguntas. No constituyen una evaluación general.

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
python -m unittest test_rag -v
```

Se comprobaron los siguientes casos.

- Ejecución real del lote en GPU y de una pregunta propia sin red.
- Rechazo de una pregunta vacía y de `--top-k 0` sin crear el archivo de salida.
- Cinco pruebas Python. Verifican la división en fragmentos, el rechazo de preguntas y documentos inválidos, la búsqueda de datos esperados y la escritura completa del JSON.
- Tres pruebas JavaScript en `tests/rag-documents.test.mjs`. Verifican que cada fragmento procede de la colección y se envió al modelo, que hay preguntas de los tres tipos y que la web rechaza resultados alterados.
- Interfaz compilada en el navegador integrado de Claude Code. Se recorrieron las cinco preguntas y se compararon las respuestas y los fragmentos mostrados con el JSON exportado.
- Fallo de carga al retirar temporalmente `answers.json` de la compilación. La web mostró el error y se recuperó con el botón de recarga.
- Pantalla estrecha de 375 × 812 sin desbordamiento horizontal.

## Trabajo con el agente

El agente (Claude Code) eligió los documentos y los modelos, escribió los scripts y la interfaz, ejecutó los modelos en el equipo de la autora y redactó esta documentación. La decisión principal fue usar dos modelos pequeños que caben en una GPU de 4 GiB y fijar sus revisiones. Las preguntas se eligieron para cubrir los tres casos de la issue.

Para revisar la solución, sigue el recorrido `documents.txt` → `fetch_documents.py` → `results/documents.json` → `rag.py` → `results/answers.json` → `web/app.js`. Comprueba en `rag.py` cómo se forman los fragmentos en `chunk_documents` y cómo se construye la instrucción en `context_message`. Revisa también la sección anterior y confirma la valoración de cada respuesta.
