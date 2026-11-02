# LexOpen: núcleo corregido y primeras fuentes propias

Fecha: 1 de noviembre de 2026. Base: `main` 72400f9b9627cdc147ebf7c14a791c063747a686. Rama de implementación: `codex/lexopen-own-core`.

Este incremento integra y corrige los HEAD auditados de los PR [202](https://github.com/gabrielperezibacache/lexopen/pull/202) y [203](https://github.com/gabrielperezibacache/lexopen/pull/203), junto con los bloqueantes de la base. Añade el primer flujo documental propio del [plan](PLAN-DESARROLLO-TRIFOLIA.md). No usa cuentas, API, MCP, índices ni servicios de TRIFOLIA.

## Qué se puede usar

En **Documentos → Ver fuentes**, un miembro autorizado puede preparar una versión del texto extraído, leer sus fragmentos, buscar, abrir el original y comprobar una cita antes de copiarla. Los enlaces identifican la versión y el fragmento; una extracción posterior conserva las citas anteriores, incluso fuera de las últimas cien versiones mostradas. El original y el texto tienen hashes separados. Los localizadores actuales son posiciones exactas del texto, no números de página deducidos.

El flujo funciona con la extracción documental existente y no necesita un modelo de IA. Si el original fue alterado, su descarga como evidencia se bloquea. Si el usuario pierde acceso a la causa o al documento, deja de poder leer los fragmentos, verificar citas y descargar el original.

## Correcciones del núcleo

| Plan | Cambio implementado | Prueba principal |
| --- | --- | --- |
| C00 | Utilidades TOTP fuera de exports de ruta; combinación válida de esquemas, scripts y dependencias; nonce de arranque consistente | Build completo de Next 16.3 con Webpack y TypeScript |
| C01 | Política central antes de cualquier solicitud al modelo; `local_only` rechaza destinos remotos y permite loopback | Turnos reales con transporte interceptado: cero intentos remotos |
| C02 | Herramientas del asistente, pagos, plazos y asientos manuales con transacción, auditoría y recibos; planes durables y recuperación parcial; formularios conservan clave tras respuesta perdida | PostgreSQL con rollback y concurrencia; navegador guardar → perder respuesta → recargar → reintentar |
| C03 | Deshacer exige dueño, permiso actual y estado esperado; consumo y reversión atómicos | Actor ajeno, revocación, edición posterior y consumo concurrente |
| C04/C06 | Muro ético y restricciones de derivados en páginas, API, búsqueda, IA, binarios y avisos; 2FA también en servidor; enrolamiento pendiente cifrado; capacidades de escritura | Matriz negativa con base real, matcher Next y HTTP con CSRF real |
| C05 | Cola OCR persistida, claim con lease/token, latido, recuperación y reintentos acotados; sin cola de buffers | 201 documentos, dos workers, lease vencido, fallo de storage/BD y resultado antiguo rechazado |
| C06 | Bulk atómico, espejos de tareas compartidos y recurrencia concurrente; aprobaciones con expiración y compare-and-set | Ningún efecto parcial, una siguiente ocurrencia, aprobación única |
| C07 | Hito + aviso + outbox atómicos; dedupe por destino; acuse del destinatario autorizado; lease/CAS; digest durable | Varios dispositivos, carreras, más de 200 plazos, caídas antes/después del envío y reintento de resumen |
| C08/C09 | Migraciones aditivas; archivo de movimientos/jobs duplicados antes del dedupe histórico PJUD | SQL real de preservación; upgrade y restauración en bases desechables |
| C10 | Identificadores de interfaz compatibles con HTTP LAN; benchmark exige base de prueba y limita sus propios IDs | Ayudante probado sin `randomUUID` ni `crypto`; guardas del benchmark |

Además, los indicadores y saldos se calculan sobre registros autorizados: el saldo almacenado global no permite inferir operaciones de causas ocultas. Las referencias de un asiento deben pertenecer al mismo cliente y a causas accesibles. Los conflictos reservados mantienen una señal de revisión sin revelar identidades ni cantidades de coincidencias ocultas.

La numeración de facturas se reserva como restricción global interna, independiente de los documentos que el actor pueda ver. Dos altas concurrentes conservan números distintos; un número manual ocupado devuelve conflicto genérico. Factura, horas/gastos, asiento y auditoría se confirman en la misma transacción. Reintentar la eliminación de un evento recupera su recibo sin exigir que la fila borrada todavía exista y conserva las comprobaciones actuales de acceso.

El formulario de acceso espera a estar interactivo antes de habilitar credenciales y envío. Así un clic durante la carga inicial no activa el envío nativo del navegador con credenciales en la URL; el formulario además declara método POST.

Las notificaciones cuyo envío externo pudo ocurrir antes de una caída quedan **inciertas**. El panel administrativo permite confirmar entrega o solicitar reenvío con motivo y auditoría. No se promete entrega exactamente una vez en SMTP/Telegram/push.

## Alcance de F1

Se añaden `DocumentResource`, `DocumentEvidenceVersion` y `DocumentEvidenceFragment`, con vínculos aditivos al esquema existente, versiones por hash, fragmentos literales y API autorizada. El primer flujo habilitado corresponde a `Documento`. El modelo admite el origen `SiteFile`, pero su captura y lector todavía necesitan implementación.

Este incremento aporta base parcial a T03, T13, T18 y T53 de la [matriz de capacidades](auditoria-2026-11-01/MATRIZ-TRIFOLIA.md); no cierra esas filas completas. Todavía faltan páginas PDF verificadas, selección/importación de Drive, recuperación semántica evaluada, corpus jurídicos propios, hechos y cronología, contradicciones, biblioteca, redacción y exportaciones, Word, MCP y cartografía.

## Validación y evidencia

Las comprobaciones usan PostgreSQL 16 local y usuarios/documentos ficticios en bases cuyo nombre incluye `test` o `e2e`. No se aplicaron migraciones ni se consultaron credenciales de una instalación del estudio.

- Suite unitaria completa, lint y TypeScript.
- Integración PostgreSQL: autorización, comandos, pagos/plazos, avisos, cola documental, evidencia y preservación PJUD.
- Navegador Chromium: flujos existentes, fuentes propias y reconciliación de avisos; escritorio 1366 × 900 y móvil 360 × 800 en los flujos nuevos.
- Ensayo HTTP con servidor compilado de producción: login, 2FA con prefetch, CSRF, idempotencia, referencias financieras privadas y evidencia.
- Upgrade desde el esquema de `main` y respaldo/restauración de bases y archivos ficticios.

Los resultados y su alcance exacto se conservan en [el registro de validación](implementacion-2026-11-01/VALIDACION.md). Un ensayo local de producción no equivale a desplegar el Host del estudio.

## Actualización de una instalación

1. Detener el Host y sus workers. Conservar una copia verificable de base, archivos y configuración antes de migrar.
2. Instalar dependencias, ejecutar `prisma migrate deploy` y compilar con la versión de Next instalada. No usar `db push` para sustituir estas migraciones.
3. Revisar `PjudMigrationArchive`, estado de colas y envíos inciertos. La migración preserva duplicados que todavía existan antes del dedupe; no recupera filas que una instalación ya haya eliminado con la migración histórica 201. Esas filas requieren un respaldo anterior.
4. Comprobar acceso de un miembro y de un excluido, 2FA, procesamiento documental y una cita conservada antes de habilitar uso real.

## Decisiones y límites pendientes

- Completar una tarea recurrente no ofrece deshacer: revertir solo la tarea original dejaría una siguiente ocurrencia incoherente.
- Hilos antiguos sin procedencia verificable requieren un hilo nuevo para seguir consultando; no se borra el historial.
- La cola documental limita cada worker y recupera trabajos persistidos; no constituye una prueba de carga en el hardware final del Host.
- Proveedores externos reales (OJV/ClaveÚnica, Google, SMTP/Telegram/push, S3 y modelos) necesitan comprobación con configuración autorizada. Estas pruebas no efectuaron envíos externos.
- El build conserva una advertencia previa de empaquetado de `createRequire` en `pjud/public-scrape.ts`; no se verificó el scraper OJV en vivo.
- Los seguimientos P2 de rendimiento medido/EXPLAIN, paginación y mapping de Google Calendar y versionado de decisiones de workflows de la auditoría continúan en el backlog. No se atribuyen mejoras de velocidad sin medición.
- TLS, cifrado de disco, distribución entre dispositivos y restauración con los scripts físicos del Host requieren ensayo en la instalación objetivo. La restauración aquí usa PostgreSQL y archivos temporales.

El siguiente incremento debe completar F1: captura de archivos de espacios, localización PDF por página y selección/importación identificada. Después, F2 puede construir investigación jurídica sobre esta misma evidencia y política de acceso.
