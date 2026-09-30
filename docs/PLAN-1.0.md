# LexOpen 1.0 — Plan (Fase 0 · diagnóstico)

| Campo | Valor |
| --- | --- |
| Versión base | `0.1.9` («piloto endurecido») |
| Fecha diagnóstico | 2026-09-30 |
| Alcance de este documento | **Solo** diagnóstico + plan priorizado. **No** implementa Fases 1–4. |
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
| **Calendario** | parcial | `/calendario` unifica plazos/tareas; Google Calendar vía OAuth | Sync Calendar stub sin OAuth | Vista rica; sin e2e de interacción | Indirecto vía plazos/Google unit |
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

**Dirección Fase 1 (Inicio):** evolucionar `/dashboard` (nav «Inicio») hacia un
asistente de turno que **componga** `useAgenteCopilot` / Hermes + widgets de
urgencias ya presentes (plazos, tareas, minutas, trámites), sin duplicar
`context-pack` ni el contrato Hermes.

---

## 6. Plan priorizado Fases 1–4

Esfuerzo relativo (no calendario): **S** (acotado, pocos archivos) · **M**
(varios módulos, contratos) · **L** (transversal UI/seguridad/docs).

### Fase 1 — Inicio como asistente · esfuerzo **M** · riesgo medio

**Objetivo:** el primer viewport de trabajo diario responde «qué priorizar hoy»
con fuentes del Host y handoffs (crear plazo/tarea/minuta), no solo KPIs.

**Hacer**

- Embebido deliberado del pipeline Hermes/copiloto en `/dashboard` (o rediseño
  Inicio que reexporte `AgenteCopilotView` con defaults `utility=copilot`).
- Reutilizar `buildAiSuggestedActions` + chips de fuentes; ACL confidencial
  idéntica a `/agente`.
- Mantener `/agente` como consola completa (alcance documental, utilidades).

**No hacer**

- Nuevo proveedor LLM, nuevo schema de chat, ni bypass de aprobación humana.

**Riesgos**

- Duplicar estado cliente si se copia `useAgenteCopilot` en vez de extraer props.
- Regresión e2e `agente-document-scope` / smoke dashboard.
- Prometer «asesoría» en copy — mantener disclaimer operativo.

**Criterio de salida:** Inicio usa el mismo backend Hermes; tests unitarios AI
verdes; e2e smoke + scope documental verdes.

### Fase 2 — Refresco UI coherente · esfuerzo **M–L** · riesgo medio-bajo

**Objetivo:** una sola lectura visual staff (tokens + headers + i18n) sin
rediseñar marca.

**Hacer**

- Pasar hubs residuales (facturación, posiblemente personas/flujos) a
  `PageHeader` + diccionarios i18n.
- Extender `ui.tsx` solo con primitivos repetidos (p. ej. toolbar/empty).
- Unificar `.jules` / `.Jules` palette.
- Revisar pantallas densas (ficha causa, monitoreo PJUD) con tokens existentes;
  sin cards decorativas ni tema púrpura/cream genérico.

**Riesgos**

- Scope creep «rediseño total»; Next 16 breaking changes en layouts.
- Regresiones a11y móvil ya arregladas en AppShell.

**Criterio de salida:** lint/tsc/build verdes; spot-check rutas AUDITORIA;
paleta agentes unificada.

### Fase 3 — Endurecimiento producción · esfuerzo **M** · riesgo alto si se toca mal

**Objetivo:** Host real operable sin flags peligrosas y con límites honestos.

**Hacer**

- Documentar + opcionalmente endurecer: Redis obligatorio si `LEXOPEN_BIND`
  multi-proceso; checklist `prod:check` alineado 1.0.
- Revisar mutaciones aún best-effort → `writeAuditStrict` donde el README aún
  las lista como gap (wiki/blog/Hermes/webhook según prioridad Gabriel).
- Portal: matrix de permisos explícita en docs + tests ACL adicionales si se
  estrecha el modelo.
- Confirmar fail-closed Drive/LLM/PJUD demo en prod (ya parcial).
- Backup/restore ensayo documentado como gate de release.

**No hacer** (salvo decisión explícita)

- HA multi-Host, DTE/SII in-app, API oficial PJUD (no existe).

**Riesgos**

- Romper Host single-process al forzar Redis.
- Sobreauditar → fallos de mutación si audit DB cae (comportamiento deseado en
  strict, pero UX).

**Criterio de salida:** `prod:check` + boot prod sin warns no intencionales;
README límites actualizados; tests seguridad/CSRF/rate-limit verdes.

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

## 8. Preguntas abiertas (requieren aprobación de Gabriel)

1. **Inicio:** ¿el asistente reemplaza el dashboard de KPIs, convive arriba del
   hub actual, o `/dashboard` redirige a un modo «briefing del día»?
2. **Alcance portal 1.0:** ¿se endurece a solo lectura + Q&A, o se mantiene el
   modelo actual documentado?
3. **Auditoría strict:** ¿hay que subir wiki/blog/iSheet/Hermes/webhook a
   `writeAuditStrict` antes del tag 1.0, o basta documentar best-effort?
4. **Redis:** ¿1.0 asume siempre un solo proceso Host (archivo OK), o se exige
   Redis cuando `LEXOPEN_BIND=0.0.0.0`?
5. **Facturación 1.0:** ¿solo export CSV/XML + copy claro «no DTE», o se apunta
   a un conector de facturador chileno concreto?
6. **PJUD en 1.0:** ¿el scrape sigue 100 % opt-in con warning LICENSE, o se
   limita el marketing a CSV/partner?
7. **Desktop:** ¿1.0 declara Electron «best effort / opcional» y Host web como
   único camino soportado (ya casi es así)?
8. **i18n:** ¿EN completo es gate de 1.0 o solo ES jurídico chileno + EN parcial?
9. **Paleta `.Jules` vs `.jules`:** ¿se fusiona en Fase 2 o en un chore previo?
10. **Versionado:** ¿`1.0.0` tras Fases 1–4, o un `0.2.0` intermedio post-Inicio?

---

## 9. Fuera de alcance de este diagnóstico

- Implementación de producto Fases 1–4.
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
