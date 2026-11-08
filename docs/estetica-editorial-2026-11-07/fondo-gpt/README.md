# Grabados integrados en el fondo índigo

La figura se generó con la herramienta incorporada `image_gen` de GPT, conforme a la indicación del usuario. Es un filósofo griego anónimo sentado, con el mentón apoyado en una mano. El grabado comparte el trazo en plata, el modelado por rayado y la indumentaria clásica del lector del logo.

- Imagen integrada: `public/editorial/generated/filosofo-gpt-v1.webp`, 960×1280, transparencia real, 345.242 bytes.
- Original: `../media-sources/filosofo-gpt-v1-original.png`, 1086×1448 RGBA.
- Prompt completo y procedencia: [filosofo-gpt-v1.json](../media-sources/filosofo-gpt-v1.json).
- Estilo de integración: `src/components/shell/shell.css`; aplicación en `AppShell.tsx` y estado contraído en `AppSidebar.tsx`.

La ilustración se mezcla con el azul mediante `soft-light`, se desatura y se desvanece en su parte inferior. Se representa debajo del contenido, sin captar eventos, como una figura de fondo. El tema oscuro incluye al filósofo en el área principal. En móvil se reduce; el menú contraído, la impresión y los colores forzados ocultan la decoración correspondiente.

Tras la petición de distinguir las imágenes laterales, el menú de navegación utiliza un nuevo busto de Atenea orientado hacia el contenido, generado con GPT. El filósofo central conserva su imagen, posición y fundido. Atenea aparece sobre el azul del lateral en ambos temas y en el menú móvil, con el mismo trazo de grabado y tratamiento índigo.

- Imagen del lateral: `public/editorial/generated/atenea-gpt-v1.webp`, 720×960, transparencia real, 182.562 bytes.
- Original: `../media-sources/atenea-gpt-v1-original.png`, 1086×1448 RGBA.
- Prompt completo y procedencia: [atenea-gpt-v1.json](../media-sources/atenea-gpt-v1.json).

Los ocho motivos editoriales nuevos conservan sus cabeceras. Los cuatro vídeos disponibles (expediente, libro contable, reloj y lupa) están integrados con ciclos automáticos lentos, pausas de 14 segundos, control de pausa, regreso a la ilustración y recuperación ante fallo. El movimiento reducido y el ahorro de datos conservan la imagen fija. Véase [la integración de animaciones](../animaciones-integradas/README.md). Las siete animaciones que Flow no llegó a generar siguen pendientes; no se han sustituido por vídeos de otro proveedor.

Validación local con datos ficticios: 35 vistas iniciales de los ocho motivos, ambos temas, móvil/escritorio y menú; 11 vistas finales del fundido y los estados del menú, sin fallos de imagen, desbordamiento ni errores de JavaScript. TypeScript global y ESLint de los componentes afectados pasan; cinco pruebas Chromium de reproducción pasan. No se ha desplegado ni publicado.

La revisión del lateral distinto añade 11 vistas locales de Buscar, Minutas y los estados del menú en ambos temas, escritorio y móvil: las dos imágenes responden con HTTP 200, las fuentes son distintas, no hay errores de JavaScript ni desbordamientos, y el lateral contraído oculta su grabado. Evidencia: [laterales/results.json](laterales/results.json) y [laterales/validation.json](laterales/validation.json).

[laterales/integracion-final.jpg](laterales/integracion-final.jpg) muestra la versión actual en escritorio y menú móvil. `integracion-final.jpg`, `results.json`, `fundido/results.json` y `validation.json` conservan la verificación anterior del filósofo.
