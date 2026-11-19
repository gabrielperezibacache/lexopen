# Changelog

## 1.1.0

La versión reúne las mejoras preparadas después de preview 10. La disponibilidad de sus instaladores y la aceptación del estudio se siguen en [el registro de producción](docs/ACEPTACION-1.1.0.md).

- El flujo de distribución de 1.1.0 prepara un borrador con los archivos firmados para probar en el estudio. El piloto y la publicación utilizan los mismos archivos.
- El ensayo de restauración del Host comprueba una causa de equipo, el cliente asociado, los bytes del documento, la fecha y responsable del plazo y el acceso de dos usuarios antes y después de recuperar la copia.

- El formulario y la API de alta de causas permiten elegir el acceso desde el primer guardado. En una causa reservada, los profesionales ajenos quedan excluidos antes de incorporar documentos o plazos.
- El respaldo coteja archivos y huellas con el directorio de origen antes de publicarse. Una copia dañada se descarta antes de rotar el respaldo anterior.
- La restauración desde el menú del Host y desde la línea de comandos reubica las rutas administradas cuando los datos se recuperan en otra carpeta.
- La ficha y Altazor distinguen una consulta judicial fallida, una cobertura parcial y una importación CSV. Una importación local conserva los movimientos y la fecha de la última consulta oficial.
- Drive revalida la cuenta compartida, la carpeta de la causa y los permisos al recibir los datos de Google. Si cambian durante la descarga, se detiene la incorporación del documento.
- Altazor conserva las respuestas de ayuda recibidas a tiempo y las aplica al reanudar el encargo tras reiniciar el Host. La recepción por WhatsApp respeta la configuración vigente del estudio.

- Jurisprudencia conserva una copia pública para el lector, la descarga y las citas. Las versiones históricas del PJUD pasan a custodia y disponen de un recorrido de recuperación y cotejo.
- Mi Fiscalía incorpora una ficha individual con rectificación motivada de folio y fecha, historial paginado y comprobantes vinculados a una versión documental.
- Los Ícaros reciben las notas seleccionadas para cada encargo. El chat permite retomar un informe autorizado después de otros turnos y recorrer páginas del historial.
- Plazos distingue la fecha revisada, la estimación interna y la edición candidata del CPC chileno. Su activación depende de una revisión profesional documentada.

- Las esperas de la causa incluyen las tareas bloqueadas y las solicitudes presentadas a Mi Fiscalía aunque haya gestiones anteriores. La ficha y la lectura de Altazor utilizan los mismos datos visibles.
- Documentos distingue el original de su transcripción. La importación manual de OJV comprueba cuaderno y folio y permite recuperar el progreso del lote después de un reinicio del Host.
- Drive organiza los nuevos destinos compartidos por cliente y causa. «Recibir ahora» continúa desde la posición guardada de la carpeta.
- Los encargos de Altazor conservan la revisión editada durante un fallo temporal de conexión. La consulta de respuestas ntfy respeta el modo local. Clientes avisa al salir de la ficha con cambios y Tareas permite corregir el formulario tras un rechazo.
- El ensamblado de Mac comprueba la aplicación extraída tanto del DMG de instalación como del ZIP del actualizador.

- Clientes: la edición y el guardado se habilitan cuando el formulario está activo en el navegador, evitando escribir sobre controles todavía pendientes de hidratación.
- Trabajo sin conexión: el desbloqueo espera la apertura de IndexedDB aunque el navegador restablezca un botón habilitado. Una salida de página cancela la apertura pendiente y borra la clave visible. Un fallo al preparar la caché de navegación se distingue de un fallo del almacenamiento cifrado.

- Guardados concurrentes: los conflictos de serialización confirmados por PostgreSQL esperan de forma progresiva antes de reintentar, conservando el límite de intentos, los permisos vigentes y el recibo atómico. Los errores de resultado incierto y de auditoría no se reintentan automáticamente.
- Regresiones de navegación: las comprobaciones de preparación de causas y del compositor de Inicio distinguen la pantalla visible de las copias ocultas conservadas por el navegador, sin elegir arbitrariamente entre dos controles visibles.

- Chat de Altazor: los nombres de causas largos se ajustan al ancho disponible y conservan visible el botón para quitar contexto en pantallas pequeñas.

- Espacio sin conexión: crear y desbloquear permanecen deshabilitados hasta que termina de abrirse el almacenamiento local, evitando un error falso durante la carga.

