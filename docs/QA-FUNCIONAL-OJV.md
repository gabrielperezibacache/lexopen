# QA funcional LexOpen 1.0 — foco OJV / causas

| Campo | Valor |
| --- | --- |
| Fecha | 2026-10-31 |
| Base | `main` @ `0d965fe` (`v1.0.0` + #200) |
| PR residuals B3/B4/B6 | `cursor/qa-ojv-b3-b4-b6-eb19` |
| Merges previos | #151 `be287bd` · #154 `a572304` · #199 `24e9e49` + tag `v1.0.0` · #200 OJV QA |
| #195 Solvecha | **No** mergeado (después de 1.0.0) |

## Matriz por módulo

| Módulo | Resultado | Evidencia / notas |
| --- | --- | --- |
| Login / auth / CSRF | **PASS** | Preview PJUD + conflict-check vía `apiMutation` (#200) |
| Inicio / assistant | **PASS** | Suite assistant unit |
| Causas list/ficha | **PASS** parcial | PATCH RIT duplicada = residual menor |
| **OJV sync / monitoreo** | **FIXED** | B1–B8 + B3/B4 |
| Mis Causas / ClaveÚnica | **FIXED** | B5/B6/B12 claim atómico |
| Plazos / calendario / portal / correo / facturación / sites | **PASS** | Sin regresión en residuals |
| Config / agente / desktop | **PASS** | |

## Hallazgos OJV (prioridad)

| ID | Severidad | Estado | Fix |
| --- | --- | --- | --- |
| B1 | Alta | **Fixed** | Sync OK no fuerza `pjudMonitoreoActivo: true` |
| B2 | Alta | **Fixed** | `requeueFailedJobs` → `dismissed` |
| B3 unique movimientos | Media | **Fixed** | `@@unique([causaId, externalId])` + migrate dedupe |
| B4 race enqueue | Media | **Fixed** | Unique parcial active jobs + create con P2002 |
| B5 | Alta | **Fixed** | `dueSyncWhere({causaIds})` sin `estado: activa` |
| B6 Mis Causas TOCTOU | Media | **Fixed** | `updateMany` CAS (`misCausasClaimableWhere`) |
| B7 | Alta | **Fixed** | Scrape falla si tribunal/RIT no match |
| B8 | Media | **Fixed** | Clear → `cleared` |
| B12 | Baja | **Fixed** | trigger manual |
| CSRF / sync cartera UI | Alta/Media | **Fixed** | #200 |
| B9 status sync CU | Baja | **Mitigado** | |
| B11 case-sensitive dedupe | Baja | **Open** | Usar `duplicateCausaWhere` en lookup/CU |

## Tests

- Unit: mis-causas-claim, queue-unique, movimientos-unique + suite PJUD previa
- Migración: `20261031010000_pjud_b3_b4_uniques`

## Riesgos residuales

1. CAPTCHA/OJV live flaky (terceros / ToS).
2. B11 case-sensitive dedupe al alta ROL.
3. #195 Solvecha pendiente post-1.0.0.
