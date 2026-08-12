# PJUD / CausaMonitor parity (scrape + ClaveÚnica)

## Principio: host local, APIs externas OK

**Local** = dónde corre LexOpen y dónde se guardan datos/secretos (self-hosted).
**No** implica “cero red”: puede llamar APIs externas mientras el *host* de la
app (Postgres, vault ClaveÚnica, cola, sidecar) sea el suyo — no CausaMonitor
SaaS ni otro backend ajeno que custodie su cartera.

| Qué | Dónde |
|-----|--------|
| App, Postgres, `PjudSyncJob`, digest, vault ClaveÚnica | **Su host** (web:host / VPS / Render propio) |
| Consulta OJV / ClaveÚnica gob / CAPTCHA solver / partner API / Gmail | **APIs externas permitidas** (salida de red) |
| Sidecar Playwright | Mismo despliegue o `localhost` / red privada suya |
| CSV | Offline respecto de OJV; útil como respaldo |

Orden de ingest práctico: sidecar → scrape in-process → partner API → demo/CSV.
Partner y CAPTCHA son llamadas externas válidas; lo que no se usa es un *host*
externo para LexOpen mismo.

LexOpen toma como referencia el **modelo operativo** de CausaMonitor
(`app.causamonitor.com` + `api.causamonitor.com`), no el flujo MCP de
`mcp-legal-chile` (sin prueba de producción).

## Arquitectura de referencia (CausaMonitor, inspeccionada)


| Pieza | CausaMonitor | LexOpen |
|-------|--------------|---------|
| UI | Next.js (`app.causamonitor.com`) | Next.js LexOpen |
| API casos | `GET /api/cases`, sync autenticado | `/api/causas/monitoreo`, `/api/pjud/*` |
| Cola | Redis (Bull-style: waiting/active/completed/failed/delayed) | Postgres `PjudSyncJob` |
| Worker | Proceso con **concurrency 5** (`/api/health`) | Sidecar Playwright + `processPendingSyncJobs` (`PJUD_SYNC_CONCURRENCY`, default **5**) |
| Stats cola | `GET /api/queue/stats` (público) | `GET /api/pjud/queue` (staff) + Host status |
| Digest | `POST /api/cron/digest` | `POST /api/pjud/digest` |
| Auth datos | Supabase Auth | Sesión LexOpen |
| Acceso OJV | **Doble vía:** invitado **y** ClaveÚnica (`/api/pjud-credentials`, `/api/cases/mis-causas`) | Mismo: guest OJV + ClaveÚnica cifrada en vault local (`FirmSettings`) |

Flujo producto CausaMonitor (marketing + API):

1. Alta por ROL / CSV / RUT empresa (consulta pública / invitado)
2. Opcional: guardar ClaveÚnica cifrada → Mis Causas
3. Worker escanea de madrugada (cola + concurrency)
4. Resumen ~08:00 + PDF backup + receptor / escritos / salas

## Dos vías de acceso OJV (paridad CausaMonitor)

CausaMonitor **no** usa solo invitado. La API expone:

| CM | LexOpen |
|----|---------|
| `POST` / `DELETE` `/api/pjud-credentials` | `POST /api/pjud/claveunica` (`save` / `clear`) |
| `GET /api/pjud-credentials/status` | `GET /api/pjud/claveunica` |
| `GET /api/cases/mis-causas` | `GET`/`POST /api/pjud/mis-causas` |

1. **Invitado (público):** consulta ROL/RUT sin login — cartera por ROL/CSV/RUT.
2. **ClaveÚnica:** credenciales del estudio cifradas **en reposo local** (AES-256-GCM) → login OJV → listado Mis Causas → monitoreo.

El FAQ de marketing de CM enfatiza que el monitoreo público no *exige* entregar clave; eso coexiste con el vault de credenciales PJUD en su API.

## Scrape OJV — vía invitada

Misma familia DOM que scrapers de campo `consulta_causas_pjud`:

1. `home/index.php` → `accesoConsultaCausas()` (sesión invitado)
2. Tab `#BusJuridica` (RUT) o tab ROL/RIT
3. `#jurCompetencia` + `#jurTribunal` / `#corteJur`
4. `#btnConConsultaJur` → espera `#loadPreJuridica`
5. Filas `#verDetalleJuridica` → modal `.modal.in` (`table.table-titulos`, historia, e-book)

