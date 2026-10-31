# LexOpen 1.0.0 — notas de release

**Tag:** `v1.0.0` (crear tras merge de la PR Fase 4 + CI verde).

## Destacados

- Home staff **`/inicio`**: asistente operativo con confirmación humana.
- **Panel** `/dashboard` para KPIs (sin redirect).
- Calendario con **Eventos**, Google Calendar push/pull/ICS.
- UI 1.0 (tokens, dark mode, shell, ConfirmDialog).
- Producción: demos hard-fail, Redis rate-limit opcional, logs/health, límites de lista.

## Upgrade

Ver [`UPGRADE-1.0.md`](./UPGRADE-1.0.md). Resumen: backup → `npm ci` →
`prisma migrate deploy` → `npm run prod:check`.

## No incluido (límites honestos)

- DTE/SII, portal RO completo, multi-Host/HA, Solvecha (#195 post-1.0).

## Enlaces

- [`ASISTENTE.md`](./ASISTENTE.md) · [`WEB-HOST.md`](./WEB-HOST.md) · [`CHANGELOG.md`](../CHANGELOG.md)