- Altazor: encargos persistentes de revisión por causa desde el chat, con confirmación del equipo/modelos y una confirmación posterior de tareas y borradores. Lectura por bloques, Ícaros con su modelo independiente, consolidación con citas literales, cobertura y limitaciones visibles.
- Continuidad del encargo al cerrar la ventana o reiniciar el Host, recuperación de recibos de delegación y guardado parcial sin duplicados. Preguntas vinculadas al encargo mediante la ayuda existente; las respuestas no autorizan escrituras. Cambios de fuentes o destino requieren revisar el plan.
- Los resultados utilizados por mensajes posteriores conservan dependencias verificables mediante contexto v2. Los mensajes anteriores mantienen contexto v1; una versión antigua no puede tratar esas dependencias nuevas como texto validado.

- Continuidad jurídica: selector de cliente con búsqueda y preselección; creación de causas recuperable tras respuestas perdidas, con recibos idempotentes, permisos vigentes y auditoría atómica. Las coincidencias judiciales reservadas no revelan identidades.
- La ficha y el contador de documentos del cliente reúnen archivos directos y de sus causas accesibles, sin duplicados y con paginación. Se rechazan asociaciones explícitas incompatibles entre cliente y causa.
- Extracción local de TXT y Markdown UTF-8 o UTF-16 con BOM, con rechazo de contenido binario y codificaciones inválidas. Prueba funcional de cliente a escrito aprobado, preservando la privacidad de la audiencia y el cierre explícito de tareas y plazos.

- Jerarquía visual más compacta: jornada siempre visible en móvil, estado de causa antes de preparación, descarga directa de documentos y formularios plegables que conservan borradores y abren su destino desde enlaces.
- Vista de próximos plazos compartida con Inicio y la API, con intervalo civil explícito, permisos, responsables y paginación consistentes entre meses. Configuración identifica el ámbito de cada ajuste; el visor del escritorio prioriza el trabajo y sus autorizaciones sobre la preparación de otra sesión.

- Plazos con paginación completa, búsqueda de causas, responsables internos y cumplimiento respaldado por documento versionado y SHA-256 o justificación manual. Historial de cierre y reapertura, control de cambios y reintentos sin duplicados compartidos con minutas, offline y Altazor.

- Evaluadores reproducibles de recuperación jurídica y modelos locales ya instalados, con corpus versionado, informes JSON/Markdown y mediciones ausentes explícitas; sin descargas ni llamadas a proveedores remotos.

- Manuscritos académicos y notas privadas de lectura en el espacio offline cifrado: versiones, revisión invalidada al editar, marcadores comprobados y sincronización que revalida permisos.
- Historias completas mediante paginación en Documentos, Clientes, Espacios, Mensajes, Flujos, Auditoría y Mi Fiscalía; filtros de auditoría sobre todos los eventos y búsqueda de documentos por nombre o causa.
- Respaldo con inventario SHA-256, comprobación antes del reemplazo y tras copiar, rechazo de enlaces y compatibilidad explícita con copias antiguas sin índice.
- Audio pendiente cifrado en el navegador, clave del Host ligada a usuario, causa y mesa, recuperación sin reenvío y memoria separada por cuenta.
- Preparación de firma protegida para etiquetas; una publicación de Mac exige firma válida, Developer ID, notarización y aceptación de Gatekeeper. La configuración de certificados y el piloto real permanecen pendientes.
- Un fallo de consulta de la cola judicial se informa como indisponible en lugar de mostrar una cola vacía confirmada.


- Respaldo: prueba nativa de restauración en directorio limpio, autenticación y lectura del documento restaurado, configuración y comprobación del origen intacto. Reubicación explícita de rutas administradas, recuperación ante fallos y recibos de restauración exigidos al ensamblar una publicación.

- Seguridad: equipos recordados por 30 días tras verificar 2FA, inventario propio, revocación individual o total y comprobación de confianza en el servidor. Contraseña y segundo factor invalidan los equipos; metadatos acotados sin IP ni ubicación y auditoría sin tokens.

- Escritos: asignación y revocación de segundo revisor por versión, lectura limitada al material asignado, permisos independientes de edición, decisiones auditables e idempotentes y nueva asignación tras cambios.

- Altazor: historial de recibos de descargas disponible con el escritorio cerrado o desactivado. Filtros por fecha en Chile, estado y conexión, paginación estable, comprobación de permisos vigente y proyección de metadatos sin contenido, secretos ni rutas locales.

