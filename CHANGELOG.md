# Changelog

## Unreleased

### Nuevo
- **Notificaciones 1.1**: outbox Postgres (`MensajeSaliente`), cola `Job`, preferencias/quiet hours, canales SMTP + Gmail + Telegram (long-poll) + Web Push; WhatsApp solo interfaz (`docs/NOTIFICACIONES.md`).
- Hitos de plazo fatal (T-7…T-0) con acuse e escalamiento sin ack; UI `/cuenta/notificaciones` y panel admin.
- PWA básica: `manifest.ts`, service worker y suscripción push (VAPID).

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
- Auditoría best-effort residual en wiki/blog/Hermes/webhook (mutaciones del asistente usan `writeAuditStrict`).

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
- Helper `buildChatHistoryForLlm` compartido Hermes / chat cliente

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
- `writeAuditStrict` en wiki, blog, isheets, webhook PJUD, self-update, Hermes minuta
- i18n dashboard, loading, error e integraciones
- Agente: POST Hermes vía `apiMutation`

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
