# Validación: hechos, cronología, contradicciones y biblioteca

Fecha: 1 de noviembre de 2026. [Descripción del incremento](../HECHOS-CRONOLOGIA-BIBLIOTECA-2026-11-01.md). Pruebas con usuarios, causas, colecciones y documentos ficticios en PostgreSQL y almacenamiento local separados del estudio. Las comprobaciones de esta entrega utilizan fuentes ya preparadas; no envían el expediente a un modelo.

## Resultados conservados

| Comprobación | Resultado y alcance | Registro |
| --- | --- | --- |
| Suite unitaria completa | PASS, salida 0; PDF estricto con render/OCR local, fuentes, extracción de hechos y JSON acotado | [Unidades](logs/units.log) |
| TypeScript final | PASS, salida 0; no emitió diagnósticos | [Tipos](logs/types.log) |
| Lint final | PASS, salida 0 | [Lint](logs/lint.log) |
| Compilación de producción | PASS, salida 0; Next 16.3 con Turbopack | [Compilación](logs/build.log) |
| Diferencia de esquema Prisma final | PASS, salida 0; sin diferencias entre esquema y base migrada | [Esquema](logs/schema-drift.log) |
| Migraciones en base de producción ficticia nueva | PASS, salida 0; 35 migraciones aplicadas | [Migraciones](logs/production-migrations.log) |
| Integración PostgreSQL completa | PASS, salida 0; suites previas y nuevas de fuentes, hechos, contradicciones y biblioteca | [Integración completa](logs/integration.log) |
| Citas canónicas en PostgreSQL | PASS, salida 0 confirmada por el ejecutor del agente; original, texto completo, Unicode, páginas, caché acotada y ACL actual | [Citas](logs/citations-postgresql.log) |
| Conocimiento del expediente en PostgreSQL | PASS, salida 0 confirmada por el ejecutor del agente; cursor, A→B→A, revisiones, historial, contradicciones, permisos y rollback | [Hechos y contradicciones](logs/case-postgresql.log) |
| Biblioteca en PostgreSQL | PASS, salida 0 confirmada por el ejecutor del agente; dedupe concurrente, versiones exactas, verificación de cada resultado, selección, notas, permisos y rollback | [Biblioteca](logs/library-postgresql.log) |
| Confirmación dirigida final de caso en navegador | PASS, salida 0 confirmada por el ejecutor del agente; 1 prueba, 9,6 s; 10,2 s totales | [Navegador: caso](logs/case-browser.log) |
| Biblioteca en navegador | PASS, salida 0 confirmada por el ejecutor del agente; 1 prueba, 8,2 s; 8,7 s totales; anterior al refuerzo final de verificación del servidor | [Navegador: biblioteca](logs/library-browser.log) |
| Actualización 34→35 y restauración lógica | PASS, salida 0; conservación de 81 tablas antiguas y restauración exacta de 89 tablas, 723 filas y 27 objetos | [Actualización y restauración](logs/upgrade-restore.log) |
| Restauración leída con proceso nuevo y código de dominio final | PASS, proceso y ejecutor con salida 0; permisos, CAS, fuentes y ausencia de escrituras | [Lectura final](logs/restored-current-core.log), [descriptor](logs/restored-current-core.json) |
| Servidor compilado con controles normales | PASS, salida 0; CSRF real, seis peticiones HTTP por partes rechazadas con 413, PDF/OCR, historial, versiones elegidas y revocación | [Producción](logs/production.log) |
| Suite completa final del navegador | PASS, salida 0; **34 pruebas aprobadas**, 1,4 minutos, sin fallos ni reintentos, base nueva y código final | [Navegador completo](logs/browser-full.log) |
| CI remoto de esta rama | Pendiente al registrar esta evidencia local; comprobar los checks del PR antes de integrar | [Rama de entrega](https://github.com/gabrielperezibacache/lexopen/tree/codex/case-knowledge-library); no se acredita mediante las pruebas locales |

Los estados de salida se transcriben de resultados confirmados del ejecutor. TypeScript y lint se repitieron después de la corrección final de la consulta del fixture, ambos con salida 0. Un archivo vacío o la ausencia de mensajes de error no demuestra una salida correcta. Los fallos sintéticos de auditoría son inyecciones explícitas para comprobar que se revierten las escrituras; el conflicto de una revisión antigua también es un resultado esperado.

El [manifiesto de logs](logs/manifest.json) conserva SHA-256 de cada origen y copia normalizada, tamaño y fecha. Sólo se retiraron códigos de color, rutas locales y espacios finales, y se normalizaron finales de línea. Los originales se mantienen intactos en el directorio temporal del ensayo.

## Revisión independiente y correcciones

La revisión de servidor encontró tres problemas: indicadores de búsqueda que podían depender de texto ya inaccesible, clasificación de capturas heredadas como actuales sin comparar su fecha y lectura de algunas peticiones JSON sin límite del flujo recibido. Se corrigieron antes de cerrar la entrega. El revisor confirmó los tres cambios por inspección de código; la integración completa incluye sus regresiones. La prueba de producción comprobó seis peticiones HTTP reales por partes, sin longitud declarada: verificación de cita, alta y edición de colección, alta y retirada de entrada y borrado de colección rechazaron 413 al exceder el límite recibido.

La revisión visual encontró dos problemas funcionales: el historial ocultaba estados cuando también había texto y el formulario de contradicción podía conservar una decisión antigua después de recibir una revisión nueva. Se corrigieron mostrando antes/después de forma explícita y reiniciando el formulario por identificador y revisión. El escenario final de caso comprueba ambos; el revisor confirmó los dos hallazgos resueltos. El detector de interfaz se ejecutó una sola vez y devolvió [una lista vacía](logs/design-scan.json). No equivale a una auditoría general de accesibilidad.

## Aplicación compilada

El servidor se ejecutó con `NODE_ENV=production`, controles CSRF normales y sin modos E2E ni relajación de CSRF, sobre una base desechable nueva y almacenamiento local explícito. La prueba verificó fuentes de texto y PDF/OCR con página física 2, fechas ambiguas, revisión humana y conflicto por revisión antigua, contradicción con dos citas, biblioteca e investigación sin modelo ni red. Una versión fijada siguió recuperando el original elegido pese a existir otra más reciente; A→B→A mantuvo la afirmación y revisión del profesional.

Las seis peticiones enviadas por partes rechazaron cuerpos excesivos con 413. Una escritura sin CSRF devolvió 403; el portal recibió 403. Retirar una entrada impidió recuperar el historial que dependía de ella. Revocar la causa impidió acceder a conocimiento, hecho, contradicción, colección, investigación y página de evidencia, todos con 404. La prueba eliminó sus filas y archivos ficticios al terminar y el servidor se apagó después del ensayo. No fue un despliegue del Host del estudio.

Se conservan dos intentos anteriores sin presentarlos como aprobados. El [primero](logs/production-attempt1.log) recibió «No autenticado»: faltaba la URL canónica HTTP de la instalación local y se emitían cookies seguras que ese ensayo no podía reenviar por HTTP. Se fijó `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3231`, sin modificar la autenticación de la aplicación. El [segundo](logs/production-attempt2.log) usó sólo `pago` para un pasaje que contenía `pagaron`: la búsqueda actual es literal y el resultado esperado no estaba presente. Se corrigió la consulta del fixture a `contrato pago`, sin cambiar el buscador ni retirar aserciones de integridad. La ejecución final aprobada se conserva por separado.

## Actualización y restauración

El origen ficticio de 34 migraciones se mantuvo en modo de sólo lectura: 81 tablas, 663 filas y 18 objetos. Un destino nuevo recibió su copia y la migración 35. Todos los campos y hashes de las tablas anteriores permanecieron iguales; sólo se añadió la fila de migración y ocho tablas nuevas. Los 35 checksums de migración coincidieron con el repositorio.

El destino incluyó cuatro hechos, dos revisados, dos revisiones humanas, una contradicción aparente y su revisión, tres registros de análisis, una biblioteca con tres versiones fijadas y notas, y una investigación que conservaba una versión antigua pese a existir otra nueva. El respaldo y archivos se restauraron en una segunda base nueva. La comparación exacta conservó **89 tablas, 723 filas y 27 objetos**.

La comprobación posterior importó los cuatro módulos de dominio del árbol final desde un proceso nuevo y registró sus hashes. Conservó las afirmaciones, estados, fechas, motivos, revisiones, citas, contradicción, ámbito de colección, notas, selección de investigación y página física 2. Ocho accesos de un tercero devolvieron 404 y cuatro operaciones con revisión antigua devolvieron 409. Los hashes de todas las tablas y objetos siguieron iguales antes y después; las lecturas no alteraron la restauración ni realizaron consultas remotas.

Se conserva también una incidencia del adaptador temporal de comprobación: el primer intento de lectura final confundió el formato de una cita de investigación con el de una cita canónica almacenada. Se corrigió el adaptador del ensayo para resolver el pasaje y comparar sus campos; no se cambió código de la aplicación ni datos almacenados por ese error. El registro final identifica el intento y el resultado aprobado.

Este ensayo es una restauración lógica de PostgreSQL y archivos locales con servicios de dominio. No verifica un reinicio HTTP compilado sobre la base restaurada, copia física del Host, vault, configuración, S3, OAuth real ni datos de producción.

## Capturas

Las [15 capturas](capturas/manifest.json) incluyen ocho vistas finales de hechos, cronología, contradicciones e historial; seis de biblioteca, versión fijada e investigación; y la página física 2 recuperada después de restaurar. Las vistas se probaron con Chromium de escritorio de 1366×900 y emulación móvil de 360×800, sin desbordamiento horizontal observado. No representan dispositivos físicos. Las seis capturas de biblioteca preceden al último refuerzo del verificador del servidor; la suite completa final aprobada comprueba el árbol de entrega con sus refuerzos de servidor.

- [Hechos](capturas/knowledge-facts-desktop.png) y [hechos móvil](capturas/knowledge-facts-mobile.png).
- [Cronología](capturas/knowledge-chronology-desktop.png) y [cronología móvil](capturas/knowledge-chronology-mobile.png).
- [Contradicciones](capturas/knowledge-conflicts-desktop.png) y [contradicciones móvil](capturas/knowledge-conflicts-mobile.png).
- [Historial](capturas/knowledge-history-desktop.png) y [historial móvil](capturas/knowledge-history-mobile.png).
- [Guardar fuente](capturas/library-source-pin-desktop.png), [versión conservada](capturas/library-pinned-version-desktop.png) e [investigación](capturas/library-research-desktop.png).
- [Página física recuperada](capturas/restored-physical-page2.png).

La huella de todos los archivos de código, configuración, esquema, migración y pruebas de este incremento se conserva en [CODIGO.sha256](CODIGO.sha256). Se verifica desde la raíz con `shasum -a 256 -c docs/conocimiento-2026-11-01/CODIGO.sha256`. Excluye esta documentación y el archivo generado `next-env.d.ts`.

## Límites de aceptación

La extracción propone pasajes y la investigación recupera citas literales. No se midió calidad jurídica sobre cien preguntas, exhaustividad del expediente, vigencia normativa ni paridad funcional completa. Las decisiones humanas, fechas inferidas y cobertura acotada siguen visibles. Las bibliotecas son personales; no se ensayó colaboración compartida ni ejecución de notas como instrucciones. No hubo despliegue en una instalación de trabajo del estudio.
