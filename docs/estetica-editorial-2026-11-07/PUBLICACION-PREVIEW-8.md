# Publicación de LexOpen 1.1.0-preview.8

Esta versión incorpora doce grabados de GPT en las cabeceras, dos figuras clásicas de fondo y cuatro animaciones existentes de Google Flow. Conserva la paleta índigo/plata/iris, el recorte del fondo de los vídeos y la reproducción automática lenta, silenciada y con pausas. Las imágenes ajustan su encuadre y escala, los subtítulos recuperan su ancho en móvil y las cabeceras adaptan las acciones al espacio disponible. También incluye el refinamiento editorial de tablas, estados vacíos y Facturación.

La publicación parte de `main` en `617a705556b2b2c1d8995ae16c8a8054a8aab1da`. El checkout de trabajo original conserva sus cambios; no se incluyen sus nuevas funciones de conectores, sincronización, modelos locales, modo sin conexión, migraciones o Android. El catálogo de modelos pendiente y su corrección de desborde pertenecen a ese trabajo, no al código de esta versión base.

## Dependencias y compatibilidad

El control obligatorio de publicación encontró avisos en las dependencias de producción de la versión anterior. Se actualizaron Next.js a 16.4.5, Nodemailer a 10.4.0, Zod a 4.6.7 y las dependencias compatibles indicadas por npm. El audit de producción final informa cero vulnerabilidades. Las adaptaciones de Zod conservan las validaciones y los campos omitidos en las actualizaciones parciales de libros y metadatos judiciales; no añaden nuevas funciones del backend.

## Comprobaciones locales

- `npm run build`: correcto, con TypeScript incluido. Next conserva advertencias sobre trazado dinámico de archivos en módulos existentes.
- `npm run lint`: correcto.
- `npm test`: correcto.
- `npm run test:integration`: correcto, en una base PostgreSQL nueva, exclusiva y ficticia, migrada con el esquema de esta versión.
- Seis pruebas Chromium contra la compilación de producción: correctas en 10,4 segundos. Cubren inicio automático de los cuatro vídeos, silencio, velocidad de 0,8, pausa/reanudación, diálogos con Escape y foco, tablas móviles y navegación activa. La configuración local bloqueó el service worker para aislar la comprobación del UI.
- [Vista real de esta compilación en escritorio y móvil](ajuste-imagenes/vista-final.jpg). Se usaron cuentas y expedientes ficticios.

La revisión visual previa del diseño cubrió cuarenta rutas en ambos temas y tamaños de escritorio, tablet y móvil emulados. Esa revisión se realizó sobre el checkout de trabajo; las comprobaciones de compilación y las seis pruebas anteriores corresponden a esta versión aislada basada en `main`.

La construcción, prueba del Host y publicación de cada instalador quedan a cargo del flujo existente de GitHub Actions. Esta evidencia local no acredita todavía la disponibilidad pública de los paquetes, su firma ni una instalación en equipos físicos nuevos.
