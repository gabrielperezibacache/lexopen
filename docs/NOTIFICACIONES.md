# Notificaciones LexOpen 1.1

Multicanal con outbox en Postgres, preferencias por usuario y canales sin
exponer el Host (SMTP/Gmail, Telegram long-poll, Web Push). WhatsApp queda
como **interfaz** (`ChannelProvider`) para 1.2.

## Piezas

| Pieza | Ubicación |
| --- | --- |
| Catálogo de eventos | `src/lib/notify/catalog.ts` |
| Preferencias + quiet hours | `src/lib/notify/preferences.ts` |
| `emitNotification` | `src/lib/notify/emit.ts` |
| Outbox worker | `src/lib/notify/worker.ts` |
| Hitos / escalamiento / acuse | `src/lib/notify/plazos.ts` |
| Adaptadores | `src/lib/notify/providers/*` |
| Cola `Job` | `src/lib/jobs/queue.ts` |
| UI usuario | `/cuenta/notificaciones` |
| UI admin | Configuración → Notificaciones |
| PWA | `src/app/manifest.ts`, `public/sw.js` |

## Esquema (aditivo)

Migración `20261031120000_notificaciones_outbox`:

- `Notification` += `tipo`, `severidad`, `entity*`, `dedupeKey`, `ack*`
- `CanalUsuario`, `PreferenciaNotificacion`, `PerfilNotificacion`
- `MensajeSaliente` + `EventoEntrega` (outbox)
- `Job` (cola genérica SKIP LOCKED)
- `PlazoAlerta` (hitos T-7…T-0 + `escalamiento` con acuse)

`Plazo.alertaEnviada` se conserva como bandera legacy.

## Flujos

1. **Emitir** — las rutas dejan de hacer `prisma.notification.create` y llaman
   `emitNotification({ tipo, userId, title, body, … })`. Crea in-app + filas
   de outbox según preferencias, nivel de detalle y horas de silencio.
2. **Worker** — `POST /api/notify/worker` (cron) drena `MensajeSaliente` con
   `FOR UPDATE SKIP LOCKED`, leases de cinco minutos y compare-and-swap. Backoff 1m/5m/30m/2h, máx. 6 → `muerto`.
3. **Plazos** — `POST /api/plazos/alertas` y `/api/notify/escalamiento`
   generan hitos a las 09:00 Chile; sin acuse tras T-1 12:00 →
   `plazo.fatal.escalamiento` a socios y supervisores activos que pueden leer la causa.
4. **Acuse** — botón in-app, callback Telegram, `POST /api/notify/ack`.
5. **Telegram** — vinculación con código de un uso (15 min) →
   `https://t.me/<bot>?start=<code>`. Long-poll (`TELEGRAM_POLLING=1`);
   **no** hay webhook.
6. **Digest** — `POST /api/notify/digest` agrupa en sobres durables por usuario, destino y modo. La fecha programada de cada fila decide cuándo corresponde un diario o semanal; los reintentos conservan sus miembros. El worker entrega el sobre, no reenvía cada hijo por separado.
7. **Conciliación** — si el transporte empezó y el proceso cae sin confirmar la entrega, el aviso queda `incierto`. Configuración → Notificaciones → Envíos por revisar permite confirmar la recepción o autorizar el reenvío, con motivo, permiso `host.admin`, acceso vigente a la causa y auditoría transaccional. Un error explícito del proveedor se reintenta; una respuesta ambigua no se reenvía automáticamente.

## Variables de entorno

| Variable | Rol |
| --- | --- |
| `LEXOPEN_SECRETS_KEY` | Cifrado AES-GCM de tokens/destinos (fallback `SESSION_SECRET`) |
| `NOTIFY_WORKER_INTERVAL_MINUTES` | Scheduler outbox |
| `ESCALATION_INTERVAL_MINUTES` | Hitos + escalamiento (p. ej. 15) |
| `DIGEST_INTERVAL_MINUTES` | Digest diario |
| `TELEGRAM_POLLING` | `1` para poll en el worker |
| `NOTIFY_WORKER` | `0` para no drenar outbox desde `/api/plazos/alertas` |
| `NEXT_PUBLIC_PWA_DEV` | `1` para registrar SW también en `next dev` |
| `CRON_SECRET` | Autoriza rutas cron (igual que el resto del Host) |

SMTP / Telegram / VAPID se configuran en **Integración**
(`IntegrationConfig` provider `smtp` \| `telegram` \| `webpush`), no solo en env.
Gmail OAuth existente sigue como fallback de email si SMTP no está o falla.

## Schedulers (`scripts/local-host-schedulers.mjs`)

Además de PJUD/plazos/UF/correo:

- `NOTIFY_WORKER_INTERVAL_MINUTES` → `/api/notify/worker`
- `ESCALATION_INTERVAL_MINUTES` → `/api/notify/escalamiento`
- `DIGEST_INTERVAL_MINUTES` → `/api/notify/digest`

Poller dedicado opcional: `node scripts/telegram-poller.mjs`.

## Seguridad

- Secretos cifrados (`enc:s1:…`); nunca en logs (`redactSecrets`).
- Salidas HTTP vía `fetchSafeOutbound`.
- Payload **minimizado antes** de encolar (Telegram/push default `minimo`).
- Rate limit en vinculación Telegram.
- WhatsApp 1.2: consentimientos + webhook firmado (fuera de alcance aquí).

## Tests

```bash
tsx src/lib/notify/preferences.test.ts
tsx src/lib/notify/time.test.ts
tsx src/lib/notify/minimize.test.ts
tsx src/lib/notify/plazos-hitos.test.ts
tsx src/lib/notify/secrets.test.ts
tsx src/lib/notify/providers/whatsapp.test.ts
node --import tsx src/lib/notify/providers/webpush.test.ts
# PostgreSQL ficticio; el nombre debe terminar en _e2e:
E2E_DATABASE_URL=postgresql://.../lexopen_own_core_e2e node --import tsx src/lib/notify/notification-pipeline.integration.test.ts
# Con servidor E2E ya preparado:
E2E_BASE_URL=http://127.0.0.1:3210 npm run e2e -- e2e/notify-reconciliation.spec.ts
```

## Límites 1.1

- Sin WhatsApp de envío (stub `whatsapp_meta` / `whatsapp_twilio`).
- PWA: instalable + push; offline con cola de quick-add → 2.0.
- La entrega externa y la confirmación en PostgreSQL no forman una transacción distribuida. No se promete exactamente una entrega: los casos ambiguos requieren conciliación.
- Los handlers de la cola genérica `Job` deben ser idempotentes: una lease vencida puede ejecutar nuevamente su trabajo.
- Web Push admite los servicios de navegador declarados (Google, Mozilla, Apple y Windows), HTTPS y transporte sin redirecciones; un endpoint arbitrario no es un destino válido.
- Los hitos, avisos in-app y filas por destino se crean en una sola transacción con reintento serializable. Cada destino push tiene su propia clave; no se absorben errores de unicidad dentro de una transacción abortada.
- Tanto el acuse como el envío externo revalidan destinatario, muro ético y permisos vigentes del recurso. Un acuse solo corresponde a los hitos representados por sus avisos.