- Actualización automática de causas y Mis Causas a las 08:00 y 22:00, hora de Chile. Reservas persistentes por turno evitan duplicados y reintentos adicionales; los cambios manuales y la importación personal siguen disponibles a cualquier hora. Preferencias y documentación muestran el horario fijo.

- Mi Fiscalía: apartado de solicitudes por causa con acceso oficial mediante ClaveÚnica, preparación, folios y respuestas registrados manualmente, historial, exportación de texto y seguimiento en el estado automático. Permisos por causa, guardado idempotente y control de edición simultánea.
- Plazos: los enlaces desde una causa filtran el listado y mantienen el ámbito al cambiar de mes o vista; permite quitar el filtro y volver al expediente.

- Estado de causas: descarta actualizaciones tardías, comprueba acceso antes de regenerar y convierte solo referencias visibles en enlaces; marca citas desconocidas y limita la lista inicial de tareas en espera.

- Estado automático por causa: plazos abiertos y vencidos, esperas judiciales o de tareas, gestiones actuales y datos por comprobar. Lectura de Altazor con fuentes, actualización de registros y reutilización de análisis iguales durante la visita, respetando permisos y la política de IA.

## 1.1.0-preview.10 — 2026-11-09

- Escritorios nuevos sin caducidad de acceso ni apagado por inactividad; conservar o reanudar el mismo contenedor y conversación con comprobación de permisos.
- Sesiones temporales anteriores: conversión explícita a persistentes, sin el antiguo máximo de dos horas. Migración compatible que conserva sus datos y autorizaciones previas.
- Selección conjunta de conexiones disponibles, estado persistente visible y conservación de la ayuda en segundo plano.
- Autorizaciones de secretos, control manual y presupuestos por tarea mantienen sus límites independientes.
- Validación de conservación de archivos y carpeta personal tras detener/reanudar, identidad del contenedor, historial, permisos y ausencia de reenvío de tareas.

## 1.1.0-preview.9 — 2026-11-09

- Google compartido: una autorización del estudio para Drive, Calendar y Gmail; selección de Organización y preparación de carpetas por cliente, causa, espacio y usuario, con permisos y recuperación de escrituras inciertas.
- Inicio: jornada con vencidos pendientes de todos los meses, próximos siete días y eventos propios. Resumen plegado en móvil para mantener visibles el editor, Adjuntar y Enviar de Altazor.
- Navegación: búsqueda por múltiples términos sin acentos y búsqueda de ajustes que conserva formularios sin guardar.
- Poder Judicial: búsqueda pública civil por términos/ROL y recuperación de fallos íntegros por ID, con control de sesión, procedencia y versiones. OJV informa explícitamente las sesiones vencidas.
- Distribución: archivo generado de tipos alineado con producción y rechazo temprano de un checkout modificado al empaquetar; se conservan las comprobaciones de origen y persistencia de los instaladores.
- Integración: revisión de los PR y ramas históricos, actualizaciones vigentes de CI y dependencias, nuevo README y trazabilidad en `docs/REVISION-INTEGRACION-2026-11-09.md`.

Versión preliminar. La disponibilidad de los instaladores y su firma se consultan en GitHub Releases y `release-manifest.json`.

## Unreleased

### Núcleo fiable y fuentes propias — 2026-11-01
- Integración corregida de roles/equipo y notificaciones: muro ético común también en derivados y avisos, capacidades de escritura, 2FA sin bypass de prefetch, reenrolamiento seguro, tareas atómicas y aprobaciones concurrentes.
- Política `local_only` aplicada antes del transporte; comandos del asistente y planes durables, auditoría transaccional, recibos idempotentes y deshacer con propietario, acceso y estado esperado. Pagos/plazos y asientos manuales conservan su clave al reintentar desde la interfaz.
- Outbox por destino con lease/CAS, digest recuperable y reconciliación explícita de envíos inciertos; procesamiento documental persistido con recuperación y reintentos acotados.
- Primer lector documental propio: **Documentos → Ver fuentes**, versiones por hash, fragmentos, búsqueda, original y verificación literal de citas. Las páginas PDF y las siguientes fases siguen pendientes.
- Archivo de duplicados PJUD antes del dedupe histórico; saldos autorizados sin aportes ocultos, compatibilidad de IDs visuales en HTTP LAN y benchmark limitado a fixtures desechables.
- El acceso espera a estar interactivo antes de aceptar credenciales; método POST explícito evita su envío nativo por URL durante la carga inicial.
- Detalle, migraciones, validación y límites: `docs/IMPLEMENTACION-2026-11-01.md`.

