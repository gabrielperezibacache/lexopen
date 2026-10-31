# Upgrade 0.1.9 → 1.0.0

Guía para Hosts que ya corren LexOpen `0.1.9` («piloto endurecido»).

## Antes de empezar

1. **Respaldo** del data dir (`LEXOPEN_DATA_DIR`) y de Postgres (script
   `npm run web:backup` o copia en frío del volumen).
2. Lea el checklist de producción en [`WEB-HOST.md`](./WEB-HOST.md) y ejecute
   `npm run prod:check` tras el upgrade.
3. No use `prisma db push`, `npm run setup`, `db:reset` ni `db:seed` sobre un
   data dir con datos reales.

## Pasos

```bash
# 1. Detener el Host
# 2. Actualizar el código (git pull / self-update / release 1.0.0)
git fetch origin && git checkout v1.0.0   # o la ref que use su despliegue

# 3. Dependencias
npm ci

# 4. Migraciones versionadas (incluye Evento, FirmSettings LLM, índices Fase 3)
npx prisma migrate deploy
# equivalente Host: npm run db:migrate / setup:production

# 5. Arrancar
npm run web:host   # o su unit systemd / desktop host
npm run prod:check
```

## Cambios relevantes para operadores

| Área | Qué cambia |
| --- | --- |
| Home staff | Post-login aterriza en **`/inicio`** (asistente). `/dashboard` sigue como **Panel** de KPIs (sin redirect HTTP). |
| Calendario | Modelo `Evento` + vistas mes/semana/agenda. |
| Seguridad | En producción, `*_ALLOW_DEMO` **hard-fail** al boot salvo `LEXOPEN_KEEP_*_DEMO=1`. Flags abiertas (`OPEN_ACCESS`, `RELAX_CSRF`, etc.) siguen prohibidas. |
| Rate-limit | Redis/Upstash si hay URL; si no, archivo en el data dir (un solo proceso Host). |
| Observabilidad | Logs JSON, `x-request-id`, health privileged. |
| APIs de lista | `?limit=` (default 200, máx. 500) en causas/clientes/documentos/plazos/etc. |

Detalle del asistente: [`ASISTENTE.md`](./ASISTENTE.md). Plan histórico: [`PLAN-1.0.md`](./PLAN-1.0.md).

## Desktop

La app Electron opcional (`desktop/`) también declara `1.0.0`. El camino
soportado sigue siendo el **Host web** local; Desktop es best-effort
([`DESKTOP.md`](./DESKTOP.md)).

## Si algo falla

1. No borre el último backup.
2. Revise logs del Host y `npm run prod:check`.
3. Confirme que `prisma migrate deploy` aplicó
   `20260930120000_evento_agenda`,
   `20260930140000_firm_assistant_llm_settings` y
   `20260930180000_phase3_list_indexes`.
