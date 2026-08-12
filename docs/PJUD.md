# PJUD / CausaMonitor parity (scrape + ClaveÚnica)

LexOpen replica el flujo de datos de CausaMonitor:

1. **Consulta pública** por ROL/RIT (scrape OJV o sidecar)
2. **ClaveÚnica** cifrada → listado **Mis Causas** → monitoreo + sync
3. Cartera con semáforos, cuadernos, receptor, fallidos
4. **Cola durable** `PjudSyncJob` (due-based) + digest diario + backup PDF opcional

## Orden de ingest al sincronizar

1. `PJUD_API_URL` (partner)
2. `PJUD_SCRAPER_URL` (sidecar HTTP, recomendado en producción)
3. Scrape in-process (`PJUD_PUBLIC_SCRAPE=1` + CAPTCHA solver + Playwright/Chromium)
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
| `PJUD_CLAVEUNICA_SCRAPE=1` | Permite automatizar login ClaveÚnica |
| `PJUD_SECRETS_KEY` | Vault AES-256-GCM dedicado (fallback: `SESSION_SECRET`) |
| `PJUD_CAUSAS_DAILY_SOLVE_BUDGET` | Tope diario de CAPTCHA (default 50) |
| `PJUD_PDF_BACKUP=1` | Tras sync, descarga `documentoRef` http(s) → `Documento` LexOpen |
| `CRON_SECRET` | Autoriza crons (`x-cron-secret`) |

Sin estos flags, LexOpen **no** scrapea ni usa ClaveÚnica. Si `PJUD_PUBLIC_SCRAPE=1` pero falta Playwright/Chromium, el scrape falla con error claro (no cae a demo en prod).

## Sidecar de referencia (in-repo)

```bash
npm run pjud:scraper
# o: node scripts/pjud-scraper-worker.mjs
```

Endpoints: `GET /health`, `POST /causas/lookup`, `POST /mis-causas`, `POST /causas/buscar`.

En Render, el Blueprint define `lexopen-pjud-scraper` (`type: pserv`) con `npx playwright install chromium` en build, y cablea `PJUD_SCRAPER_URL` + `PJUD_SCRAPER_ALLOW_PRIVATE=1` en el web.

## Cron / cola

- `POST /api/causas/monitoreo` encola causas con `pjudMonitoreoActivo` y `pjudNextSyncAt` null/`<= now`, luego procesa `PjudSyncJob` pending → running → ok/failed.
- Retry fallidos: `action: retry-fallidos` re-encola.
- Render: cartera cada 6h; Mis Causas + digest ~08:00 America/Santiago (`0 11 * * *` UTC estándar).
- Host local: `PJUD_SYNC_INTERVAL_MINUTES`, `PJUD_MIS_CAUSAS_INTERVAL_MINUTES`, `PJUD_DIGEST_INTERVAL_MINUTES` en `scripts/web-host.mjs`.

## Digest email (08:00)

- `POST /api/pjud/digest` (cron secret o staff)
- Agrupa movimientos relevantes / receptor / semáforo rojo desde última digest o 24h
- Envía vía Gmail API si Google está conectado (`gmail.send`); si no, solo notificaciones in-app
- Estado en Host status (`FirmSettings.pjudDigestLast*`)

## Backup PDF

Con `PJUD_PDF_BACKUP=1`, tras sync exitoso se descargan links `documentoRef` absolutos y se guardan como `Documento`; el movimiento queda con `doc:<id>` y la ficha muestra link LexOpen.

## Alta rápida

- UI en `/causas/monitoreo` (panel ROL / RUT)
- API `POST /api/pjud/lookup` con `action: add-rol | preview-rol | buscar-rut`

## ClaveÚnica

- UI: `/causas/mis-causas` (admin guarda RUT/password)
- Cifrado AES-256-GCM con **`PJUD_SECRETS_KEY`** (fallback `SESSION_SECRET`)
- Sync: `POST /api/pjud/mis-causas` (también vía `x-cron-secret`)
- Importa causas, marca `pjudFromMisCausas` y dispara sync de movimientos

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
