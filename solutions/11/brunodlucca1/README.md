# Aumentar la resolución de una imagen

Solución de [BrunoDlucca1](https://github.com/BrunoDlucca1) para [la issue #11](https://github.com/nahuelcostac/redes-generativas-26/issues/11).

## Ejecución

Requiere Node.js 22.12 o posterior y un navegador moderno con WebAssembly. En la raíz del repositorio:

```sh
npm ci
npm run dev
```

Abre la contribución de `BrunoDlucca1` dentro de la issue 11. Selecciona una imagen PNG, JPEG o WebP de entre 16 y 256 px por lado, o usa el patrón de prueba. Pulsa **Ampliar ×2**. La primera ejecución descarga el modelo. Las siguientes reutilizan el modelo mientras la página siga abierta.

La entrada no se envía a un servidor. La salida se prepara como PNG opaco. En imágenes con transparencia, la interfaz compone los píxeles sobre blanco antes de procesarlos.

## Modelo y datos

El modelo es [`Xenova/swin2SR-lightweight-x2-64`](https://huggingface.co/Xenova/swin2SR-lightweight-x2-64), revisión `92a21aca5713f20faf9a87590cdfbdce2e34112c`. Se ejecuta con `@huggingface/transformers` 4.3.1, backend WebAssembly y `fp32`.

El modelo aumenta cada lado por un factor fijo de 2. Acepta PNG, JPEG y WebP de hasta 8 MiB. La interfaz limita cada lado de la entrada a 16–256 px para mantener un uso de memoria razonable. No se incluyen pesos en el repositorio. Transformers.js los descarga y los deja en la caché del navegador.

El ejemplo es un patrón de prueba dibujado con Canvas 2D en el navegador para esta contribución. Su procedencia es la propia interfaz y se ofrece como CC0. Parte de una referencia de 192 × 128 px, se reduce a 96 × 64 px y después se amplía con el modelo. Esto permite contrastarlo con la interpolación bilineal y con una imagen de referencia que el alumno puede conservar externamente al hacer su propia prueba.

## Resultados

La interfaz muestra tres vistas: la entrada, una interpolación bilineal ×2 y la salida de Swin2SR. También muestra los tiempos medidos por el navegador para la carga y la inferencia, y permite descargar la salida. La primera descarga depende de la red y puede tardar.

El flujo principal se comprobó con una imagen PNG de 129 × 123 px. La interfaz generó y descargó una salida PNG de 258 × 246 px, que corresponde al factor ×2 declarado. Los archivos temporales usados para esta comprobación no se incluyen en el repositorio.

Queda por registrar, si se desea ampliar la evidencia de la práctica:

- El patrón incluido y varias fotografías reducidas, comparadas con sus originales.
- Un archivo inválido, un formato no admitido y una imagen fuera del límite de tamaño.
- El navegador, el equipo y los tiempos observados en una ejecución real.

Los tiempos, el navegador y el equipo no se inventan porque dependen de cada ejecución. El modelo puede suavizar texturas, producir halos o inventar detalles. Una imagen ampliada no recupera información que no estaba en la entrada.

## Uso de agentes

Un agente ayudó a revisar el enunciado, localizar el modelo compatible y construir una primera versión de la interfaz. Bruno debe revisar especialmente la decisión de limitar la entrada a 256 px por lado, el uso de WASM con un solo hilo y las limitaciones del modelo. El flujo principal se comprobó con una entrada y una salida reales antes de marcar la solución como `ready`.
