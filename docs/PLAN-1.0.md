# LexOpen 1.0 — Plan (Fase 0 · diagnóstico)

| Campo | Valor |
| --- | --- |
| Versión base | `0.1.9` («piloto endurecido») |
| Fecha diagnóstico | 2026-09-30 |
| Alcance de este documento | Diagnóstico (Fase 0) + plan priorizado; Fase 1 = brief completo aprobado. |
| Rama | `cursor/lexopen-1.0` |
| Fuentes | `README.md`, `docs/WEB-HOST.md`, `docs/AUDITORIA-2026-09-06.md`, `docs/PJUD.md`, `docs/DESKTOP.md`, `prisma/schema.prisma`, `src/**`, `.jules/` vs `.Jules/` |

> LexOpen es Next.js **16** (convenciones distintas al Next «clásico»). Antes de
> implementar UI/rutas en Fase 1–2, revisar `node_modules/next/dist/docs/` en el
> entorno de desarrollo (AGENTS.md). En este diagnóstico el paquete `next` no
> estaba instalado en el snapshot; la advertencia se conserva como requisito
> de implementación, no como hallazgo de producto.

---

## 1. Resumen ejecutivo

LexOpen `0.1.9` ya es un **Host local usable** para práctica chilena: causas,
CRM, sites tipo HighQ, plazos, documentos con OCR local, minutas, facturación
interna (sin DTE), correo PJUD, monitoreo PJUD opt-in, copiloto Hermes/LLM y
shell Electron opcional. La capa de seguridad del Host (CSRF, boot fail-closed,
auditoría estricta en mutaciones sensibles, 2FA TOTP, ACL portal) está
**avanzada para un piloto**, no «lista sin checklist».

Los mayores gaps hacia un **1.0** no son «inventar módulos desde cero», sino:

1. **Inicio como asistente operativo** — el dashboard es un hub de métricas;
   el copiloto vive en `/agente` con pipeline maduro que **debe reutilizarse**,
   no reescribirse.
2. **Coherencia de UI / design system** — tokens y shell existen; pantallas
   heredadas (p. ej. facturación hardcodeada ES) y deuda visual (AUDITORIA
   tema 2/4) quedan.
3. **Endurecimiento de producción declarado** — rate-limit en archivo vs Redis
   multi-instancia, flags demo, portal no estricto, privilegio abogado-cliente
   incompleto, sin HA multi-Host, facturación ≠ SII.
4. **Docs / release** — alinear README, WEB-HOST, CHANGELOG y checklist
   `prod:check` con lo que realmente se promete en 1.0.

**Colisión de carpetas:** coexisten `.jules/palette.md` y `.Jules/palette.md`
(inodos distintos en Linux; en macOS/Windows case-insensitive chocan). Contenido
divergente (ARIA vs loading states). Debe unificarse antes de que un clone en
FS case-insensitive pierda uno de los dos.

---

## 2. Mapa de módulos (estado)

Leyenda de estado: **completo** (usable en piloto con tests/contratos útiles) ·
**parcial** (núcleo OK, gaps visibles) · **stub** (UI o camino demo/fail-closed) ·
**roto** (no arranca / contratos rotos — no observado en árbol actual de `main`).

