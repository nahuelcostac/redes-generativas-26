# Instrucciones para agentes

## Contexto

Este repositorio contiene soluciones individuales a las issues de las prácticas de Redes Generativas.

Lee `README.md` y la issue a abordar antes de cambiar archivos. Revisa el estado de Git y conserva el trabajo existente.

## Estructura de una solución

Usa `npm run new -- --issue NUMERO --author USUARIO_GITHUB` para crear una solución. El usuario debe ser el del alumno. Si falta este dato, solicítalo antes de crear la carpeta. No uses la identidad de otro alumno.

Trabaja en `solutions/NUMERO/usuario-en-minusculas/`. Mantén `solution.json`, `README.md`, `web/`, `code/` y `results/`.

El catálogo registra las soluciones de forma automática. No hace falta editar su HTML para añadir una contribución. `catalogue.json` contiene las issues y el modo de cada una.

`displayNumber` es el número visible de la issue en la web. `number` es su identificador real en GitHub. Usa el identificador de GitHub en los comandos, los enlaces y las carpetas.

Las issues abiertas y resueltas se clasifican por su estado en GitHub. El estado `ready` de una solución no cierra ni reclasifica su issue. `npm run sync:issues` actualiza el estado desde GitHub y el despliegue lo ejecuta al publicar. Las contribuciones se muestran dentro de su issue.

Mantén los enlaces de la interfaz a la issue y al catálogo. Usa rutas relativas para los recursos de cada solución. La web se publica bajo `/redes-generativas-26/`.

Usa `draft` durante el desarrollo y `ready` después de comprobar la solución. Una interfaz vacía no es una solución terminada.

## Modelos y resultados

En `browser`, ejecuta un modelo compatible con el navegador. Muestra los estados de carga, procesamiento y error. Documenta el modelo y los requisitos observados.

En `precomputed`, ejecuta el modelo en local y exporta inputs, outputs y parámetros reales a `results/`. Indica en la interfaz que los resultados están calculados previamente. Cada control debe seleccionar resultados disponibles.

Documenta el identificador y la revisión o versión del modelo, las dependencias, el equipo y los tiempos observados. Explica cómo repetir la ejecución.

Mantén los pesos, las cachés y los archivos de entrenamiento fuera del repositorio. `results/` se publica íntegra.

## Forma de trabajar

Implementa la solución descrita en la issue. Mantén el alcance acordado. Explica las decisiones que afecten al modelo, los datos o la interfaz para que el alumno pueda revisarlas.

Conserva las carpetas de otros alumnos. Cambia los archivos compartidos solo cuando sea necesario para la solución y explica el motivo.

Añade únicamente las dependencias necesarias. Conserva `package-lock.json`. Documenta las dependencias de ejecución local dentro de la solución.

No inventes resultados, pruebas, métricas ni tiempos. Distingue lo comprobado de lo pendiente. No marques una solución como lista si falta ejecutar su flujo principal.

No publiques, edites, cierres ni borres issues sin aprobación previa para la acción y el texto correspondiente. No publiques nuevos enunciados por iniciativa propia.

## Comprobaciones

Ejecuta `npm run check`, `npm run format:check` y `npm run build`. Usa `npm run format` para aplicar el formato común al código. Comprueba la interfaz con `npm run preview` en un navegador.

Prueba el flujo principal y una entrada inválida o un fallo relevante. En las soluciones precalculadas, comprueba que la interfaz muestra los datos exportados correctos.

Añade pruebas de código cuando verifiquen un comportamiento relevante. Una compilación correcta no sustituye una prueba de uso.

Resume los cambios, las comprobaciones y las limitaciones. Incluye una explicación breve del trabajo del agente que el alumno pueda revisar y comprender.

## Escritura y contribución

Escribe la documentación y la interfaz en español claro. Usa frases cortas y directas. Aplica ASD-STE cuando ayude a simplificar. Evita las rayas largas y las expresiones con el formato `frase:frase`.

Enlaza la issue en la pull request mediante `Related to #NUMERO`. Conserva las issues compartidas abiertas para otras contribuciones.
