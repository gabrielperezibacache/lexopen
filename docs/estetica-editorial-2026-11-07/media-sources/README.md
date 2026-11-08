# Grabados y animaciones editoriales

Las primeras tres imágenes se crearon con `image_gen`; los PNG originales permanecen en esta carpeta. La carpeta de expediente vigente se rehízo íntegramente en Google Flow con Nano Banana 2.1. Sus versiones WebP optimizadas están en `public/editorial/generated/`.

| Grabado | Uso en LexOpen | Original |
| --- | --- | --- |
| Carpeta documental abierta, versión 2 | Causas y Documentos | [Base generada en Flow](flow-expedientes-base-v2.jpg) |
| Dos sillones y mesa de consulta | Clientes | [consulta.png](consulta.png) |
| Libro contable y pluma | Facturación | [libro-contable.png](libro-contable.png) |

Clientes y libro contable conservan transparencia. El expediente v2 utiliza un fondo índigo uniforme, coherente con su vídeo. Se reutiliza `EditorialHeading`, con dimensiones explícitas, imágenes decorativas y la preferencia de movimiento reducido existente. No se emplearon expedientes ni datos de clientes para generar las imágenes. Los [prompts completos](prompts.json) y el [registro de procedencia](../../../public/editorial/generated/provenance.json) identifican las fuentes y los archivos utilizados.

## Google Flow

