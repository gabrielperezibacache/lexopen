# Changelog

## 0.1.9 — 2026-08-17

Iteración IA definitiva: i18n, acciones conectadas y refactor del copiloto.

### Nuevo
- Acciones IA en UI: `causa.extraer`, `minuta.borrador`, `factura.glosa`, `mensaje.borrador`, `wiki.borrador`
- Refactor copiloto: `useAgenteCopilot`, `AgenteCopilotView`, `types` y `SourceChip`

### Mejoras
- i18n ES/EN en paneles IA (`AiAssist`, chat cliente, documentos, trámites, agente)
- Glosa factura: copiar o guardar como nota interna

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
