# LexOpen — Plan de corrección y mejora (post-auditoría 1.0)

| Campo | Valor |
| --- | --- |
| Fecha | 2026-10-30 |
| Repo | `gabrielperezibacache/lexopen` |
| Versión en árbol | `0.1.9` (tag `1.0.0` = Fase 4, pendiente OK Gabriel) |
| Base auditada | `main` @ `b565ea9` (+ merges #156–#198) |
| Stack 1.0 | PR [#151](https://github.com/gabrielperezibacache/lexopen/pull/151) ← PR [#154](https://github.com/gabrielperezibacache/lexopen/pull/154) |
| Plan origen | [`PLAN-1.0.md`](./PLAN-1.0.md) |
| Preferencias | store `preferences.md` (no merge/ready sin OK) |

---

## 1. Resumen ejecutivo

LexOpen hacia 1.0 **ya tiene el producto de Fases 1–3 en ramas**, no en `main`.
`main` avanzó ~45 commits (Bolt/Palette/Sentinel + higiene #156) mientras #151
quedó **CONFLICTING**. Esta auditoría:

1. **Rebaseó** `cursor/lexopen-1.0` (#151) sobre `main` actual.
2. **Restackeó** `cursor/phase3-prod-hardening-ba41` (#154) con cherry-pick de
   los 7 commits propios de Fase 3.
3. **Corrigió** contradicciones seguras: scratch `.jules`, docs `/inicio` vs
   dashboard, CONTRIBUTING, CHANGELOG/PLAN, merges de calendario (Bolt O(N) +
   Evento), facturación (KPIs Chile + i18n), ConfirmDialog + loading states.
4. **No** marca PRs ready ni mergea — hold Oct 1 sigue vigente.

**Historia coherente a 1.0:** mergear #151 → main, luego #154 (o squash-stack),
después Fase 4 (bump `1.0.0`) con OK explícito. PR #195 (Solvecha captcha) es
paralelo a `main` y no bloquea el stack 1.0, pero conviene mergearlo **antes**
o **después** del stack (no en medio sin re-test PJUD).

---

## 2. Mapa PR / ramas (2026-10-30)

| PR | Rama | Base | Estado | Mergeable | CI (último conocido) | Rol |
| --- | --- | --- | --- | --- | --- | --- |
| [#151](https://github.com/gabrielperezibacache/lexopen/pull/151) | `cursor/lexopen-1.0` | `main` | **DRAFT** | era CONFLICTING → **rebased** | build OK en head previo `fc78a68` | Fase 1 + 2 |
| [#154](https://github.com/gabrielperezibacache/lexopen/pull/154) | `cursor/phase3-prod-hardening-ba41` | `cursor/lexopen-1.0` | **DRAFT** | era CLEAN → **restacked** | build OK | Fase 3 |
| [#195](https://github.com/gabrielperezibacache/lexopen/pull/195) | `add-solvecha-provider` | `main` | OPEN | ? | — | Captcha PJUD (fuera del stack 1.0) |

**Main desde hold (muestra):** #156 higiene `.jules`, #157–#198 Palette a11y/
loading, Sentinel timing-safe (`proxy`, cron, scraper), Bolt perf (calendario
hash maps, `_count`, CausaDetail concurrent queries, facturación KPIs vía
`loadBillingOverview`).

**Commits propios Fase 3 (sobre #151 rebased):**

1. `feat(seguridad): hard-fail demos…` + migración índices
2. `feat(datos): ?limit=`
3. `feat(observabilidad): logs JSON, health, global-error`
4. `feat(perf,calidad,ci): Suspense Inicio + tests + migrate diff`
5. `docs: Fase 3…`
6. `fix(test): plan-store async`
7. `fix(prisma): drift check`

---

## 3. Contradicciones

### 3.1 Corregidas en esta pasada (ramas 1.0 / Phase 3)

| Tema | Antes | Después |
| --- | --- | --- |
| `.jules` / `.Jules` | #151 reintroducía `.jules/palette.md`; main #156 las borró | Eliminado del árbol; `.gitignore` + CONTRIBUTING «no recrear» |
| README demo | «Abrir el dashboard» como paso 2 | `/inicio` asistente; Panel = `/dashboard` |
| CHANGELOG | «`.jules` canónico»; Fase 1 «en curso» | Scratch eliminado; Fase 1 completa post-rebase |
| PLAN-1.0 | Colisión de carpetas abierta | Cerrada; puntero a este plan |
| Calendario | Bolt O(N) en main vs Evento/semana DnD en 1.0 | Maps O(N) **con** `ev` + `CalendarioBoard` |
| Facturación hub | KPIs `loadBillingOverview` (main) vs i18n raw Prisma (1.0) | Overview + `billingHub` i18n |
| Causa ficha | Concurrent queries Bolt vs i18n back labels | Ambos |
| ConfirmDialog | `window.confirm`/loading Palette vs ConfirmDialog Fase 2 | ConfirmDialog + loading granular |
| `package.json` `test` | Listas divergentes | Unión sin duplicados (assistant + billing-overview + phase3) |
| Stack dirty | #151 CONFLICTING vs main | Rebased; #154 restacked |

### 3.2 Remanentes (documentar / Fase 4 o follow-ups)

| ID | Tema | Detalle | Prioridad | Esfuerzo | Riesgo |
| --- | --- | --- | --- | --- | --- |
| R1 | Redirect literal `/dashboard`→`/inicio` | PLAN §6 dice redirect; código mantiene **ambas** rutas (Inicio + Panel). No es bug si es intencional — **aclarar en Fase 4** copy PLAN/README. | P2 | S | Bajo |
| R2 | Versión `0.1.9` vs narrativa 1.0 | package/badge README aún 0.1.9 en todas las ramas (correcto hasta Fase 4). | P3 | S | Bajo (Fase 4) |
| R3 | `/agente` vs `/inicio` | Dos superficies IA: Hermes copiloto vs intent-engine. Docs deben nombrar roles (consola vs turno). README ya mejorado; WEB-HOST aún sesgado a Hermes. | P2 | S | Bajo |
| R4 | i18n residual | Sub-hubs `/facturacion/*`, altas PJUD, algunos strings ES hardcode; `WikiHistoryPanel` aún `confirm()`. | P2 | M | Bajo |
| R5 | Electron tokens | `desktop/renderer/setup.css` ≠ `globals.css` exacto. | P3 | S | Bajo |
| R6 | Auditoría best-effort | wiki/blog/Hermes/webhook PJUD no `writeAuditStrict` (decisión §5bis). | P3 | — | Aceptado |
| R7 | Portal modelo | members + `isClientVisible` + tag cliente ≠ RO estricto. | P3 | — | Aceptado |
| R8 | E2E suite completa | `inicio-assistant` OK históricamente; suite legacy no re-corrida post-rebase. **Re-correr CI** tras push. | P1 | M | Medio |
| R9 | PR #195 Solvecha | Puede tocar captcha PJUD solapado con stack; coordinar orden de merge. | P2 | S | Medio si paralelo |
| R10 | LCP Inicio | Presupuesto <2.5s anotado; sin Lighthouse en CI. | P3 | S | Bajo |
| R11 | Cobertura assistant ≥80% | Tests ampliados; sin c8 gate. | P3 | S | Bajo |
| R12 | Purga retención | Notas en WEB-HOST; sin job de purge auditoría/notif. | P3 | M | Bajo |

---

## 4. Plan por área de producto

Leyenda esfuerzo: **S** / **M** / **L**. Prioridad: **P0** (bloquea 1.0) ·
**P1** (antes de tag) · **P2** (deuda 1.0.x) · **P3** (backlog).

### 4.1 Inicio / asistente operativo

| | |
| --- | --- |
| **Estado** | Completo en #151: `/inicio`, `src/lib/assistant/*`, SSE confirm/undo, tools Zod, FirmSettings `assistantLlmMode` / `auditLlmPrompts`, e2e `inicio-assistant`. Fase 3: RSC + Suspense streaming. |
| **Contradicciones** | R1, R3; main sin `/inicio`. |
| **Fixes** | (P1) CI verde post-rebase; (P2) copy WEB-HOST «Inicio vs Agente»; (P3) medir LCP. |
| **Estimación / riesgo** | P1 = S–M / medio (regresiones e2e login paths). |

### 4.2 UI / design system

| | |
| --- | --- |
| **Estado** | Fase 2 completa: tokens, dark mode, `src/components/ui/*`, shell agrupado, ⌘K, ConfirmDialog. Main aportó Palette loading/a11y mergeado. |
| **Contradicciones** | R4, R5; `.jules` cerrado. |
| **Fixes** | (P2) i18n sub-hubs facturación/PJUD; WikiHistory ConfirmDialog; (P3) alinear tokens Electron. |
| **Estimación / riesgo** | M / bajo (scope creep rediseño — evitar). |

### 4.3 Seguridad / producción

| | |
| --- | --- |
| **Estado** | Main: Sentinel timingSafeEqual (#159/#167/#197…), X-Powered-By off. #154: hard-fail `*_ALLOW_DEMO` salvo KEEP, Redis rate-limit, CSP + `x-request-id`, `fetchSafeOutbound` UF, `prod:check`. |
| **Contradicciones** | README main aún habla soft-warn demos; #154 alinea hard-fail — **merge #154** cierra el hueco. |
| **Fixes** | (P0) merge stack; (P1) re-verificar `prod:check` + proxy HMAC post-merge; (P2) no forzar audit strict (decisión). |
| **Estimación / riesgo** | S verificación / medio si se pierde fix Sentinel en futuros rebases (ya preservado). |

### 4.4 Datos / schema / migraciones

| | |
| --- | --- |
| **Estado** | `Evento` (`20260930120000`), FirmSettings LLM (`20260930140000`), índices lista (`20260930180000`). Drift fix en #154. |
| **Contradicciones** | Main sin estas migraciones → Host en main no tiene Evento. |
| **Fixes** | (P0) merge con `migrate deploy` (nunca `db push` en data real); (P1) CI `migrate diff` del #154. |
| **Estimación / riesgo** | S ops / medio si alguien aplica push en prod. |

### 4.5 Observabilidad

| | |
| --- | --- |
| **Estado** | #154: `src/lib/log.ts` JSON + ALS, health privileged, `global-error` / `not-found`. |
| **Fixes** | (P2) dashboards externos opcionales; (P3) purga logs/auditoría. |
| **Estimación / riesgo** | S / bajo. |

### 4.6 Performance

| | |
| --- | --- |
| **Estado** | Main Bolt: calendario maps, `_count`, concurrent CausaDetail. #154: `?limit=` 200/500, Suspense Inicio. |
| **Fixes** | (P2) paginación UI consciente de `limit`; (P3) LCP CI. |
| **Estimación / riesgo** | M / bajo. |

### 4.7 Calendario / Evento

| | |
| --- | --- |
| **Estado** | Evento CRUD, mes/semana/agenda, DnD, Google pull/push/ICS, conflictos informativos. |
| **Contradicciones** | Merge Bolt+Evento hecho en rebase. |
| **Fixes** | (P2) conflictos bloqueantes opcionales; (P3) sync bidireccional más agresivo. |
| **Estimación / riesgo** | M / medio (OAuth real). |

### 4.8 PJUD

| | |
| --- | --- |
| **Estado** | Opt-in scrape, Mis Causas, captcha BYOK; main endureció timing scraper. #195 Solvecha pendiente. |
| **Fixes** | (P2) decidir merge #195 vs post-1.0; mantener kill switches; copy ToS. |
| **Estimación / riesgo** | M / alto (ToS/CAPTCHA flaky). |

### 4.9 Billing / facturación

| | |
| --- | --- |
| **Estado** | No DTE; export CSV/XML; hub KPIs + i18n mergeado. |
| **Fixes** | (P2) i18n subrutas; (P3) nunca SII en 1.0. |
| **Estimación / riesgo** | S–M / bajo. |

### 4.10 Portal cliente

| | |
| --- | --- |
| **Estado** | Modelo actual (decisión). Cliente → `/portal`, sin assistant staff. |
| **Fixes** | Ninguno bloqueante; documentar límites en Fase 4. |
| **Estimación / riesgo** | — / aceptado. |

### 4.11 Desktop Electron

| | |
| --- | --- |
| **Estado** | Best-effort; Host web = camino soportado. |
| **Fixes** | (P3) tokens setup; smoke `desktop:test` en CI opcional. |
| **Estimación / riesgo** | S / bajo. |

### 4.12 Tests / CI

| | |
| --- | --- |
| **Estado** | Unit/contract assistant; e2e inicio; #154 migrate diff; e2e-limits. |
| **Fixes** | (P1) CI completo en #151/#154 tras force-push; (P2) suite Playwright legacy; (P3) c8 gate. |
| **Estimación / riesgo** | M / medio (flaky / disco). |

### 4.13 Docs / release (Fase 4)

| | |
| --- | --- |
| **Estado** | PLAN actualizado; README recorrido parcialmente alineado; versión aún 0.1.9. |
| **Fixes** | (P1 tras OK) bump `1.0.0`, CHANGELOG sección, badge, upgrade note `migrate deploy`, checklist `prod:check`, WEB-HOST Inicio/Agente/Redis/demos hard-fail. |
| **Estimación / riesgo** | S–M / bajo (sobre-prometer SII/HighQ/HA). |

---

## 5. Orden de merge recomendado

```text
1. CI verde en #151 (rebased) + #154 (restacked)     [P0]
2. OK Gabriel: marcar ready (ambos o solo #151)        [gate humano]
3. Merge #151 → main
4. Merge #154 → main (o retarget #154→main tras #151)
5. (Opcional) #195 Solvecha — antes o después, no intercalado a ciegas
6. Fase 4 bump 1.0.0 en PR nuevo                       [OK Gabriel]
7. Tag + release notes
```

**No hacer:** marcar ready sin OK; `db push` en Host con datos; recrear `.jules`.

---

## 6. Preguntas abiertas para Gabriel

1. **¿Merge order?** ¿Aprobar stack #151→#154 tal cual, o squash a un solo PR hacia main?
2. **¿Ready-for-review** ahora que el rebase está hecho, o esperar CI + smoke manual Host?
3. **¿Fase 4** inmediata tras merge Phase 3, o pausa piloto en `0.1.9` + features 1.0 sin tag?
4. **¿PR #195 Solvecha** entra en 1.0.0 o en 1.0.1?
5. **¿R1** confirmar: Panel `/dashboard` permanente (sin redirect HTTP) vs redirect a `/inicio`?
6. **¿Hold** sigue hasta revisión humana explícita de este plan?

---

## 7. Evidencia de auditoría (checklist)

- [x] `gh pr list` + view #151/#154/#195
- [x] main vs heads (ahead/behind, migraciones, package 0.1.9)
- [x] Contradicciones nav/docs/schema/jules/i18n/security/PRs
- [x] Rebase #151 + fixes merge (calendario, facturación, ConfirmDialog, package.json)
- [x] Restack #154 (cherry-pick 7 commits)
- [x] Docs hygiene Spanish commits
- [x] Este plan + actualización `PLAN-1.0.md`
- [ ] CI post-push (tras force-push ramas)
- [ ] OK Gabriel ready/merge/Fase 4