| Módulo | Estado | Rutas / piezas clave | Deuda técnica | Bugs / inconsistencias visibles | Tests |
| --- | --- | --- | --- | --- | --- |
| **Causas** | parcial → completo en núcleo | `/causas`, ficha, nueva/editar, tabs (`lib/causas/section-tabs`), Mis Causas, monitoreo | Ficha densa; sync PJUD acoplado a UI | Menú Causas ya unificado (e2e); legado de ramas divergentes CRM/PJUD | Unit tabs; e2e sección; smoke rutas |
| **Clientes / CRM** | parcial | `/clientes`, ficha, trámites, chat IA carpeta | Lista `take: 100`; chat acotado a carpeta | i18n mejor que facturación; sin e2e dedicado de CRUD | Contratos trámites; e2e ACL portal toca clientes de paso |
| **Plazos** | completo (ayuda operativa) | `/plazos`, `lib/plazos.ts`, cron alertas | No es cómputo oficial de tribunal (documentado) | Fechas locales corregidas en auditoría | Unit + integración alertas |
| **Calendario** | parcial → completo en núcleo Fase 1 | `/calendario` mes/semana/agenda + Evento DnD; Google push/pull/ICS | Conflictos API informativos | Pull requiere OAuth real | Unit week + calendar-pull map; e2e indirecto |
| **Documentos** | parcial → completo en ingest | `/documentos`, cola OCR, ingest carpeta, Drive push | OCR depende de binarios Host; cola local | Badge Drive stub en prod fail-closed | Unit ingest/processing/OCR |
| **Minutas** | completo (núcleo) | Wizard, plantillas, approve-to-minuta desde Hermes | Drive upload exige carpeta real | Copy stub claro en UI | Contract API + render |
| **Tareas** | parcial | `/tareas` + tareas por site | Página global delgada vs panel site | UX desigual entre hub y site | Smoke; sin e2e flujo crear |
| **Facturación** | parcial | Hub + horas/gastos/facturas/tarifas/UF/CC; export CSV/XML | **No DTE/SII**; strings ES hardcode en hub; ledger optimizado | Inconsistente con i18n del resto | Unit billing/export; smoke subrutas |
| **Correo (PJUD)** | parcial | `/correo` + `MailboxPanel`, IMAP/demo, apply/link | Conector externo opcional; parser RIT | e2e: no inventa demo sin flags | Suite `lib/mail/*` + e2e correo |
| **PJUD** | parcial (opt-in) | Monitoreo, Mis Causas, ClaveÚnica, cola, sidecar, scrape | Scraping ToS/riesgo; kill switches; CAPTCHA BYOK | Sin API oficial; demo flag | Amplia suite `lib/pjud/*` + e2e tabs |
| **Jurisprudencia** | parcial / demo-corpus | `/jurisprudencia`, ingest admin, Brief IA | Corpus seed ≠ fuente oficial | Búsqueda ILIKE; sin sync externo | Smoke; ingest audit |
| **Sites / workspaces** | parcial → completo HighQ-lite | Matters/VDR/wiki/blog/iSheets/Q&A/workflows | Complejidad UX; ACL site+portal | Historial wiki restaurado (0.1.5+) | Contract wiki/blog; e2e sites |
| **Portal cliente** | parcial | `/portal` + sites `isClientVisible` | **No** expediente completo ni RO estricto | Mensajes/Q&A limitados (e2e) | e2e auth/access + mensajes |
| **Agente / IA** | parcial → fuerte en backend | `/agente`, `/api/integrations/hermes`, `/api/ai/actions`, `lib/ai/*` | Aprobación humana; demo fail-closed prod | Inicio **no** embebe el asistente | Unit AI + e2e document scope |
| **Desktop Electron** | parcial / opcional | `desktop/*`, Host/Cliente | Instaladores retirados; path = git clone | macOS unstyled historial en ramas viejas | `desktop:test` |
| **Host local** | completo (camino recomendado) | `web:host`, backup/restore, self-update, `prod:check` | Postgres embebido; bind loopback default | Rate-limit archivo; multi-instancia → Redis | Scripts + host-runtime tests |

Ningún módulo del mapa aparece **roto** en el código actual de `main` tras la
auditoría de 2026-09-06 y los cortes 0.1.5–0.1.9; el riesgo residual está en
**configuración de Host** y en **integraciones externas** (PJUD/Google/LLM).

---

## 3. Bloqueadores de producción (ya declarados)

Fuente primaria: README «Seguridad y límites actuales» + checklist
`docs/WEB-HOST.md` + `src/lib/security/production-env.ts` + `npm run prod:check`.

### Hard fail al boot (`NODE_ENV=production`)

