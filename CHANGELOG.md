# Changelog

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
