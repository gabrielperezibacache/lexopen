# Imágenes con GPT y animaciones con Google Flow

Estado de esta entrega: las doce imágenes nuevas, los cuatro vídeos disponibles y los dos grabados de fondo están integrados. Las animaciones adicionales se posponen para otra sesión por indicación del usuario. [Comprobación de los archivos y referencias](integracion-disponible.json).

Se generaron doce grabados nuevos con la herramienta incorporada `image_gen` de GPT y se integraron en las cabeceras compartidas de sus apartados. Siguen el trazo de Atenea aprobada, la paleta plata/índigo/iris y el encuadre editorial. Cada archivo público es WebP de 720×405 con transparencia real; el original generado se conserva sin modificaciones.

La conversión sólo reduce y codifica el archivo, conservando su alfa. La imagen se funde con la superficie de la aplicación sin una placa opaca. Los cuatro vídeos existentes mantienen su fundido, velocidad de 0,8×, pausas de 14 segundos y control por visibilidad y preferencias.

## Archivos integrados

| Motivo | Imagen | Original |
|---|---|---|
| Escritura y minutas | [escritura-gpt-v1.webp](../../../public/editorial/generated/escritura-gpt-v1.webp) | [PNG](../media-sources/escritura-gpt-v1-original.png) |
| Audiencias | [audiencias-gpt-v1.webp](../../../public/editorial/generated/audiencias-gpt-v1.webp) | [PNG](../media-sources/audiencias-gpt-v1-original.png) |
| Personas y portal | [personas-gpt-v1.webp](../../../public/editorial/generated/personas-gpt-v1.webp) | [PNG](../media-sources/personas-gpt-v1-original.png) |
| Flujos y sitios | [flujos-gpt-v1.webp](../../../public/editorial/generated/flujos-gpt-v1.webp) | [PNG](../media-sources/flujos-gpt-v1-original.png) |
| Conexiones e integraciones | [conexiones-gpt-v1.webp](../../../public/editorial/generated/conexiones-gpt-v1.webp) | [PNG](../media-sources/conexiones-gpt-v1-original.png) |
| Avisos y notificaciones | [avisos-gpt-v1.webp](../../../public/editorial/generated/avisos-gpt-v1.webp) | [PNG](../media-sources/avisos-gpt-v1-original.png) |
| Configuración y cuenta | [configuracion-gpt-v1.webp](../../../public/editorial/generated/configuracion-gpt-v1.webp) | [PNG](../media-sources/configuracion-gpt-v1-original.png) |
| Tareas | [tareas-gpt-v1.webp](../../../public/editorial/generated/tareas-gpt-v1.webp) | [PNG](../media-sources/tareas-gpt-v1-original.png) |
| Correo y correspondencia | [correspondencia-gpt-v1.webp](../../../public/editorial/generated/correspondencia-gpt-v1.webp) | [PNG](../media-sources/correspondencia-gpt-v1-original.png) |
| Académico | [academico-gpt-v1.webp](../../../public/editorial/generated/academico-gpt-v1.webp) | [PNG](../media-sources/academico-gpt-v1-original.png) |
| Agenda | [agenda-gpt-v1.webp](../../../public/editorial/generated/agenda-gpt-v1.webp) | [PNG](../media-sources/agenda-gpt-v1-original.png) |
| Clientes | [clientes-gpt-v1.webp](../../../public/editorial/generated/clientes-gpt-v1.webp) | [PNG](../media-sources/clientes-gpt-v1-original.png) |

Prompts completos, herramienta, referencia de estilo, dimensiones, hashes y tratamiento técnico: [gpt-images-v1.json](gpt-images-v1.json). La procedencia se registra también en `public/editorial/generated/provenance.json`.

## Estado de las animaciones

Las doce imágenes de GPT están subidas y verificadas en la biblioteca del proyecto de Flow. Escritura tiene el identificador `ebe5a66f-9d12-464f-b965-597edd5c1e79`. Se envió una animación con la misma imagen de GPT como inicio y final, Veo 3.1 Fast, 16:9, ocho segundos, 720p y una salida. Flow rechazó el intento por «Hemos detectado actividad inusual»; el botón normal Reintentar produjo el mismo aviso.

**No se generó ni integró ningún vídeo nuevo en esta continuación.** Los otros once trabajos conservan sus referencias y prompts preparados, sin envíos repetidos tras el rechazo. No se creó movimiento con otro proveedor ni mediante animación local de los objetos.

- [Cola actual de animaciones sobre las imágenes de GPT](gpt-flow-queue-v1.json)
- [Referencias verificadas en Flow](gpt-flow-uploads.json)
- [Aviso de generación](flow-gpt-image-rechazo.jpg)
- [Imágenes subidas a Flow](flow-gpt-uploads.jpg)
- [Proyecto de Flow](https://flow.google.com/project/b25bcbf2-49db-4eff-90e4-98740b2e7e79)

## Verificación local

Las doce cabeceras se revisaron en 48 vistas: escritorio y móvil, con ambos temas. Todas cargan el archivo de GPT previsto y responden con HTTP 200; no hay desbordamientos horizontales ni errores de JavaScript. Se inspeccionó el conjunto de imágenes en contexto y sus muestras de ambos temas.

Los cuatro casos existentes de inicio automático lento y silencioso pasan. El caso de Facturación se repitió de forma aislada tras una interrupción de navegación local anterior a la interacción con el vídeo. TypeScript del grafo de componentes afectados y ESLint de EditorialHeading pasan. El chequeo global de TypeScript falla en `src/lib/altazor/connectors/easy-oauth.ts` y `easy-oauth.integration.test.ts`, por módulos ausentes y tipos string/undefined ajenos a estos cambios de imágenes. No se modificaron esos módulos.

La revisión usa una base aislada con datos ficticios y tamaños de navegador emulados. No se ha desplegado ni publicado.

- [Vista de la integración](ui-gpt/integracion-final.jpg)
- [Los doce grabados](gpt-grabados-integrados.jpg)
- [Validación](gpt-ui-validation.json)
- [Evidencia de las 48 vistas](ui-gpt/results.json)

El [registro anterior](queue.json) conserva el intento con referencias antiguas, previo a la indicación de generar las imágenes con GPT. La cola vigente es `gpt-flow-queue-v1.json`.
