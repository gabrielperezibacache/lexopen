# Validación: espacios, Drive y fuentes oficiales

Fecha: 1 de noviembre de 2026. [Descripción del incremento](../ESPACIOS-DRIVE-FUENTES-2026-11-01.md). PostgreSQL 16, Prisma 5.22 y Next 16.3. Pruebas de aplicación con usuarios, expedientes y archivos ficticios en bases y almacenamiento aislados. Los documentos oficiales públicos indicados se obtuvieron en vivo.

## Resultados conservados

| Comprobación | Resultado y alcance | Registro |
| --- | --- | --- |
| Suite unitaria completa | PASS, salida 0; incluye fuentes oficiales, páginas y búsquedas | [Unidades](logs/units.log) |
| Lint final | PASS, salida 0 | [Lint](logs/lint.log) |
| TypeScript final | PASS, salida 0; sin diagnósticos | [Tipos](logs/types.log) |
| Compilación de producción | PASS, salida 0 | [Compilación](logs/build.log) |
| Importación Drive en PostgreSQL | PASS, salida 0; selección, paginación, revisiones, permisos actuales, exportación, integridad, concurrencia y rollback | [Drive](logs/drive-import-integration.log) |
| Evidencia SiteFile en PostgreSQL | PASS, salida 0; originales, páginas, citas, ACL, fuente modificada, revisiones A→B→A, investigación y eliminación | [Espacios](logs/site-evidence-integration.log) |
| Fuentes oficiales con transporte nativo | Cinco respuestas públicas conservadas: BCN actual e histórica, SII Renta en URL moderna y legacy, y SII IVA | [Cinco respuestas](logs/sources-native-live.jsonl) |
| Servidor compilado con controles de producción | PASS, salida 0; CSRF, PDF/OCR, citas, historial, permisos y SiteFile; además tres importaciones oficiales reales por la API | [Producción y fuentes reales](logs/production-live-official.log) |
| Integración PostgreSQL completa final | PASS, salida 0; autorización, comandos, avisos, procesamiento, evidencia, Drive, migraciones e investigación | [Integración completa](logs/integration.log) |
| Primera ejecución completa de navegador | FAIL, salida 1; 31 casos aprobados y uno fallido en investigación jurídica | [Primera ejecución](logs/browser-first.log) |
| Reproducción aislada de investigación | PASS, salida 0; escenario legal-research, 21,4 s y 24,2 s totales del ejecutor | [Confirmación aislada](logs/browser-research-isolated.log) |
| Segunda ejecución completa con Webpack | INTERRUMPIDA, salida 130; 24 aprobados, tres fallidos, uno interrumpido y cuatro sin ejecutar; no constituye aceptación de la suite | [Ejecución interrumpida](logs/browser-interrupted.log) |
| Ejecución de entrega con Turbopack | PASS, salida 0; **32 pruebas aprobadas**, 1,2 minutos, base desechable nueva y límite de heap explícito | [Navegador de entrega](logs/browser-release.log) |
| Actualización 31→34 y restauración final | PASS, salida 0; registros anteriores preservados y lecturas de originales, páginas, citas y alcance después de restaurar | [Actualización y restauración](logs/upgrade-restore.log) |

Los estados de salida se transcriben de los resultados devueltos por el ejecutor y confirmados por el agente principal. Un log vacío o sin mensajes de error no demuestra por sí solo una salida correcta. El archivo de TypeScript no contiene texto porque la ejecución aprobada no emitió diagnósticos. El [manifiesto](logs/manifest.json) conserva nombre de origen, fecha de modificación y SHA-256 de cada original y copia normalizada.

Se retiraron colores, rutas del equipo y espacios finales; se normalizaron codificación y finales de línea. Los originales permanecen intactos. Los fallos sintéticos de auditoría y los conflictos de concurrencia que aparecen en los logs prueban reversión y recuperación; no son errores ignorados de la aplicación.

La primera ejecución completa de navegador terminó con 31 pruebas aprobadas y una fallida. El escenario `legal-research` recibió una respuesta HTML 500 cuando esperaba JSON durante una consulta de abstención. La repetición aislada se aprobó. Este registro conserva el fallo y no atribuye una causa al primer 500; el reintento aprobado no borra ese resultado.

Una segunda ejecución completa con Webpack degradó las esperas de las pantallas de correo y avisos, cuyos tres escenarios se registraron como fallidos. Durante ese intento, el ejecutor observó el proceso `next dev` con RSS de 7.775.408 KiB y CPU de 440,5 %. Se detuvo el servidor y se canceló la suite con interrupción, salida 130; quedaron 24 casos aprobados, uno interrumpido y cuatro sin ejecutar. La [observación de recursos](logs/server-resource-observation.log) no demuestra la causa del primer 500 ni equivale a una ejecución completa aprobada.

La ejecución de entrega partió de otra base desechable, usó Turbopack —el valor por defecto del servidor E2E en CI— y fijó 4 GiB de heap. Terminó con **32 pruebas aprobadas y salida 0**. No se modificó código, aserciones ni tiempos de espera de las pruebas para obtener aceptación. Este resultado se conserva por separado y no borra los intentos anteriores.

## Fuentes oficiales en vivo

El ensayo nativo conservó cinco respuestas, no cinco organismos. Corresponden a dos organismos y dos formatos de adquisición BCN, más dos rutas equivalentes del mismo oficio SII y otro oficio de IVA. La URL moderna y legacy del oficio SII N.º 2151 contienen el mismo texto y distintos bytes HTML; ambas se canonicalizan a la identidad moderna.