Sesión CAPTCHA reutilizable + presupuesto diario de solves (operación a escala tipo worker).  
**No** usar heurísticas MCP no validadas como fuente de verdad del DOM.

Kill switches, presupuesto CAPTCHA diario y cache TTL (`PJUD_CAUSAS_CACHE_TTL_MS`) aplican. Resultados = integridad *candidate*.

## Scrape OJV — vía ClaveÚnica

1. Admin guarda RUT + password → `encryptSecret` (AES-256-GCM, prefijo `enc:v2:`) en `FirmSettings.claveUnicaPasswordEnc`
2. Clave: `PJUD_SECRETS_KEY` (recomendado) o fallback `SESSION_SECRET`
3. Sync Mis Causas desencripta solo en servidor / sidecar, nunca expone plaintext por API
4. Login OJV vía ClaveÚnica → parsea Mis Causas → encola sync de movimientos

Kill switch: `PJUD_CLAVEUNICA_SCRAPE=1` (+ scrape/sidecar).

## Orden de ingest al sincronizar

1. `PJUD_SCRAPER_URL` (sidecar en su host / red privada)
2. Scrape in-process (`PJUD_PUBLIC_SCRAPE=1` + CAPTCHA solver + Playwright/Chromium)
3. `PJUD_API_URL` (partner API externa — permitida)
4. Demo (`PJUD_ALLOW_DEMO`)
5. CSV / webhook

Sin ingest live en producción el sync es **fail-closed** (no inventa datos).

## Kill switches (obligatorios para scrape)

| Variable | Efecto |
|----------|--------|
| `PJUD_PUBLIC_SCRAPE=1` | Habilita scrape OJV in-process |
| `CAPTCHA_SOLVER_PROVIDER` + `CAPTCHA_SOLVER_API_KEY` | 2captcha \| capsolver |
| `PJUD_SCRAPER_URL` | Microservicio (`POST /causas/lookup`, `/mis-causas`, `/causas/buscar`). Acepta `http://host:port` (Render `fromService` hostport) |
| `PJUD_SCRAPER_ALLOW_PRIVATE=1` | Permite sidecar en red privada (Render `.internal`) |
| `PJUD_CLAVEUNICA_SCRAPE=1` | Automatiza login ClaveÚnica → Mis Causas (vía CM `/api/pjud-credentials`) |
| `PJUD_SECRETS_KEY` | Vault AES-256-GCM local para password ClaveÚnica (fallback: `SESSION_SECRET`) |
| `PJUD_CAUSAS_DAILY_SOLVE_BUDGET` | Tope diario de CAPTCHA (default 50) |
| `PJUD_SYNC_CONCURRENCY` | Parallelismo del worker de cola (default **5**, como CM) |
| `PJUD_SYNC_INTERVAL_MINUTES` | Intervalo `pjudNextSyncAt` tras sync OK (default **240** = 4h) |
| `PJUD_PDF_BACKUP=1` | Tras sync, descarga `documentoRef` http(s) → `Documento` LexOpen |
| `CRON_SECRET` | Autoriza crons (`x-cron-secret`) |

Sin estos flags, LexOpen **no** scrapea ni usa ClaveÚnica. Si `PJUD_PUBLIC_SCRAPE=1` pero falta Playwright/Chromium, el scrape falla con error claro (no cae a demo en prod).

## Sidecar de referencia (in-repo)

```bash
npm run pjud:scraper
# o: node scripts/pjud-scraper-worker.mjs
```

Endpoints: `GET /health`, `POST /causas/lookup`, `POST /mis-causas`, `POST /causas/buscar`.

`GET /health` reporta `workerRunning` / `scrapeReady` (análogo a CM `workerRunning`).

En Render, el Blueprint define `lexopen-pjud-scraper` (`type: pserv`) con `npx playwright install chromium` en build, y cablea `PJUD_SCRAPER_URL` + `PJUD_SCRAPER_ALLOW_PRIVATE=1` en el web.

## Cron / cola