| Flag / condición | Efecto |
| --- | --- |
| `LEXOPEN_OPEN_ACCESS=1` | Bypass auth — **prohibido** |
| `LEXOPEN_RELAX_CSRF=1` | Relaja CSRF (CI) — **prohibido**; ignorado en asserts de API en prod |
| `LEXOPEN_ALLOW_PLAINTEXT_PASSWORDS=1` | Contraseñas en claro — **prohibido** |
| `LEXOPEN_DEMO_SWITCHER=1` | Impersonación/demo switcher — **prohibido** |
| `SESSION_SECRET` débil / ausente | Boot falla (`assertProductionSessionSecret`) |

`web:host` fuerza demos a `0` y apaga flags prohibidas aunque el shell las
traiga en `1` (salvo `LEXOPEN_KEEP_*_DEMO=1` para demos).

### Soft-warn (deben quedar en `0` en Host real)

- `HERMES_ALLOW_DEMO`, `LLM_ALLOW_DEMO`, `PJUD_ALLOW_DEMO`
- `HERMES_ALLOW_PRIVATE_URL`, `LLM_ALLOW_PRIVATE_URL`
- URLs privadas Obsidian/PJUD scraper: normales en loopback; revisar si el
  servicio se publica fuera de la máquina

### Operativos / arquitectura

1. **Rate limit login:** store local `$LEXOPEN_DATA_DIR/rate-limit.json`. Un
   solo proceso Host es el caso normal. Multi-instancia → `REDIS_URL` /
   `RATE_LIMIT_REDIS_URL` o Upstash REST (`redis-rate-limit.ts`).
2. **Schema:** Host usa `prisma migrate deploy`; nunca `db push` / `setup` /
   `db:reset` / `db:seed` sobre data dir con datos reales.
3. **Portal cliente:** members + `isClientVisible` + tag `cliente` en archivos;
   no es RO absoluto ni expediente completo.
4. **Auditoría:** `writeAuditStrict` en mutaciones sensibles; wiki/blog/iSheet,
   Hermes y webhook PJUD siguen best-effort en parte del camino.
5. **Facturación:** documentos internos ≠ DTE SII; export CSV/XML a facturador
   externo.
6. **PJUD:** scrape opt-in; quien activa asume ToS/riesgo (LICENSE + PJUD.md).
7. **Sin multi-Host / HA;** backups locales opcionales no sustituyen copia
   externa cifrada.
8. **Privilegios abogado-cliente:** flags `privilegio`/`confidential` no equivalen
   a implementación completa de privilegio legal.
9. **Google Drive/Calendar:** stubs locales en dev; en producción acciones stub
   responden 4xx (fail-closed).
10. **Storage:** Host local con `LEXOPEN_ALLOW_LOCAL_PRODUCTION_STORAGE=1` o S3.

---

## 4. Inventario del design system actual

| Pieza | Ubicación | Contenido |
| --- | --- | --- |
| Tokens CSS | `src/app/globals.css` (`:root`) | `--ink`, `--ink-soft`, `--copper` / `--copper-deep`, `--sea` / `--sea-bright`, `--mist`, `--paper`, `--sand`, `--danger`, `--ok`, `--warn`, `--line`, `--shadow`; mapeo `@theme inline` a Tailwind 4 |
| Tipografía | globals + layout fonts | Display **Fraunces** (`.display`), UI **Sora**; evitar stacks genéricos en trabajo nuevo |
| Utilidades | globals | `.panel`, `.btn` / `.btn-primary|secondary|ghost`, `.badge*`, `.input`/`.select`/`.textarea`, `.nav-link`, `.skip-link`, animaciones `.fade-up*`, `.hero-glow` |
| Primitivos React | `src/components/ui.tsx` | `formatDate` / `formatDateTime`, `StatusBadge`, `pageTitleClass`, `pageToolbarClass` — **delgado** (no es un kit de componentes completo) |
| Shell | `AppShell.tsx` | Layout + menú móvil a11y (focus, Escape, `inert`, safe-area) |
| Sidebar | `AppSidebar.tsx` | Nav por rol (staff vs cliente), badges correo/notif, i18n, UserSwitcher |
| Headers de página | `sites/SiteNav.tsx` | `PageHeader` + alias `ModuleHeader` |
| Empty states | `EmptyState.tsx` | Patrón compartido unevenly adopted |
| i18n | `lib/i18n` + `LanguageSwitcher` | ES/EN en paneles recientes; **facturación hub aún hardcode ES** |

