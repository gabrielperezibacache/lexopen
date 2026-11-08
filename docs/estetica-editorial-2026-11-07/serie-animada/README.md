# Animación de la serie editorial

Se solicitó animar los ocho nuevos grabados usando únicamente Google Flow / Veo 3.1 Fast. Se generó y descargó la animación de Investigación, activo `5403e0b7-6ba9-42e1-9e9b-5075076685a1`, y se integró en Búsqueda, Jurisprudencia y Auditoría. El MP4 público pesa 277.756 bytes, dura 7,916667 s y contiene únicamente vídeo H.264 a 640×360 y 24 fps.

El usuario decide cuándo reproducir; no se descarga vídeo antes de pulsar Animar. Hay pausa, reanudación y regreso al grabado estático, con nombres accesibles en español e inglés. Las placas opacas se identifican mediante una propiedad explícita del recurso.

Flow rechazó Escritura y Audiencias por actividad inusual, también tras un reintento normal. Personas, Flujos, Conexiones, Avisos y Configuración conservan sus imágenes; sus prompts de animación están preparados y no se conectan archivos inexistentes al UI. El usuario pidió además un filósofo griego reflexivo como grabado tenue sobre el fondo azul: Flow rechazó la imagen inicial, el reintento normal y un nuevo intento pedido expresamente por el usuario. El fondo no se incorpora mientras no exista una imagen generada y revisada.

Los prompts e identificadores se conservan en `../media-sources/serie-modulos-animaciones-flow-v1.json` y `../media-sources/filosofo-flow-prompt-v1.json`; la evidencia del bloqueo está en `../media-sources/flow-animaciones-restriccion-v1.jpg`. No se ha utilizado otro proveedor ni creado movimiento localmente.

Validación: ESLint y TypeScript del árbol de componentes editoriales correctos; cinco pruebas Chromium de reproducción, pausa, reanudación, final y recuperación pasan. El chequeo de TypeScript global de esta ejecución falló en `src/lib/notify/providers/whatsapp.test.ts`: importa tres exportaciones ausentes de su proveedor (`createWhatsAppMetaStub`, `createWhatsAppTwilioStub`, `WHATSAPP_NOT_IMPLEMENTED`). Esos archivos no se han modificado en este trabajo. No se ha desplegado la aplicación.


El fondo pendiente se concibe como un filósofo anónimo de la Grecia antigua, sentado con el mentón apoyado en la mano, grabado en plata con un detalle iris. Debe incorporarse como marca tenue en el azul: mayor en el área principal oscura y menor en el lateral azul, con baja opacidad, sin capturar eventos ni competir con texto o controles. No está implementado porque falta la imagen de Flow; no se usa una imagen sustituta.

La lupa integrada se revisó en 12 vistas de sus tres rutas: escritorio/móvil y claro/oscuro. No hay peticiones de vídeo antes de la interacción, desbordamiento ni errores de JavaScript. Resultados detallados en `investigacion/results.json` y resumen en `validation.json`.


## Fondo completado con GPT

Tras la indicación posterior del usuario, se generó el filósofo con GPT y se integró como figura fundida con el azul. Este resultado resuelve el fondo pendiente descrito arriba; el bloqueo de Flow y las siete animaciones pendientes conservan su estado. [Resultado y validación del fondo](../fondo-gpt/README.md).

El nuevo intento de continuar las animaciones en Flow volvió a rechazar Escritura por actividad inusual, también tras Reintentar. No produjo vídeos nuevos. La [cola de continuación](../continuacion-flow/README.md) amplía la preparación a los doce motivos aún estáticos y conserva los prompts y la evidencia actual del aviso.