- `POST /api/causas/monitoreo` encola causas con `pjudMonitoreoActivo` y `pjudNextSyncAt` null/`<= now` (dedupe si ya hay pending/running), reclama jobs stuck en `running`, luego procesa `PjudSyncJob` pending → running → ok/failed con concurrency `PJUD_SYNC_CONCURRENCY`.
- `GET /api/pjud/queue` → stats estilo CM (`waiting`/`active`/`completed`/`failed`/`delayed`).
- Fallos aplican **backoff** exponencial sobre el intervalo base (`pjudFailCount`).
- Retry fallidos: `action: retry-fallidos` re-encola solo esos jobs.
- Render: cartera cada **4h** (`0 */4 * * *`, alineado a `PJUD_SYNC_INTERVAL_MINUTES=240`); Mis Causas ~07:00 Santiago (`0 10 * * *` UTC); digest ~08:00 Santiago (`0 12 * * *` UTC).
- `CRON_SECRET` y `PJUD_SCRAPER_KEY` se generan en el web y se copian a crons/sidecar (`fromService.envVarKey`) para evitar desalineación.
- Host local: `PJUD_SYNC_INTERVAL_MINUTES`, `PJUD_MIS_CAUSAS_INTERVAL_MINUTES`, `PJUD_DIGEST_INTERVAL_MINUTES` en `scripts/web-host.mjs`.

## Digest email (~08:00 Santiago)

- `POST /api/pjud/digest` (cron secret o staff)
- Secciones estilo CausaMonitor: **Receptor**, **Escritos por resolver**, **Movimientos** + causas rojo sin novedad
- Causas sin abogado se enrutan a admins/staff
- Envía vía Gmail API si Google está conectado (`gmail.send`); si no, solo notificaciones in-app
- Estado en Host status (`FirmSettings.pjudDigestLast*` + cola pending/running)

## Backup PDF

Con `PJUD_PDF_BACKUP=1`, tras sync (también backfill) se descargan links `documentoRef` públicos seguros (anti-SSRF), se rechazan HTML/login walls, y se guardan como `Documento`; el movimiento queda con `doc:<id>` y la ficha muestra link LexOpen.

## Programación de salas

Paridad CausaMonitor (tablas de Cortes):

- `src/lib/pjud/salas.ts` — parse HTML de tabla + match por RIT contra cartera
- Campos `Causa.proximaTabla` / `proximaTablaNota`
- Fixture/demo offline en tests de seguimiento

## Alta rápida / CSV cartera


- UI en `/causas/monitoreo` (panel ROL / RUT + **Importar/Exportar CSV**)
- API `POST /api/pjud/lookup` con `action: add-rol | preview-rol | buscar-rut`
- CSV: `GET /api/causas/monitoreo?format=csv` · `POST` `action: import-cartera` con `{ csv }`
- Header: `rit,tribunal,titulo,ruc,materia`

## ClaveÚnica (vault local cifrado)

Paridad con CausaMonitor `/api/pjud-credentials` (+ Mis Causas):

- UI: `/causas/mis-causas` (admin guarda RUT/password)
- Almacenamiento **local cifrado** en Postgres (`FirmSettings.claveUnicaPasswordEnc`), AES-256-GCM (`enc:v2:…`) con **`PJUD_SECRETS_KEY`** (fallback `SESSION_SECRET`)
- Status sin plaintext: RUT enmascarado + `hasPassword`
- Sync: `POST /api/pjud/mis-causas` (también vía `x-cron-secret`)
- Importa causas, marca `pjudFromMisCausas` / `pjudSource: claveunica` y dispara sync de movimientos

La vía invitada sigue disponible para alta por ROL/RUT sin credenciales.

## Sidecar contrato

```http
POST /causas/lookup
{ "rit": "C-100-2024", "tribunal": "1º Juzgado Civil de Santiago" }

POST /mis-causas
{ "rut": "12.345.678-9", "password": "…" }
```

Respuesta lookup: mismo shape que partner API (`movimientos[]` con cuaderno/folio/receptor/`documentoRef`).

## Riesgos

- PJUD no publica API de causas; el scrape elude WAF/CAPTCHA (ToS).
- Custodiar ClaveÚnica implica riesgo de seguridad: use cuenta del estudio, rotación, y preferir sidecar aislado.
- Resultados scrape = integridad *candidate*; verifique en el portal oficial antes de actuar.

## CSV / webhook

Siguen disponibles como respaldo (ver `docs/WEB-HOST.md`).