### 1.1 (en curso) — Equipo y permisos
- **Roles de estudio**: presets `socio`, `procurador`, `contabilidad`, `externo` además de `admin` / `abogado` / `asistente` / `cliente`. `admin` (Host) ≠ `socio` (negocio); grants/revokes CSV por usuario.
- **`can(user, capacidad, scope?)`** en `lib/auth/permissions.ts`; `rbac.ts` pasa a wrappers.
- **Equipo por causa** (`CausaMiembro`) + `Causa.acceso` (`estudio` | `equipo`) con muro ético; `causaAccessWhere` en listados/búsqueda/ficha.
- **Delegaciones** y **aprobaciones** genéricas (`/api/delegaciones`, `/api/aprobaciones`).
- **Pendientes unificados**: `Task` espeja `Tramite` / `MinutaAccion`; bandeja `/tareas` con filtros por origen y vencimiento.
- **2FA obligatorio** para `admin` / `socio` / `contabilidad` cuando `FirmSettings.require2faPrivileged` (default true).

### Nuevo
- **Notificaciones 1.1**: outbox Postgres (`MensajeSaliente`), cola `Job`, preferencias/quiet hours, canales SMTP + Gmail + Telegram (long-poll) + Web Push; WhatsApp solo interfaz (`docs/NOTIFICACIONES.md`).
- Hitos de plazo fatal (T-7…T-0) con acuse e escalamiento sin ack; UI `/cuenta/notificaciones` y panel admin.
- PWA básica: `manifest.ts`, service worker y suscripción push (VAPID).

## 1.1.0-preview.7

- **Novedades.** Reúne documentos de carga manual, correo, Drive y OJV. Conserva el origen de cada ingreso y distingue las revisiones de Drive.
- **Altazor.** Admite pegar documentos en el chat, revisar solicitudes del escritorio, preparar un resumen privado y conectar Dropbox para lectura.
- **Configuración.** Centraliza ajustes y muestra Comunicaciones al elegir Chile o habilitar las herramientas del PJUD.
- **Feedback y avisos.** Permite seguir comentarios del equipo y leer los avisos recientes desde la campana. El acuse de avisos críticos sigue siendo una acción separada.

## 1.0.0 — 2026-10-30

Primera versión estable del Host local LexOpen para práctica chilena.

### Nuevo
- **Inicio** (`/inicio`): asistente operativo con intent engine, tools tipados, confirmación humana y undo (`docs/ASISTENTE.md`).
- **Panel** (`/dashboard`): KPIs del estudio (sin redirect HTTP a Inicio).
- Modelo **Evento** + calendario mes/semana/agenda con drag-and-drop; Google Calendar push/pull/ICS.
- Design system 1.0: tokens, tema claro/oscuro, `src/components/ui/*`, shell agrupado, ⌘K, ConfirmDialog.
- Endurecimiento producción: demos `*_ALLOW_DEMO` hard-fail (salvo `LEXOPEN_KEEP_*_DEMO`), Redis rate-limit opcional, CSP/`x-request-id`, logs JSON, health privilegiado, `?limit=` en listas, índices hot-path.
- `FirmSettings.assistantLlmMode` y `auditLlmPrompts`.
- Guías: `docs/UPGRADE-1.0.md`, `docs/ASISTENTE.md`, `docs/PLAN-1.0.md`, `docs/PLAN-CORRECCION-MEJORA.md`.

### Mejoras
- i18n ES/EN en hubs principales (facturación hub + screen pass Fase 2).
- CI: `prisma migrate diff` tras `migrate deploy`.
- Desktop opcional alineado a versión `1.0.0` (camino soportado = Host web).

### Límites (sin sorpresas)
- Facturación interna ≠ DTE/SII; portal ≠ expediente RO completo; PJUD opt-in; sin multi-Host/HA.
- Auditoría best-effort residual en wiki, blog, copiloto y webhook (mutaciones del asistente usan `writeAuditStrict`).

### Upgrade
Desde `0.1.9`: respaldo → `npm ci` → `prisma migrate deploy` → `prod:check`. Ver `docs/UPGRADE-1.0.md`.

## 0.1.9 — 2026-08-17

Iteración IA definitiva: i18n, acciones conectadas y refactor del copiloto.

### Nuevo
- Acciones IA en UI: `causa.extraer`, `minuta.borrador`, `factura.glosa`, `mensaje.borrador`, `wiki.borrador`
- Refactor copiloto: `useAgenteCopilot`, `AgenteCopilotView`, `types` y `SourceChip`

