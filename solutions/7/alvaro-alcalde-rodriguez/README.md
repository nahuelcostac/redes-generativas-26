# Generar imágenes a partir de texto

Solución de **alvaro-alcalde-rodriguez** para [la issue #7](https://github.com/nahuelcostac/redes-generativas-26/issues/7).

## Qué permite hacer

La web compara imágenes precalculadas de tres descripciones. Permite cambiar de descripción, comparar semillas o pasos, consultar los parámetros completos y descargar cada PNG. No ejecuta el modelo en el navegador.

El generador local admite un texto, una semilla y entre uno y cuatro pasos. Guarda las imágenes y un registro de parámetros, versiones, equipo y tiempos. La interfaz solo ofrece configuraciones exportadas.

## Modelo y decisiones

- Modelo [stabilityai/sd-turbo](https://huggingface.co/stabilityai/sd-turbo).
- Revisión fijada `b261bac6fd2cf515557d5d0707481eafa0485ec2`.
- Pipeline de Diffusers y planificador EulerDiscreteScheduler. Su configuración completa queda en cada registro.
- Resolución de 512 × 512 píxeles y `guidance_scale=0.0`, siguiendo la ficha del modelo.
- Pesos de la variante `fp16`, convertidos a `float32` para inferencia en CPU. Descargar esta variante reduce el volumen de descarga; el cálculo sigue siendo de 32 bits.
- Cuatro hilos de PyTorch. No se entrena ni se ajusta el modelo.

Se elige SD-Turbo porque admite pocos pasos y este equipo no tiene una GPU NVIDIA detectada. La ficha del modelo describe un rango de uno a cuatro pasos. Más pasos no garantizan una mejora visual. Consulta su ficha y licencia para conocer las condiciones de uso.

Los tres textos son ejemplos propios redactados para esta práctica. Están en inglés para seguir el idioma de los ejemplos del modelo. La interfaz y la documentación están en español. No se usan fotografías externas como entradas.

## Preparar el entorno local

Desde la raíz del repositorio, con Python 3.12 y Node.js 22.12 o posterior, en PowerShell.

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r solutions/7/alvaro-alcalde-rodriguez/code/requirements.txt
npm ci
```

En esta sesión se usó Python 3.12.14 del entorno de Codex para crear `.venv`, porque el Python del sistema es 3.14. Si no tienes Python 3.12 instalado, debes instalarlo antes de usar `py -3.12`.

`requirements.txt` fija las dependencias principales y la versión de PyTorch para CPU. `code/requirements-lock.txt` registra todas las versiones instaladas en el entorno comprobado. Para repetir ese entorno de Windows con Python 3.12, se puede instalar el archivo lock con el mismo índice de PyTorch.

```powershell
.\.venv\Scripts\python.exe -m pip install --extra-index-url https://download.pytorch.org/whl/cpu -r solutions/7/alvaro-alcalde-rodriguez/code/requirements-lock.txt
```

## Generar los experimentos

```powershell
$env:PYTHONUTF8 = '1'
.\.venv\Scripts\python.exe solutions/7/alvaro-alcalde-rodriguez/code/generate.py --suite --revision b261bac6fd2cf515557d5d0707481eafa0485ec2 --threads 4
```

La primera ejecución necesita Internet y descarga varios GB. Cuando los pesos estén en la caché, añade `--offline` para ejecutar el modelo sin consultar servidores. La caché predeterminada es `$env:USERPROFILE\.cache\huggingface`, fuera del repositorio. No se deben guardar los pesos ni las cachés en `results/`. Si configuras `HF_HOME`, utiliza una carpeta externa al repositorio.

La suite tiene doce imágenes. Para cada descripción se generan estas combinaciones.

| Semilla | Pasos | Uso                    |
| ------- | ----- | ---------------------- |
| 42      | 1     | Referencia compartida  |
| 314     | 1     | Comparación de semilla |
| 42      | 2     | Comparación de pasos   |
| 42      | 4     | Comparación de pasos   |

El script guarda el manifiesto después de cada imagen. Si se interrumpe la ejecución, puedes repetir el comando. Conserva los resultados existentes cuando su hash coincide y su texto y revisión no han cambiado. Para repetir desde cero o cambiar de entorno, usa `--output` con otra carpeta.

## Recuperar una descarga interrumpida

El auxiliar opcional usa el curl del sistema para reanudar el peso UNet. Conserva el archivo `.part` y comprueba su SHA256 antes de aceptarlo. La descarga de esta práctica ya se completó y superó esa verificación. Los pesos quedan fuera del repositorio.

```powershell
.\.venv\Scripts\python.exe solutions/7/alvaro-alcalde-rodriguez/code/resume_unet.py
.\.venv\Scripts\python.exe solutions/7/alvaro-alcalde-rodriguez/code/generate.py --suite --offline --revision b261bac6fd2cf515557d5d0707481eafa0485ec2 --threads 4
```

El auxiliar solo recupera el UNet. En una instalación nueva, ejecuta primero el generador sin `--offline` para obtener los demás archivos. Si una transferencia vuelve a expirar, el auxiliar permite repetir el comando sin empezar desde cero.

## Generar una imagen con otro texto

```powershell
.\.venv\Scripts\python.exe solutions/7/alvaro-alcalde-rodriguez/code/generate.py --prompt 'A small wooden boat on a calm lake, photograph.' --seed 123 --steps 2 --revision b261bac6fd2cf515557d5d0707481eafa0485ec2 --output "$env:TEMP\sd-turbo-personalizado"
```

Este comando admite un texto libre y parámetros nuevos. Su salida se guarda por separado para conservar la colección publicada. Para añadir otra descripción a la web, modifica `EXAMPLES` en `code/generate.py` y ejecuta `--suite`. La web necesita las comparaciones de semilla y pasos de cada descripción.

La semilla permite repetir un experimento en el mismo entorno. No se promete igualdad exacta de píxeles entre versiones, equipos o dispositivos distintos.

## Abrir y comprobar la web

```powershell
npm run check
npm run format
npm run format:check
npm run build
npm run preview
```

Abre `http://127.0.0.1:4173/redes-generativas-26/solutions/7/alvaro-alcalde-rodriguez/web/index.html`.

Las comprobaciones específicas no cargan el modelo.

```powershell
.\.venv\Scripts\python.exe solutions/7/alvaro-alcalde-rodriguez/code/verify_results.py
node --test solutions/7/alvaro-alcalde-rodriguez/code/data.test.mjs
.\.venv\Scripts\python.exe solutions/7/alvaro-alcalde-rodriguez/code/test_cli.py
```

`verify_results.py` requiere haber terminado la generación. Las otras pruebas se pueden ejecutar antes. Se comprueban la integridad de los PNG, las dimensiones, las combinaciones esperadas y que las comparaciones mantengan el mismo texto, revisión y dispositivo. También se rechazan catálogos incompletos y rutas fuera de `results/`.

Para probar entradas inválidas del generador, usa un texto vacío o `--steps 0`. Ambos casos deben finalizar con código 2 antes de cargar el modelo.

## Equipo, resultados y comprobaciones

Las doce imágenes se generaron en local el 6 de noviembre de 2026. Equipo observado en los registros de ejecución. Windows 11, Intel Core i7-1255U y 16.835.264.512 bytes de RAM física reconocida por el sistema. Se utilizó CPU con cuatro hilos y cálculo `float32`. El equipo dispone de Intel Iris Xe Graphics, observada durante la preparación. No se ha comprobado la ruta CUDA.

El manifiesto registra cada entrada, salida, semilla, pasos, resolución, planificador, revisión del modelo, versiones de las dependencias y tiempos. La carga del modelo desde la caché tardó 9,413 segundos. La inferencia de las doce imágenes sumó 771,762 segundos, aproximadamente 12 minutos y 52 segundos. Estos tiempos excluyen la descarga de los pesos y la escritura de los PNG.

| Descripción | Semilla 42, 1 paso (s) | Semilla 314, 1 paso (s) | Semilla 42, 2 pasos (s) | Semilla 42, 4 pasos (s) |
| ----------- | ---------------------- | ----------------------- | ----------------------- | ----------------------- |
| Tetera      | 47,561                 | 55,225                  | 51,362                  | 84,695                  |
| Cactus      | 58,145                 | 46,490                  | 59,197                  | 128,480                 |
| Escena      | 72,996                 | 47,231                  | 46,743                  | 73,637                  |

Son observaciones de una ejecución, con variaciones en la carga del equipo. No se deben interpretar como una comparación de rendimiento controlada. Por ejemplo, un resultado de dos pasos puede tardar menos que otro de un paso.

### Revisión visual

Las imágenes y los parámetros reales se publican en `results/`. La revisión de las doce imágenes está en [evaluation.json](results/evaluation.json).

- La tetera es reconocible, pero tiene apéndices y un asa deformada. Cuatro pasos no corrigen esa estructura.
- El cactus con semilla 42 conserva la maceta de terracota. Con semilla 314, la maceta cambia a un color claro.
- La escena compleja muestra una casa roja o rosada en lugar de amarilla. El elemento azul se parece a una valla y no se reconoce con claridad un banco. Con semilla 314, el árbol aparece a la derecha y la bicicleta tiene un tono naranja.
- En estos ejemplos, aumentar los pasos no garantiza una imagen mejor ni corrige todos los incumplimientos del texto.

### Comprobaciones

- Las doce imágenes superan la comprobación de PNG, dimensiones, hash SHA256 y combinaciones esperadas.
- El validador de la web acepta los doce registros reales.
- Las doce imágenes se han mostrado en el navegador integrado de Codex. Se han probado las comparaciones de semillas y pasos de las tres descripciones, incluidos los resultados de dos pasos. Los nombres de archivo y los parámetros visibles corresponden al manifiesto.
- Se descargó un PNG desde la web y se comprobó que sus bytes coincidían con el resultado exportado.
- Se retiró temporalmente una imagen de la carpeta de compilación. La web mostró el error, permitió reintentar y recuperó la imagen después de restaurarla.
- Las pruebas de entrada inválida rechazan texto vacío, cero pasos, semilla negativa y cero hilos antes de cargar el modelo.

`npm run check`, `npm run format:check` y `npm run build` superan las comprobaciones. También pasan las tres pruebas de datos de la interfaz y la prueba de CLI con cuatro entradas inválidas. La solución queda en estado `ready`. Los archivos compartidos y las soluciones de otros alumnos no tienen cambios de contenido.

## Uso de agentes

El agente preparó el generador, ejecutó los doce experimentos en CPU, revisó las imágenes y comprobó la interfaz y los archivos exportados. Eligió SD-Turbo por su número reducido de pasos y el hardware disponible. El alumno debe revisar esa decisión, los textos, los resultados y la interpretación visual. El agente no ha entrenado un modelo ni ha inventado imágenes o mediciones para completar la práctica.
