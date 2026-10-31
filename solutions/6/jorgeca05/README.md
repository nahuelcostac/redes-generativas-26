# Clasificar textos con categorías definidas por el usuario

Solución de JorgeCA05 para la issue #6.

## Ejecución

El proyecto está diseñado con una arquitectura basada en el navegador (modo `browser`), por lo que no requiere de la carpeta `code/` ni de scripts de Python locales.

**Requisitos:**

- Node.js (versión 22.12 o posterior) y `npm`.

**Comandos para su ejecución:**

1. Instalar dependencias del catálogo: `npm ci`
2. Levantar el entorno de desarrollo: `npm run dev`
3. Abrir la URL local (normalmente `http://localhost:5173`), navegar a la issue #6 y pulsar en "Abrir solución →".

La librería `@xenova/transformers` se importa directamente desde las dependencias locales del proyecto (evitando el uso de CDN externas) para prevenir bloqueos de seguridad o errores de CORS al empaquetar la aplicación.

## Modelo y datos

- **Identificador del modelo:** `Xenova/mobilebert-uncased-mnli`
- **Tipo:** Zero-shot classification.
- **Procedencia:** Repositorio de Hugging Face. Se seleccionó este modelo como alternativa accesible y ligera tras encontrar errores de autorización (HTTP 401) en producción al intentar descargar los pesos de variantes más complejas como `mDeBERTa`.
- **Obtención:** No es necesario descargar nada manualmente. El pipeline de `Transformers.js` descarga automáticamente los pesos del modelo y los almacena en la caché del navegador del usuario la primera vez que se carga la página.

## Resultados

**Qué funciona:**

- La descarga e inicialización del modelo directamente en el cliente con una barra de progreso visible.
- La clasificación interactiva de textos utilizando categorías personalizadas y dinámicas (separadas por comas).
- La interfaz valida correctamente entradas vacías o insuficiencia de categorías (mínimo 2).
- Los resultados se muestran ordenados de mayor a menor probabilidad y se registra el tiempo de inferencia.

**Limitaciones detectadas:**
El modelo utilizado (`Xenova/mobilebert-uncased-mnli`) presenta un rendimiento muy deficiente al clasificar textos en español, ya que está optimizado para inglés.

- _Ejemplo probado:_ Al introducir el texto "El delantero marcó un hat-trick en la final del torneo", el modelo falló la clasificación, asignando una mayor probabilidad a "tecnología" (34.82%) o "política" (31.52%) que a la correcta "deportes" (20.20%).
- _Conclusión:_ Para entornos reales con textos en español, sería necesario utilizar un modelo multilingüe más robusto, asumiendo el coste de un mayor tamaño de descarga o gestionando tokens de acceso.

**Registro de ejecución:**

- **Equipo:** Portátil con procesador Intel i7, 32GB RAM
- **Navegador:** Google Chrome
- **Tiempo de descarga inicial:** 4s
- **Tiempo de inferencia:** 216ms

## Uso de agentes

- **Tarea realizada:** Se utilizó el agente de IA (Gemini) para redactar la estructura del `index.html` y desarrollar la lógica asíncrona de `app.js` interactuando con la API de Transformers.js, así como para la resolución de errores del entorno de Node.js.
- **Decisión revisada 1 (Estructura de la web):** Inicialmente el agente generó un `index.html` y un `app.js` completos desde cero. Tras revisar la estructura del repositorio, descarté esa versión y le pedí que adaptara el código para respetar estrictamente la plantilla del profesor, inyectando únicamente los controles dentro del contenedor `<div id="app">`.
- **Decisión revisada 2 (Cambio de modelo):** Inicialmente intentamos usar `Xenova/mDeBERTa-v3-base-mnli-xnli`, pero en el entorno de `preview` devolvía un error 401 de Hugging Face. Con ayuda del agente, diagnosticamos el error en la consola del navegador y modificamos el código para importar un modelo abierto (`mobilebert`) y cargar la librería desde local.
- **Comprobación del resultado:** Validé el código ejecutando `npm run build` y `npm run preview`, comprobando que todas las pruebas pasaban correctamente y que la aplicación funcionaba en producción (asumiendo las limitaciones del modelo con el idioma español).