**Implicación Fase 2:** refrescar UI reutilizando tokens/shell; ampliar
`ui.tsx` solo donde reduzca inconsistencia (no introducir otro design system).
AUDITORIA: tema 2/4, integridad visual 3/4 — deuda heredada, no greenfield.

**Paleta agentes (colisión):**

| Path | Contenido |
| --- | --- |
| `.jules/palette.md` | Aprendizaje ARIA (`aria-expanded` / `aria-controls`) |
| `.Jules/palette.md` | Aprendizajes loading text en botones TOTP/async |

Acción recomendada (Fase 2 o 4): fusionar en **una** carpeta (preferir
`.jules/` lowercase) y documentar en CONTRIBUTING.

---

## 5. Reutilización obligatoria — pipeline asistente (Fase 1)

**No reinventar.** El copiloto ya tiene:

| Capa | Archivos | Rol |
| --- | --- | --- |
| UI copiloto | `components/agente/*` (`useAgenteCopilot`, `AgenteCopilotView`, `SourceChip`, types) | Chat, utilidades, alcance documental, approve→minuta |
| Acciones UI embebibles | `components/ai/*` (`AiAssist`, `CausaResumenAi`, `PlazoSugerirAi`, …) | Paneles por dominio |
| API chat | `POST/GET /api/integrations/hermes` | Context pack, utilities, historial, rate limit, audit |
| API acciones | `POST /api/ai/actions` | `AI_ACTIONS` tipadas + demos etiquetados |
| LLM | `lib/integrations/llm.ts` (+ `hermes.ts` compat) | Multi-proveedor OpenAI-compatible; fail-closed demo en prod |
| Contexto | `lib/ai/context-pack.ts`, `document-context.ts`, `chat-history.ts` | Anclaje a causa/carpeta/docs/plazos/wiki/jurisprudencia |
| Utilidades | `lib/ai/utilities.ts`, `suggested-actions.ts`, `local-assist.ts` | copilot, briefing, doc_qa, draft, plazos, research, similar |
| Dominio anclado | `plazos.ts`, `minutas.ts`, `search.ts`, `causas/*`, `pjud/*` | Cómputos y handoffs |
| Seguridad | RBAC, CSRF (`apiMutation`), audit, confidentialWhere | Misma superficie que el resto del Host |

**Dirección Fase 1 (Inicio):** brief completo (opción A, aprobado 2026-09-30):
ruta `/inicio` como default staff post-login; motor de intención
`src/lib/assistant/` con tools tipados + confirmación humana en escrituras;
reutilizar dominio §5 (`llm.ts`, `plazos.ts`, `search.ts`, `chat-history`,
RBAC/CSRF/audit). `/agente` sigue como consola completa. `/dashboard` queda
como «Panel» de KPIs (no se eliminan features).

---

## 5bis. Decisiones aprobadas (Gabriel · 2026-09-30)

| Tema | Decisión |
| --- | --- |
| Alcance Fase 1 | **Brief original completo** (Inicio + intent engine + tools + Evento). No el sketch ligero «embeber Hermes en dashboard» de la §6 borrador. |
| Portal | Mantener modelo actual (members + `isClientVisible` + tag cliente). |
| Auditoría | Documentar gaps best-effort; **no** forzar `writeAuditStrict` en todo antes de 1.0. Mutaciones del asistente sí usan `writeAuditStrict`. |
| Redis | Store archivo OK para un solo proceso Host. |
| Facturación | Solo export; copy claro «no DTE». |
| PJUD | 100 % opt-in. |
| Desktop | Best-effort; Host web = camino soportado. |
| i18n | ES + EN parcial; strings nuevos vía i18n. |
| `.jules` merge | Fase 2. |
| Tag | `1.0.0` tras Fases 1–4 (sin `0.2.0` intermedio). |

---

## 6. Plan priorizado Fases 1–4

Esfuerzo relativo (no calendario): **S** (acotado, pocos archivos) · **M**
(varios módulos, contratos) · **L** (transversal UI/seguridad/docs).

