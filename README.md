## Intro

El objetivo de este repositorio es poner en práctica cosas que hemos visto en clase sobre trabajar con agentes.

La idea es abordar una tarea concreta. Para ello, hay dos opciones:

- Elegir una de las issues abiertas
- Proponer una propia

Una vez elegida, has de crear una rama para implementar la solución.

La solución incluye:

- El código correspondiente
- Interfaz web para mostrarla

He preparado una web común que indexará todas las soluciones y sobre la que tenéis que añadir la interfaz de la vuestra.

## Workflow

### Clonar el repositorio

```sh
git clone https://github.com/nahuelcostac/redes-generativas-26.git
cd redes-generativas-26
```

### Crear una rama

Lee la issue y el `AGENTS.md`/`CLAUDE.md`. Crea una rama para tu solución.

```sh
git switch -c issue-3-tu-usuario
```

### Ejecutar la web

Se necesita Node.js 22.12 o posterior y npm.

```sh
npm ci
npm run dev
```

### Añadir tu solución

```sh
npm run new -- --issue 3 --author TU_USUARIO_GITHUB
```

El comando crea `solutions/3/tu_usuario_github/` a partir de la plantilla. Sustituye el número y el usuario por los tuyos. Usa el número del enlace de GitHub.

Si la tarea la propones tú, has de crear primero la issue y añadirla a `catalogue.json`, indicando su tipo.

Hay dos tipos de solución:

- `browser`: el modelo se ejecuta en el navegador. La interfaz ha de permitir interactuar con el modelo.
- `precomputed`: el modelo se ejecuta en local. La interfaz muestra resultados pre-calculados, guardados en `results/`.

> [!IMPORTANT]
> Los pesos de los modelos se mantienen fuera del repositorio.

La solución se registra de forma automática dentro de su issue con estado `draft`. Edita su descripción, su interfaz y lo que haga falta. Cambia el estado a `ready` cuando hayas comprobado su funcionamiento.

En el README de tu solución, explica cómo ejecutarla, qué modelo has usado e info que consideres relevante. Si usas resultados precalculados, has de guardar también las entradas y los parámetros utilizados.

### Compartir tu solución

Antes de compartirla, ejecuta las comprobaciones y prueba la web.

```sh
npm run check
npm run format:check
npm run build
npm run preview
```

Sube tu rama y abre una pull request hacia `main`. Enlaza la issue con `Related to #NUMERO` y explica brevemente qué has hecho.

## Estructura del repositorio

```text
catalogue.json             Issues y enlaces del curso
index.html                 Página del catálogo
src/                       Código y estilos del catálogo
shared/                    Estilos comunes
solutions/
  NUMERO_ISSUE/
    usuario-github/
      solution.json        Datos de la contribución
      README.md            Ejecución y comprobaciones
      web/                 Interfaz y lógica del navegador
      code/                Código que se ejecuta en local
      results/             Resultados y recursos publicados
templates/solution/        Plantilla de una contribución
scripts/                   Creación y validación de soluciones
.github/workflows/         Comprobación y publicación
```
