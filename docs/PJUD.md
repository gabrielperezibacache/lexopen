# PJUD / CausaMonitor parity (scrape + ClaveÚnica)

LexOpen replica el flujo de datos de CausaMonitor:

1. **Consulta pública** por ROL/RIT (scrape OJV o sidecar)
2. **ClaveÚnica** cifrada → listado **Mis Causas** → monitoreo + sync
3. Cartera con semáforos, cuadernos, receptor, fallidos

## Orden de ingest al sincronizar

1. `PJUD_API_URL` (partner)
2. `PJUD_SCRAPER_URL` (sidecar HTTP, recomendado en producción)
3. Scrape in-process (`PJUD_PUBLIC_SCRAPE=1` + CAPTCHA solver + Playwright)
4. Demo (`PJUD_ALLOW_DEMO`)
5. CSV / webhook

## Kill switches (obligatorios para scrape)

| Variable | Efecto |
|----------|--------|
| `PJUD_PUBLIC_SCRAPE=1` | Habilita scrape OJV in-process |
| `CAPTCHA_SOLVER_PROVIDER` + `CAPTCHA_SOLVER_API_KEY` | 2captcha \| capsolver |
| `PJUD_SCRAPER_URL` | Microservicio externo (`POST /causas/lookup`, `POST /mis-causas`, `POST /causas/buscar`) |
| `PJUD_SCRAPER_ALLOW_PRIVATE=1` | Permite sidecar HTTP en red privada (Render `.internal`) |
| `PJUD_CLAVEUNICA_SCRAPE=1` | Permite automatizar login ClaveÚnica |
| `PJUD_SECRETS_KEY` | Vault AES dedicado (recomendado vs reutilizar SESSION_SECRET) |
| `PJUD_CAUSAS_DAILY_SOLVE_BUDGET` | Tope diario de CAPTCHA (default 50) |

Sin estos flags, LexOpen **no** scrapea ni usa ClaveÚnica.

## Alta rápida

- UI en `/causas/monitoreo` (panel ROL / RUT)
- API `POST /api/pjud/lookup` con `action: add-rol | preview-rol | buscar-rut`

## ClaveÚnica

- UI: `/causas/mis-causas` (admin guarda RUT/password)
- Cifrado AES-256-GCM con `SESSION_SECRET`
- Sync: `POST /api/pjud/mis-causas` (también vía `x-cron-secret`)
- Importa causas, marca `pjudFromMisCausas` y dispara sync de movimientos

## Sidecar (recomendado)

```http
POST /causas/lookup
{ "rit": "C-100-2024", "tribunal": "1º Juzgado Civil de Santiago" }

POST /mis-causas
{ "rut": "12.345.678-9", "password": "…" }
```

Respuesta lookup: mismo shape que partner API (`movimientos[]` con cuaderno/folio/receptor).

## Riesgos

- PJUD no publica API de causas; el scrape elude WAF/CAPTCHA (ToS).
- Custodiar ClaveÚnica implica riesgo de seguridad: use cuenta del estudio, rotación, y preferir sidecar aislado.
- Resultados scrape = integridad *candidate*; verifique en el portal oficial antes de actuar.

## CSV / webhook

Siguen disponibles como respaldo (ver `docs/WEB-HOST.md`).