### Fase 1 — Inicio + asistente operativo · esfuerzo **L** · riesgo medio-alto

**Objetivo:** primer viewport de trabajo diario = asistente de turno con
confirmación humana en escrituras, status del Host (sin LLM) y agenda unificada
(plazos + eventos + audiencias).

**Hacer**

1. **Nav:** `src/app/(app)/inicio/page.tsx` default post-login staff;
   `safeAppPath` + redirects `/dashboard` → `/inicio`; AppSidebar «Inicio»
   primero; dashboard como «Panel»; cliente → `/portal`.
2. **Inicio UI:** saludo Chile-time + línea de status (plazos fatales,
   audiencias, movimientos PJUD); composer autoexpandible (placeholders,
   adjuntos ingest/OCR, Enter/Shift+Enter, ⌘K/Ctrl+K, Web Speech es-CL
   opcional, chips); cards Hoy/Plazos/Actividad/Causas; historial con result
   cards (Ver/Editar/Deshacer).
3. **Intent engine** `src/lib/assistant/`: normalize (es-CL / Santiago,
   RIT/ROL/RUC) → classify (Zod JSON multi-intent + rule fallback sin LLM) →
   resolve (`search.ts` + ACL) → plan ordenado → confirm humano en writes →
   tool registry → `writeAuditStrict` + card + undo. APIs SSE
   `POST /api/assistant` + `POST /api/assistant/confirm` (planId server-side);
   CSRF, rate-limit, Zod, `handleRouteError`; persistir `AgentChat`.
4. **Tools** mínimos: `nota.*`, `tarea.*`, `causa.*`, `minuta.borrador|crear`,
   `documento.*`, `plazo.crear|estimar`, `evento.*`, `buscar`,
   `jurisprudencia.*`, `respuesta.libre`.
5. **Evento:** migrate Prisma `Evento`; `/calendario` mes/semana/agenda con
   CRUD + drag; Google Calendar CRUD + ICS; conflictos en confirm.
6. **Tests:** unit (fechas, RIT/RUC, Zod tools, RBAC, rule classifier);
   contract `/api/assistant` con fixtures; e2e login→Inicio→audiencia→confirm
   →calendario; cliente sin staff assistant. `npm test` / lint / build / e2e
   verdes.

**No hacer (Fase 1)**

- Fases 2–4 de producto (UI global, hardening Redis obligatorio, tag 1.0).
- Bypass de confirmación humana en escrituras.
- Nuevo proveedor LLM; reescribir `context-pack` / Hermes.

**Riesgos**

- Scope L: migration + calendario + SSE + muchos tools.
- Regresión e2e que asumen post-login `/dashboard`.
- Copy que suene a «asesoría» — disclaimer operativo.

**Definición de terminado (Fase 1)**

- [x] Staff aterriza en `/inicio`; cliente en `/portal`; Panel conserva KPIs.
- [x] Composer + status + cards + historial con rich cards / undo.
- [x] Pipeline intent → confirm → execute auditado; reads sin confirm.
- [x] Tools mínimos del brief registrados y testeados (Zod + RBAC).
- [x] `Evento` migrado; calendario muestra plazos+eventos+audiencias.
- [x] Unit + contract + e2e del flujo audiencia; suite `test` incluye nuevos.
- [x] `npm test`, `npm run lint`, `npm run build` verdes; e2e inicio+cliente OK.
- [x] CHANGELOG actualizado; sin trabajo de Fase 2–4 de producto.

**Gaps residuales vs brief (cierre 2026-09-30)**

| Gap | Estado |
| --- | --- |
| Vista semana + drag-to-move de eventos | **Cerrado** — `vista=mes\|semana\|agenda`, `CalendarioBoard` DnD → `PATCH /api/eventos/:id` (conserva hora); agenda móvil intacta. |
| Google Calendar pull (+ push/ICS) | **Cerrado** — `pullGoogleCalendarEvents` + `POST action=pull-calendar`; UI en Calendario e Integraciones; soft-fail `GoogleIntegrationError`. Conflictos en API directa siguen informativos (no bloqueantes). |
| `FirmSettings.assistantLlmMode` | **Cerrado** — `local_only` \| `remote_allowed`; classify usa reglas si local-only o sin LLM. |
| `auditLlmPrompts` (admin) | **Cerrado** — default `false`; prompts completos en auditoría solo si está activo (sin env obligatorio; setting DB). |
| E2E suite completa en VM | **Parcial** — 2026-09-30: `npm test` + lint + build OK; `e2e/inicio-assistant` **2/2** verdes. Suite Playwright legacy completa no re-corrida (disco VM ~93%). |

