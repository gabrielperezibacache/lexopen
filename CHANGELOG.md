# Changelog

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
