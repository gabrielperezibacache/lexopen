# Changelog

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