### Mejoras
- i18n ES/EN en paneles IA (`AiAssist`, chat cliente, documentos, trámites, agente)
- Glosa factura: copiar o guardar como nota interna

### Correcciones
- Actualización in-app: `db:migrate` usa `DATABASE_URL` del data dir; P1001 no aborta el update (Postgres embebido se detiene con el Host)

## 0.1.8 — 2026-08-17

Corte IA definitivo: multi-turno cliente, acciones conectadas en UI, auditoría y correcciones copiloto.

### Nuevo
- Brief IA en `/jurisprudencia` (`JurisprudenciaBrief`)
- Resumen procesal y sugerencia de plazos con IA en ficha de causa
- Helper `buildChatHistoryForLlm` compartido entre el copiloto y el chat de cliente

### Mejoras
- Chat carpeta cliente: replay de historial multi-turno al LLM
- Demo IA contextual (título causa, materia, consulta)
- Auditoría best-effort en `/api/ai/actions` y chat cliente
- Trámites sugeridos: fechas límite con días hábiles (`calcularVencimiento`)

### Correcciones
- Agente: eliminado `!res.ok` huérfano tras migración a `apiMutation`

## 0.1.7 — 2026-08-17

Corte de repaso: ops schedulers, docs migrate, auditoría estricta, i18n dashboard y buzón PJUD `/correo`.

### Nuevo
- Buzón PJUD por usuario: demo/IMAP, pegado manual, parser RIT/resolución/tablas, apply/link con ACL de causa
- Cron `MAIL_SYNC_INTERVAL_MINUTES` + entrada en `prod:check`

### Mejoras
- `UF_SYNC_INTERVAL_MINUTES` en `prod:check` y `.env.example`
- Documentación `db push` vs `migrate deploy`
- `writeAuditStrict` en wiki, blog, isheets, webhook PJUD, self-update, minutas del copiloto
- i18n dashboard, loading, error e integraciones
- Agente: envío al copiloto mediante `apiMutation`

## 0.1.6 — 2026-08-17

Corte de endurecimiento Host sobre `0.1.5`: CSRF restante, auditoría de expediente y Drive stub fail-closed.

### Correcciones
- CSRF: mutaciones restantes de Host (password, minutas, trámites, documentos, PJUD writes, config) usan `apiMutation`; login/setup/recovery siguen en la ruta especial
- Drive: acciones stub (`push-documento` / Calendar / crear carpeta) responden 4xx en producción; el badge de causa ya no parece una carpeta real
- UI: errores de mutación consistentes vía `apiMutation` (sin depender solo de `CsrfFetchPatch`)

### Mejoras
- `writeAuditStrict` en clientes, documentos, plazos, minutas, trámites, movimientos, sync PJUD Mis Causas/monitoreo
- Tests: contrato `apiMutation`/CSRF, audit strict vs swallow, e2e conflictos y mensajes portal

### Distribución
- Solo git clone + `npm run web:host` (sin instaladores desktop). Tras actualizar: `prisma migrate deploy` si hay migraciones pendientes.

## 0.1.5 — 2026-08-16

Corte de calidad y endurecimiento Host sobre la mejora progresiva de `0.1.4`.

### Correcciones
- CSRF: mutaciones de sites, billing y CRM usan `apiMutation` (doble submit en Host con `LEXOPEN_RELAX_CSRF=0`)
- Wiki: restore aplica la revisión sin mezclarse con el body de edición; create genera revisión inicial; índice `WikiPageRevision.pageId`
- Blog: `@@unique([siteId, slug])`, conflicto 409, PATCH para editar/despublicar
- Lint: 0 warnings (PJUD unused imports)

### Mejoras
- UI historial/restaurar wiki
- Auditoría best-effort en wiki, blog e iSheet rows
- Docs Host: 2FA real en `/cuenta`; copy de flujos/jurisprudencia
- Tests: contrato wiki/blog, e2e TOTP enroll/login/disable, smoke wiki historial

### Distribución
- Solo git clone + `npm run web:host` (sin instaladores desktop). Tras actualizar: `prisma migrate deploy`.

## 0.1.4 — previa

Mejora progresiva: ACL portal, auditoría estricta sensible, conflictos, TOTP, capa Chile (feriados/UF/jurisprudencia/calendario), colaboración HighQ (iSheets, comentarios, wiki revisiones API, triggers, blog), portal/FTS/mensajes, export facturación CSV/XML.
