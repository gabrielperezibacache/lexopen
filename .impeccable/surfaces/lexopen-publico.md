# LexOpen público

- Mode: Read.
- Primary target: `docs/perezibacache-site/lexopen/index.html`.
- Related targets: `privacidad/index.html`, `styles.css` y `assets/` dentro de esa carpeta.
- Fuente aprobada: commit `d866763`, once archivos de la portada, privacidad, imágenes, fuentes y sus licencias. Este registro describe esa fuente; no modifica sus bytes ni el sistema global.
- Propósito: identificar la aplicación y explicar las conexiones de lectura antes del consentimiento. La política conserva contacto, alcance del tratamiento y opciones de retirada.

## Overview

La superficie continúa Midnight editorial: lector clásico grabado en plata, firma transparente y acento iris sobre índigo profundo. La portada explica el trabajo jurídico y académico mediante texto directo, una lista de capacidades y una captura real del escritorio de Altazor. Privacidad conserva la misma identidad en una columna de lectura.

El material gráfico procede de los activos aprobados de la aplicación. No se define otra identidad ni se extiende esta composición al resto del sitio del estudio. El registro queda limitado a esta superficie; `DESIGN.md` y `.impeccable/design.json` permanecen fuera de su alcance.

## Colors

Los valores observados en `styles.css` son el índigo de fondo (`--night: #0d1022`), plata para texto principal (`--silver: #f4f3f7`), iris para enlaces y acción (`--iris: #aab5ff`), texto secundario claro (`--muted: #c3c9df`) y filetes (`--rule: #313958`). El botón utiliza tinta oscura sobre iris; el estado hover aclara el fondo. Los enlaces se reconocen por subrayado y color.

## Typography

Sora sostiene el cuerpo, la navegación y los controles; Fraunces identifica la marca y los títulos. Ambas fuentes se sirven desde archivos WOFF2 locales con sus avisos OFL. Son las mismas familias del mundo existente, aunque aquí se declaran directamente y el sistema global las expresa mediante variables.

El cuerpo usa un tamaño base de `1rem`, interlineado `1.8` y párrafos de hasta `68ch`. El título de portada escala entre `2.7rem` y `5.25rem`; los títulos de sección, entre `2rem` y `3.3rem`. Los encabezados mantienen peso 500, interlineado `1.12`, espaciado `-.025em` y composición equilibrada. La política reduce el título y emplea subtítulos para separar cada cuestión.

Los avisos del detector que presentan Sora o Fraunces como fuentes ajenas corresponden a esa diferencia entre nombres directos y variables. El uso de Fraunces en los encabezados continúa la marca aprobada. No se añadieron familias, excepciones ni silenciamientos para ocultar estos avisos; tampoco justifican rehacer una identidad que el usuario ya aprobó.

## Layout

La columna exterior mide como máximo 1200 px y conserva 32 px por lado. La portada combina texto y firma en dos columnas; las secciones alternan introducción y lista o dos columnas de texto. Los filetes y el espacio vertical marcan los cambios de tema. La información sobre cuentas termina con un enlace explícito a privacidad.

A 700 px o menos, el margen lateral pasa a 20 px, las columnas se apilan, la firma se centra y el pie se organiza verticalmente. Las secciones pasan de 76 px a 48 px de separación interior. La política tiene una columna máxima de 790 px. Esta jerarquía se conserva a 360 px: marca y navegación, propuesta, acción de descarga, firma, capacidades, Altazor, conexiones y pie.

## Elevation & Depth

La profundidad procede de la ilustración grabada y de la captura del escritorio. La página evita sombras decorativas, tarjetas repetidas y capas superpuestas. El fondo continuo y los filetes sostienen una lectura tranquila; la captura ocupa el ancho disponible sin convertirse en otra interfaz interactiva.

## Shapes

El lector y la firma mantienen su transparencia. El botón y la captura usan esquinas de 12 px. El foco de los enlaces emplea un contorno iris de 3 px con separación de 5 px. No se añaden anillos alrededor de la marca ni otros marcos que alteren los activos aprobados.

## Components

- **Cabecera:** marca con lector de 46 px, enlaces a privacidad y al estudio; en móvil, lector de 36 px. El enlace inicial permite saltar al contenido mediante teclado.
- **Acción principal:** «Ver descargas de LexOpen» dirige a Releases en GitHub. Tiene al menos 48 px de alto, fondo iris, texto oscuro y un cambio de fondo al pasar el puntero. El enlace no acredita que exista un instalador nuevo ni que se haya comprobado en cada sistema operativo.
- **Capacidades:** lista de tres temas con nombre, descripción y filetes. No simula estados, métricas ni cuentas conectadas.
- **Altazor:** el chungungo utiliza la misma celda inicial del sprite de cuatro poses de la aplicación. CSS recorta la hoja con `background-size: 200% 200%` y posición superior izquierda. No se muestra la hoja completa, no se sustituye el personaje y no se introduce un ciclo automático.
- **Escritorio:** imagen real conservada en `assets/escritorio.png`, con dimensiones declaradas de 1280 × 800, texto alternativo y pie explicativo. Se carga de forma diferida; es una captura, no un monitor en directo.
- **Privacidad:** documento con fecha, títulos jerarquizados, listas y enlaces de retirada. No contiene formularios de conexión, analítica ni scripts añadidos por LexOpen. Los recursos visuales y tipográficos son locales; los enlaces externos se abren sólo al seguirlos.
- **Movimiento:** desplazamiento suave y transición de fondo del botón de `.2s`; ambos se desactivan cuando se solicita movimiento reducido. No hay animación decorativa adicional.

## Do's and Don'ts

- Conservar la firma transparente, el lector y la celda correcta de Altazor; reutilizar las imágenes aprobadas sin redibujarlas.
- Mantener legibles el destino de la descarga, los enlaces de privacidad y el contacto del Estudio Jurídico Pérez Ibacache.
- Describir permisos de lectura de Drive y repositorios públicos de GitHub sin convertir la visita a estas páginas en una prueba de OAuth, autonomía, descarga de archivos o instalación.
- Preservar las licencias de ambas fuentes y los archivos locales cuando se prepare el paquete de publicación.
- Publicar únicamente el subdirectorio `/lexopen/` autorizado, respaldando lo que se sustituya y conservando el resto del sitio del estudio. La aprobación de la fuente no acredita por sí sola su despliegue.
- No trasladar estas decisiones de portada a los formularios operativos de la aplicación ni modificar tokens globales como efecto lateral de esta documentación.

La revisión de pares `peerread_results_audit` quedó comunicada sin bloqueantes. La evidencia final de portada incluye `/private/tmp/lexopen-publico-desktop.jpg` (1280 × 3252) y `/private/tmp/lexopen-publico-mobile-360-final.jpg` (360 × 3656); se revisaron ambas imágenes existentes, sin generar otra ronda. La página de privacidad fue comunicada como comprobada en escritorio y a 360 px. Esto conserva el cierre de la revisión, sin atribuir una auditoría completa de accesibilidad o de producción a estas capturas.

La captura móvil de página completa puede dejar vacío el espacio de la imagen con carga diferida situada fuera del encuadre inicial. Es una limitación de esa captura; no autoriza eliminar la imagen ni alterar los bytes aprobados. La fuente mantiene la captura, sus dimensiones, el texto alternativo y su pie. La comprobación de publicación en el dominio real es independiente de esta documentación y de la revisión local.
