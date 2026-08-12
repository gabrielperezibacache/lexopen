# PJUD / CausaMonitor parity

LexOpen replica la **experiencia operativa** de CausaMonitor (cartera con
semáforos, cuadernos, receptor, escritos, sync, fallidos y próximo sync) sin
clonar su scraper ni custodiar ClaveÚnica.

## Conectores admitidos

| Modo | Cómo | Etiqueta |
|------|------|----------|
| Partner API | `PJUD_API_URL` + opcional `PJUD_API_KEY` | `fuente=pjud` |
| Webhook | `PJUD_WEBHOOK_SECRET` → `POST /api/integrations/pjud/webhook` | `fuente=pjud` |
| CSV oficial | Export OJV / consulta pública → import en ficha | `fuente=import` |
| Demo | `PJUD_ALLOW_DEMO=1` (o no-prod) | `fuente=demo` + nota visible |

## Contrato partner `GET /causas/lookup?rit=&tribunal=`

```json
{
  "sala": "Sala 1",
  "movimientos": [
    {
      "id": "ext-1",
      "titulo": "Notificación receptor: cédula",
      "detalle": "…",
      "fecha": "2026-08-12",
      "referencia": "NR-1",
      "cuaderno": "Principal",
      "folio": "5",
      "etapa": "Notificación",
      "tramite": "Cédula",
      "esReceptor": true,
      "documentoRef": "receptor/NR-1"
    }
  ]
}
```

## CSV

```text
titulo,detalle,fecha,referencia,id,cuaderno,folio,etapa,tramite,receptor,documento
```

`receptor` acepta `1|true|si|sí|yes|x|receptor`.

## Cola de fallidos

Cada sync crea un `PjudSyncJob`. Errores quedan en `/causas/monitoreo` con
reintento (`action: "retry-fallidos"`) o por causa (`action: "retry"` en
`/api/causas/:id/pjud`).

## Qué no hace LexOpen

- Scrapear `ofpj.pjud.cl` de forma oculta
- Pedir o almacenar credenciales ClaveÚnica
- Presentar el modo demo como datos oficiales