### Fase 2 — UI renovada y coherente · esfuerzo **M–L** · riesgo medio-bajo

**Objetivo:** una sola lectura visual staff (tokens + shell + primitivos + i18n)
sin reinventar la marca (copper/sea).

**Estado (2026-09-30 · completa en PR #151; deuda residual abajo)**

| Ítem | Estado |
| --- | --- |
| Tokens `globals.css` + `@theme` + light/`html.dark` + motion/a11y | **Hecho** |
| Theme toggle persistido (`lexopen_theme` + `prefers-color-scheme`) | **Hecho** |
| Librería `src/components/ui/*` (Button…CommandPalette, Loading/Error/Confirm) | **Hecho** (nativo dialog/listbox; sin deps nuevas) |
| AppShell/Sidebar colapsable + grupos Trabajo/Clientes/Documentos/Admin | **Hecho** |
| Breadcrumbs + búsqueda global + ⌘K + panel notificaciones | **Hecho** |
| Hub Facturación → i18n + `ModuleHeader` | **Hecho** |
| Unificar `.jules/palette.md` (eliminar `.Jules/`) + CONTRIBUTING | **Hecho** |
| Screen pass hubs (plazos, personas, flujos, ficha causa, buscar, integraciones, …) | **Hecho** |
| Empty/loading/error + confirm destructivo (calendario, personas, trámites, isheet, causa) | **Hecho** |
| Spot-check Electron `desktop/` (`npm test` + tokens setup) | **Hecho** |

**Deuda residual (no bloquea cierre Fase 2)**

- Sub-hubs facturación (`/facturacion/*`) y altas PJUD (`causas/nueva`, `mis-causas`) aún con copy ES hardcodeado en headers (re-exportan `PageHeader` de UI).
- `WikiHistoryPanel` sigue con `confirm()` nativo (restaurar revisión).
- Shell Electron `desktop/renderer/setup.css`: tokens cercanos pero no idénticos a `globals.css` (sand/paper legacy); sin rotura funcional.

**Riesgos**

- Scope creep «rediseño total»; Next 16 breaking changes en layouts.
- Regresiones a11y móvil ya arregladas en AppShell.

**Criterio de salida:** lint/tsc/build verdes; `inicio-assistant` e2e verde;
paleta agentes unificada; hubs principales con tokens/i18n. → **cumplido** (deuda residual arriba).

### Fase 3 — Endurecimiento producción · **completa** (2026-09-30)

**Objetivo:** Host real operable sin flags peligrosas y con límites honestos.

**Hecho**

- Redis rate-limit cuando `REDIS_URL` / `RATE_LIMIT_REDIS_URL` / Upstash;
  fallback archivo documentado para Host single-process (`docs/WEB-HOST.md`).
- Hard-fail boot + `prod:check` si `LEXOPEN_OPEN_ACCESS`,
  `LEXOPEN_RELAX_CSRF`, `*_ALLOW_DEMO` (salvo `LEXOPEN_KEEP_*_DEMO`),
  `LEXOPEN_ALLOW_PLAINTEXT_PASSWORDS` / `LEXOPEN_DEMO_SWITCHER` en producción.
- CSP nonce en proxy; `fetchSafeOutbound` en UF sync; 2FA TOTP recomendado en
  checklist (ya existía en `/cuenta`).
- Índices lista/dashboard + `?limit=` en APIs hot-path; notas de retención/
  backup en WEB-HOST.
- Logs JSON + `x-request-id`; `/api/health` privileged con DB/storage/queues/
  LLM/PJUD/rate-limit; `global-error` + `not-found`.
- Inicio: Server Component + Suspense streaming; presupuesto LCP < 2.5s con
  datos muestra (saludo sync primero; medir en Host real con Lighthouse).
- Tests assistant ampliados (greeting/conflicts/plan-store) + list-limit/log;
  CI: `prisma migrate diff` drift tras `migrate deploy`.
- Auditoría: **no** se forzó `writeAuditStrict` en wiki/blog/Hermes/webhook;
  README documenta el residual best-effort.

**Residual / no hecho (aceptado)**

- Portal model sin cambios (decisión).
- Purga automática de auditoría/notificaciones (solo notas de retención).
- Medición LCP formal en CI (nota de presupuesto; medir en Host).
- Cobertura assistant ≥80% exacta no instrumentada con c8; tests ampliados
  hacia ese umbral.
- Fase 4 (bump `1.0.0`) **no** iniciada.

**Criterio de salida:** cumplido en código/docs; suite verde en CI.

### Fase 4 — Docs y release 1.0 · esfuerzo **S–M** · riesgo bajo

**Objetivo:** versión `1.0.0`, changelog, README/WEB-HOST/DESKTOP coherentes con
lo entregado en 1–3.

**Hacer**

- Bump versión, sección CHANGELOG 1.0.0, badge README.
- Actualizar recorrido demo + checklist producción.
- Nota de upgrade desde 0.1.9 (`migrate deploy`, no seed).
- CONTRIBUTING: Next 16 docs path + carpeta `.jules` canónica.

**Riesgos**

- Prometer paridad CausaMonitor/SII/HighQ completa — acotar copy.

**Criterio de salida:** tag/release notes; CI verde; `prod:check` documentado
como paso de aceptación.

---

## 7. Orden sugerido y dependencias

```text
Fase 0 (este doc) ──► aprobación Gabriel
        │
        ▼
Fase 1 Inicio/asistente ──► reutiliza lib/ai + hermes (bloquea UX «wow» 1.0)
        │
        ├─► Fase 2 UI (puede solaparse tras aterrizar Inicio)
        │
        ▼
Fase 3 hardening (puede iniciar en paralelo docs de flags; código tras 1)
        │
        ▼
Fase 4 docs/release
```

---

## 8. Preguntas abiertas

**Resueltas** → ver §5bis (Decisiones aprobadas).

**Resueltas en cierre de gaps Fase 1 (Gabriel · 2026-09-30):**

1. Google Calendar: **pull + push + ICS** (no solo push).
2. Modo LLM del estudio: **`FirmSettings.assistantLlmMode`** (`local_only` |
   `remote_allowed`).
3. Auditoría de prompts: **`FirmSettings.auditLlmPrompts`** (admin, default
   off). No se exige env `LEXOPEN_AUDIT_LLM_PROMPTS`; el setting DB es la fuente
   de verdad.

---

## 9. Fuera de alcance de Fase 0 / de este doc como diagnóstico

- Implementación de producto Fases 2–4 (Fase 1 se implementa en la misma rama).
- Merge de las ~90 ramas históricas inventariadas en AUDITORIA (mayoría behind;
  no reabrir en bloque).
- Certificación WCAG completa, pentest externo, ni carga de producción.
- Activación real de scrape ClaveÚnica / Google / S3 / LLM remoto en este
  entorno de agente.

---

## 10. Evidencia de lectura (checklist Fase 0)

- [x] AGENTS.md (Next 16)
- [x] README.md, CONTRIBUTING.md, CHANGELOG.md
- [x] docs/WEB-HOST.md, docs/AUDITORIA-2026-09-06.md (+ DESKTOP.md / PJUD.md)
- [x] prisma/schema.prisma (modelos Organization→Mailbox*)
- [x] globals.css, ui.tsx, AppShell, AppSidebar, tokens `--ink-soft`
- [x] Módulos de dominio listados + `lib/ai/*`, hermes, plazos, google, document-*,
      minutas, causas, pjud, search, security/RBAC/CSRF/audit, i18n, copiloto
- [x] Colisión `.jules` / `.Jules` documentada
