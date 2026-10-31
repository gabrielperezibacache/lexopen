# QA funcional LexOpen 1.0 — foco OJV / causas

| Campo | Valor |
| --- | --- |
| Fecha | 2026-10-31 |
| Base | `main` @ `24e9e49` (`v1.0.0`) |
| PR fixes | `cursor/qa-ojv-funcional-eb19` |
| Merges previos | #151 `be287bd` · #154 `a572304` · #199 `24e9e49` + tag `v1.0.0` |
| #195 Solvecha | **No** mergeado (después de 1.0.0) |

## Matriz por módulo

| Módulo | Resultado | Evidencia / notas |
| --- | --- | --- |
| Login / auth / CSRF | **PASS** (con fixes) | Preview PJUD y conflict-check ahora vía `apiMutation` |
| Inicio / assistant | **PASS** (código+tests previos) | Suite assistant unit; e2e `inicio-assistant` en árbol |
| Causas list/ficha | **PASS** parcial | Concurrent queries + i18n OK; PATCH sin validación RIT duplicada = residual |
| **OJV sync / monitoreo** | **FIXED** | Ver hallazgos abajo |
| Mis Causas / ClaveÚnica | **FIXED** parcial | Encola terminadas si `causaIds`; claim TOCTOU residual |
| Plazos | **PASS** (tests chile/plazos) | Sin regresión tocada |
| Calendario / Evento | **PASS** (código 1.0) | Sin cambios en esta PR |
| Documentos | **PASS** parcial | Import button GET sin CSRF (solo lectura) OK |
| Minutas / tareas / CRM | **PASS** (smoke code) | No se hallaron bugs bloqueantes en revisión |
| Portal | **PASS** (modelo decidido) | Sin staff assistant |
| Correo PJUD | **PASS** (unit mail/*) | |
| Facturación | **PASS** (hub i18n+KPIs) | Sub-hubs ES residual |
| Jurisprudencia / sites | **PASS** (smoke) | |
| Config / agente | **PASS** | FirmSettings LLM + Hermes consola |
| Desktop | **PASS** best-effort | Versión 1.0.0 |

## Hallazgos OJV (prioridad)

| ID | Severidad | Estado | Fix |
| --- | --- | --- | --- |
| B1 | Alta | **Fixed** | Sync OK ya no fuerza `pjudMonitoreoActivo: true` |
| B2 | Alta | **Fixed** | `requeueFailedJobs` marca failed → `dismissed` |
| B5 | Alta | **Fixed** | `dueSyncWhere({causaIds})` sin filtro `estado: activa` |
| B7 | Alta | **Fixed** | Scrape falla si tribunal/RIT no match (no «Todos»/1ª fila) |
| B8 | Media | **Fixed** | Clear avisos → status `cleared` |
| B12 | Baja | **Fixed** | Mis Causas enqueue `trigger: manual` |
| CSRF preview | Alta | **Fixed** | QuickAdd + CSV preview + conflict-check |
| Sync cartera UI | Media | **Fixed** | Botón pasa `causaIds` monitoreados |
| B3 unique movimientos | Media | **Open** | Falta `@@unique([causaId, externalId])` |
| B4 race enqueue | Media | **Open** | Unique parcial jobs activos |
| B6 Mis Causas TOCTOU | Media | **Open** | Claim atómico |
| B9 status sync CU | Baja | **Mitigado** | Sync reporta `null` si env ausente (async sigue siendo fuente) |
| B11 case-sensitive dedupe | Baja | **Open** | Usar `duplicateCausaWhere` en lookup/CU |

## Tests corridos

- Unit PJUD: ojv-dom, queue, causa-origin, provider, scrape-claveunica, parse-html, captcha, ops-log, seguimiento, sync-clear-status — **OK**
- Lint ESLint archivos tocados — **OK**
- Live ClaveÚnica / OJV — **no** (sin credenciales); fail-closed verificado por código + tests de flags

## Riesgos residuales

1. Sin unique en movimientos, sync concurrente aún puede duplicar filas (B3).
2. Race al encolar dos pending para la misma causa (B4).
3. CAPTCHA/OJV live flaky — depende de terceros y ToS.
4. #195 Solvecha pendiente post-1.0.0.

## Screenshots

Carpeta: `/cursor/stores/bc-5bcaee03-4eed-44f7-b437-056ada5fb388/media/qa-ojv/` — sin capturas live OJV (falta ClaveÚnica). Recomendado: smoke Host local con demo/`PJUD_ALLOW_DEMO` en no-prod.