La prueba contra el servidor compilado importó realmente por `/api/research/sources` la norma BCN 242302 actual, su versión histórica de 2005-09-22 y el oficio SII N.º 2151. Comprobó los originales descargados desde LexOpen y conservó sus hashes. El parser histórico diferencia la fecha solicitada y las alertas de la fuente. El éxito de acceso no certifica vigencia ni cobertura completa. Los endpoints, la solución de acceso y sus límites están en [la ampliación de fuentes oficiales](../FUENTES-OFICIALES-AMPLIACION.md).

La importación oficial es una petición explícita de una URL pública elegida. Las preguntas y documentos del expediente no se envían al organismo. La consulta posterior usa el corpus local sin modelo ni búsqueda de red.

## Drive: alcance real de la prueba

La integración usa PostgreSQL y almacenamiento reales, pero sustituye las respuestas de Google por fixtures explícitas. Comprueba selección de revisión, carpeta y pertenencia, descarga permitida, checksum, bytes, límites, original estable, exportación PDF, carrera de importaciones, revocación y rollback de auditoría. Los reintentos recuperan el mismo documento de la misma revisión. No se buscó una cuenta ni se usó OAuth real.

El navegador también usa una API fixture para mostrar la lista y la confirmación de importación; las denegaciones HTTP del portal se comprueban contra el servidor real. El flujo pide una copia individual y distingue exportación de documento Google y descarga de original. `drive.file` limita la lista a los archivos visibles para la aplicación en la carpeta vinculada; no acredita acceso a todos los archivos de una cuenta, sincronización global o Google Picker.

## Actualización y restauración

El origen ficticio anterior tenía 31 migraciones completas, 80 tablas, 619 filas y 13 objetos de almacenamiento. Se usó en modo de solo lectura. Una base nueva recibió el respaldo y las tres migraciones aditivas hasta el esquema 34. Todos los campos y hashes de las tablas anteriores se preservaron; solo se añadieron las filas de migración correspondientes, con cero diferencias de esquema. Los checksums de las 34 migraciones terminadas coincidieron con los archivos del repositorio.

En el destino se añadió una importación Drive con transporte sintético, archivos de espacio con revisiones 4→5→6 y secuencia de contenido A→B→A, cuatro snapshots de evidencia con 12 páginas físicas y una investigación con selección documental explícita. Un segundo respaldo y copia de archivos se restauró en otro destino nuevo: **81 tablas, 663 filas y 18 objetos** conservaron sus valores y hashes exactos.

Los servicios comprobaron procedencia Drive, bytes originales, identidad de cada revisión, PNG de las páginas, citas literales, vínculos y alcance guardado, con denegación a un usuario ajeno. La revisión final A se mantuvo como fuente actual; recuperar el mismo contenido de una revisión anterior no sustituyó su identidad. La comprobación de lectura registró cero solicitudes prohibidas de red. El origen quedó intacto y las lecturas no cambiaron el destino restaurado.

Método: verificar que los destinos no existen → dump lógico de solo lectura → crear base desechable nueva y restaurar → aplicar migraciones y comparar filas/campos históricos → crear fixture propia → respaldar/restaurar nuevamente y copiar archivos → comparar hashes y ejecutar lecturas autorizadas. Los scripts temporales dependen de las carpetas de este ensayo y no se presentan como utilidades portables de recuperación del Host.

## Capturas

| Flujo | Escritorio | Móvil |
| --- | --- | --- |
| Página física del archivo de espacio | [Ver](capturas/space-pdf-desktop.png) | [Ver](capturas/space-pdf-mobile.png) |
| Revisión anterior conservada | [Ver](capturas/space-version-anterior-desktop.png) | [Ver](capturas/space-version-anterior-mobile.png) |
| Investigación con archivos del espacio | [Ver](capturas/space-research-desktop.png) | [Ver](capturas/space-research-mobile.png) |
| Selección y confirmación de copia Drive | [Ver](capturas/drive-selection-desktop.png) | [Ver](capturas/drive-selection-mobile.png) |

Las imágenes contienen fixtures y se conservaron sin modificaciones. Proceden de los escenarios de espacios y Drive aprobados en la primera ejecución. La revisión visual del batch quedó aprobada y no se abrió otra ronda de cambios de interfaz; la aceptación de la suite completa se informa por separado. El [manifiesto de capturas](capturas/manifest.json) identifica sus bytes y hashes. La selección Drive usa respuestas de API ficticias, como declara el nombre del escenario; no representa una cuenta OAuth real.

La huella del código seleccionado se conserva en [CODIGO.sha256](CODIGO.sha256), verificable desde la raíz del repositorio con `shasum -a 256 -c docs/espacios-drive-fuentes-2026-11-01/CODIGO.sha256`.

## Límites

- La investigación recupera extractos literales; no acredita una conclusión jurídica ni vigencia comprobada.
- OCR y render requieren herramientas locales y contraste visual del texto OCR con el original.
- La restauración lógica de PostgreSQL y archivos locales no sustituye el ensayo físico del Host, configuración/vault, S3 ni recuperación en hardware final.
- Las vistas móviles corresponden a Chromium emulado, no a dispositivos físicos.
- Las pruebas no migraron ni desplegaron una instalación de trabajo del estudio. Este registro no acredita CI remoto.
