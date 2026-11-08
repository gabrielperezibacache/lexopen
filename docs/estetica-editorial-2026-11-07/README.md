# Refinamiento editorial · 7 de noviembre de 2026

Se mantienen la paleta índigo, plata e iris y las familias Barlow Condensed, Sora y Fraunces. Las cabeceras compartidas incorporan filetes editoriales; las tablas distinguen el nombre principal de sus metadatos; los paneles recuperan la sombra ambiental existente. Los vacíos compartidos presentan un folio junto al mensaje. Facturación organiza balance y movimientos como un libro contable; Configuración coloca el contexto de cada categoría al margen en escritorio.

## Antes y después

| Apartado | Antes | Resultado |
| --- | --- | --- |
| Clientes | [Escritorio](antes-clientes.png) | [Escritorio](clientes-light-desktop.png) |
| Facturación | [Escritorio](antes-facturacion.png) | [Escritorio](facturacion-light-desktop.png), [móvil oscuro](facturacion-dark-mobile.png) |
| Configuración | [Escritorio](antes-configuracion.png) | [Escritorio](configuracion-light-desktop.png), [móvil oscuro](configuracion-dark-mobile.png) |
| Estado vacío | — | [Folio, explicación y acción](vacio-light-desktop.png) |

## Verificación

- TypeScript sin errores y ESLint de los componentes y la prueba modificados sin incidencias; `git diff --check` correcto.
- `next build --webpack` completado. Conserva una advertencia en `src/lib/pjud/public-scrape.ts` sobre el análisis de `module.createRequire`, fuera de los cambios de interfaz.
- Las siete pruebas existentes de `settings-categories.spec.ts` y `ui-refinement.spec.ts` pasan. Comprueban anclas, atrás/adelante, conservación de campos, tablas móviles, diálogos, foco, Escape y movimiento reducido. Se actualizó la expectativa antigua de la categoría Conexiones e IA: abre Cuentas conectadas y después se elige IA.
- Detector de diseño sin hallazgos en los archivos de interfaz cambiados. Se reutilizan los tamaños tipográficos documentados.
- La confirmación de la compilación de producción cubre once apartados a 1440 × 1000 y 360 × 900, en claro y oscuro: 44 vistas con HTTP 200, sin errores de JavaScript ni desbordamiento horizontal. El estado vacío se comprueba adicionalmente en las cuatro combinaciones. Resultados en [comprobación visual](comprobacion-visual.json) y [vacíos](comprobacion-vacios.json).

Las capturas proceden de una instalación local con una base PostgreSQL desechable y los datos ficticios del seed. No se usaron expedientes, documentos ni cuentas externas reales. La compilación local y estas comprobaciones no acreditan publicación ni una auditoría integral de accesibilidad. El [manifiesto](manifest.json) conserva las huellas de las capturas; el sistema construido se documenta en [DESIGN.md](../../DESIGN.md).
