# Validación: páginas PDF e investigación propia

Fecha: 1 de noviembre de 2026. [Descripción del incremento](../PDF-INVESTIGACION-2026-11-01.md). Pruebas con PostgreSQL 16, Next 16.3 y Prisma 5.22; datos ficticios y almacenamiento temporal separados de una instalación real.

## Resultados conservados

| Comprobación | Resultado y alcance | Registro |
| --- | --- | --- |
| Suite unitaria completa | PASS, salida 0; incluye páginas físicas, OCR/render locales, fuentes oficiales y recuperación textual | [Unidades](logs/units.log) |
| Integración completa PostgreSQL | PASS, salida 0; autorización, comandos, avisos, procesamiento, evidencia, migraciones e investigación | [Integración](logs/integration.log) |
| Lint final | PASS, salida 0, sin errores | [Lint](logs/lint-release.log) |
| TypeScript final | PASS, salida 0, sin diagnósticos | [Tipos](logs/types-release.log) |
| Compilación final de producción | PASS, salida 0, Webpack; validación de tipos y rutas incluida | [Compilación](logs/build-release.log) |
| Navegador completo | PASS, salida 0, **30 pruebas**, 4,3 minutos; anterior al pequeño ajuste final de los flujos nuevos | [Suite completa](logs/browser-all.log) |
| Revisión de los flujos nuevos | PASS, salida 0, **2 pruebas**, 35,2 segundos, después del ajuste final: investigación y páginas PDF | [Revisión posterior](logs/browser-reviewed.log) |
| Servidor compilado en producción | PASS, salida 0; CSRF real, PDF/OCR/PNG, citas, procedencia manual, alcance restaurado, revocación y portal | [Producción](logs/production.log) |
| Actualización y restauración reales | PASS; esquema 30→31, conservación de registros, páginas, originales, citas e historial | [Bitácora](logs/upgrade-restore.log) |
| Fuente pública real | Documento individual de Dirección del Trabajo recuperado, identificado y conservado con hashes; no prueba de cobertura de todo el organismo | [Consulta real](logs/source-live.log) |
| Contratos de fuentes y PDF | PASS; límites, cancelación, destinos oficiales, versiones, herramientas locales y hashes | [Fuentes](logs/source-contracts.log), [PDF/OCR](logs/pdf-native-ocr.log) |

Los estados de salida se transcriben de los resultados devueltos por el ejecutor. Un log vacío o sin mensajes de error **no demuestra por sí solo** una salida correcta; el archivo de TypeScript está vacío porque la ejecución aprobada no emitió diagnósticos. [El manifiesto](logs/manifest.json) conserva nombres de origen, fechas y hashes antes/después de normalizar.

Se normalizaron colores, rutas del equipo, finales de línea y espacios finales. Los originales temporales no se modificaron. Los errores deliberados de auditoría y concurrencia en integración prueban rollback y recuperación: la cadena termina aprobada.

La suite de 30 casos concluyó a las 19:54 UTC; los dos escenarios nuevos se repitieron después, a las 19:56 UTC. Lint, tipos, build y producción finales también se conservaron. **No se atribuye una segunda ejecución completa de los 30 casos al pequeño ajuste posterior. Este registro no acredita CI remoto.**

## Actualización y recuperación

El origen ficticio anterior tenía 30 migraciones, 75 tablas, 601 filas y 10 objetos de almacenamiento. Se usó en modo de solo lectura. Una base nueva recibió su dump y la migración 31: todos los campos históricos conservaron sus hashes; las páginas y localizadores nuevos tuvieron sus valores iniciales correctos, y no hubo diferencias de esquema.

Se añadió únicamente en el destino una fixture de PDF con tres páginas físicas —nativa, escaneada con OCR y vacía—, una fuente jurídica manual y una investigación. El segundo dump y la copia de archivos se restauraron en otra base nueva: **80 tablas, 619 filas y 13 objetos** conservaron sus hashes. Los servicios leyeron la página 2, verificaron originales, fragmentos, offsets, citas, procedencia y alcance; otro usuario fue denegado. El PNG coincidió antes/después y se inspeccionó visualmente. El origen quedó intacto.

Método empleado: comprobar ausencia del destino → `pg_dump` de solo lectura → crear una base desechable → `pg_restore --single-transaction` → `prisma migrate deploy` y comparación de campos históricos → fixture propia → segundo dump/restauración y copia local → comparación de hashes y lecturas autorizadas. Los scripts temporales dependían de las carpetas de este ensayo y no se presentan como herramientas portables de restauración.

## Capturas

| Flujo | Escritorio | Móvil |
| --- | --- | --- |
| Página PDF | [Ver](capturas/pdf-pages-desktop.png) | [Ver](capturas/pdf-pages-mobile.png) |
| Investigación y resultados | [Ver](capturas/research-desktop.png) | [Ver](capturas/research-mobile.png) |
| Consulta y alcance | [Ver](capturas/research-consulta-desktop.png) | [Ver](capturas/research-consulta-mobile.png) |
| Fuente por URL | [Ver](capturas/research-fuentes-url-desktop.png) | [Ver](capturas/research-fuentes-url-mobile.png) |
| Aporte manual | [Ver](capturas/research-fuentes-manual-desktop.png) | [Ver](capturas/research-fuentes-manual-mobile.png) |
| Versión anterior | [Ver](capturas/research-version-anterior-desktop.png) | [Ver](capturas/research-version-anterior-mobile.png) |

La huella de los 42 archivos de implementación y configuración seleccionados está en [CODIGO.sha256](CODIGO.sha256); puede comprobarse desde la raíz del repositorio con `shasum -a 256 -c docs/pdf-investigacion-2026-11-01/CODIGO.sha256`. La fixture PDF se marca como binaria en Git; la migración conserva exactamente los bytes ensayados, incluido su salto final adicional.

## Límites

- La investigación actual recupera extractos del corpus incorporado y de documentos autorizados; no genera conclusiones jurídicas ni usa un modelo o red durante la búsqueda local.
- La consulta real de Dirección del Trabajo no acredita jurisprudencia, doctrina, cobertura completa ni vigencia. El acceso BCN/LeyChile encontró un bloqueo 401 y se comunica como indisponible; un aporte manual se identifica como tal. Ver [viabilidad de fuentes](../VIABILIDAD-FUENTES-JURIDICAS.md).
- OCR y render se comprobaron con las herramientas locales y la fixture descrita. El texto OCR requiere revisión frente al original; no se certifican documentos complejos ni el hardware final del Host.
- La restauración cubre PostgreSQL lógico y archivos locales, con lecturas de servicios. No acredita recuperación física del Host, vault/configuración, S3 ni arranque web contra la base restaurada.
- Las vistas móviles son Chromium emulado, no dispositivos físicos. Las capturas contienen fixtures.
- El smoke productivo usa una instancia compilada aislada y datos ficticios. No hubo despliegue ni migración de datos del estudio; al cerrar el ensayo quedaron detenidos los servicios temporales.