Se creó el proyecto [LexOpen · Grabados editoriales en movimiento](https://flow.google.com/project/b25bcbf2-49db-4eff-90e4-98740b2e7e79). El primer grabado fue subido como fotograma inicial. La petición utiliza Veo 3.1 Fast, relación 16:9, ocho segundos y una salida; Flow muestra 20 puntos por generación.

El primer intento en Chrome fue rechazado con «Hemos detectado actividad inusual», junto con un aviso de conexión a reCAPTCHA. La sesión del navegador integrado de Google Flow aceptó después las dos peticiones y completó ambos vídeos. [Proyecto con los vídeos terminados](flow-videos-completados.jpg). El [bloqueo inicial](flow-bloqueo.jpg) se conserva como registro del problema resuelto.

Ambas animaciones fueron generadas exclusivamente en **Google Flow con Veo 3.1 Fast**, descargadas mediante su opción 720p y revisadas en varios momentos del vídeo. El expediente vigente mantiene una carpeta abierta estable mientras un folio se levanta y vuelve a apoyarse; el libro contable pasa una página. Cada pista de vídeo dura 7,917 segundos, a 24 fps y 1280 × 720.

| Vídeo | Original descargado de Flow | Copia integrada |
| --- | --- | --- |
| Expediente v2 | [MP4 original](flow-expedientes-v2-original.mp4) | [640 × 360, 151 kB](../../../public/editorial/generated/expedientes-flow-v2.mp4) |
| Libro contable | [MP4 original](flow-libro-contable-original.mp4) | [640 × 360, 438 kB](../../../public/editorial/generated/libro-contable-flow-v1.mp4) |

Las copias integradas se optimizan con FFmpeg (`scale=640:360`, H.264 CRF 25, `yuv420p`, `faststart`) y eliminan la pista de audio que Flow incluyó. Este procesamiento no genera ni sustituye la animación. Los originales se conservan sin modificaciones. No se ha añadido repetición automática ni se afirma que el empalme sea imperceptible.

`EditorialMotion` añade **Animar**, **Pausar** y **Reanudar** en las cabeceras de Causas, Documentos y Facturación. La imagen estática aparece por defecto; no se solicita ningún MP4 hasta pulsar Animar, también con movimiento reducido o ahorro de datos. Al finalizar se recupera la ilustración; ocultar la página pausa el vídeo. Un fallo de carga conserva la imagen y ofrece Reintentar. Los controles admiten teclado y etiquetas en español e inglés.

## Comprobación de la integración

TypeScript y ESLint de los componentes modificados pasan. La ronda local de navegador registra 44 vistas en once apartados, con escritorio/móvil y claro/oscuro: todas cargan con HTTP 200, sin errores de JavaScript ni desbordamiento horizontal. Las capturas usan datos ficticios. [Resultados](comprobacion-interfaz.json).

- [Clientes en escritorio](aplicacion-clientes-light-desktop.png)
- [Clientes en móvil oscuro](aplicacion-clientes-dark-mobile.png)
- [Causas en oscuro](aplicacion-mis-causas-dark-desktop.png)
- [Facturación](aplicacion-facturacion-light-desktop.png)

La compilación `next build --webpack` también terminó correctamente. Mantiene la advertencia de análisis de `module.createRequire` en `src/lib/pjud/public-scrape.ts`, fuera de estos recursos gráficos.

## Verificación inicial de los vídeos

Compilación, TypeScript y ESLint correctos. Las tres pruebas de `e2e/editorial-motion.spec.ts` pasan con los MP4 reales: teclado, reproducción, pausa/reanudación, finalización, ausencia de solicitudes de vídeo antes de la interacción y recuperación tras un error. La revisión de Causas, Documentos y Facturación cubre doce combinaciones de escritorio/móvil y claro/oscuro, con imagen inicial y vídeo activado: sin errores de JavaScript ni desbordamiento horizontal. [Resultados](comprobacion-videos.json).

- [Expediente en escritorio](integracion-mis-causas-light-desktop-video.png)
- [Expediente en móvil oscuro](integracion-mis-causas-dark-mobile-video.png)
- [Libro contable en escritorio](integracion-facturacion-light-desktop-video.png)
- [Ilustración inicial en móvil](integracion-facturacion-dark-mobile-static.png)

## Reemplazo del expediente

La versión 1 deformaba la cubierta cerrada y acercaba demasiado el encuadre. Se reemplazaron tanto la imagen como el vídeo de Causas y Documentos por una carpeta documental abierta, sin lazo, con cierre metálico y márgenes amplios. La imagen inicial y final se fijaron al mismo recurso de Flow. La cubierta permanece rígida y el movimiento se limita al folio, que se levanta y vuelve a apoyarse. El levantamiento generado es más amplio que los milímetros pedidos en el prompt; no se describe como un movimiento microscópico.

[Resultado en Google Flow](https://flow.google.com/project/b25bcbf2-49db-4eff-90e4-98740b2e7e79/edit/e8846c67-37fd-4228-9105-c6176dc1a933), [prompt y procedencia](expedientes-v2.json), [revisión de 16 fotogramas](flow-expedientes-v2-contact.png). La versión anterior se conserva como antecedente; la aplicación referencia los archivos v2. El libro contable conserva sus bytes originales.

Las tres pruebas de reproducción y recuperación de errores pasan. ESLint y TypeScript de los componentes revisados pasan. La comprobación global de TypeScript detectó `TS2339` en `e2e/hearing-live-transcription.spec.ts:249` (`newContext`), fuera de los archivos de este reemplazo. No se atribuye a esta revisión una compilación global de producción correcta.

La revisión visual cubre Causas y Documentos, en escritorio/móvil y claro/oscuro, con imagen inicial y vídeo activado: ocho combinaciones sin errores de JavaScript ni desbordamientos. [Resultados](comprobacion-expedientes-v2.json), [Causas en escritorio](v2-mis-causas-light-desktop-video.png), [Causas en móvil oscuro](v2-mis-causas-dark-mobile-video.png), [Documentos en móvil oscuro](v2-documentos-dark-mobile-static.png).


### Ampliación a Tareas, Plazos y Correspondencia

Tres nuevos grabados generados exclusivamente en Google Flow / Nano Banana 2.1: libreta de trabajo, reloj de bolsillo y sobres con carta. Se incorporan a Tareas, Plazos, Mensajes, Correo y Configuración de correo mediante `EditorialHeading`. Se conservan los originales JPG y los prompts completos en `nuevos-elementos-flow.json`.

La animación del reloj también procede de Google Flow / Veo 3.1 Fast. La fuente añade un segundero en los primeros segundos; para evitar esa aparición progresiva, se utiliza únicamente el tramo estable desde 3 s (4,916667 s), acompañado de su fotograma inicial. El recorte, la reducción a 640×360, H.264 y la eliminación del audio son procesamiento técnico; no se ha creado movimiento localmente. El original completo queda conservado. El resultado pesa 135.786 bytes.

Comprobación local con datos ficticios: 20 combinaciones de cinco rutas, escritorio/móvil y claro/oscuro; imágenes cargadas, sin desbordamiento horizontal ni errores de JavaScript. Cuatro pruebas Chromium verifican reproducción a petición, pausa/reanudación, retorno a la ilustración y recuperación tras error. ESLint de los archivos afectados y TypeScript del árbol de componentes editoriales pasan. Capturas y resultados en `../nuevos-elementos/`. No se ha publicado ni desplegado.
