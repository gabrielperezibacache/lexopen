# Pruebas acotadas de privacidad e integridad — main72400f9

Fecha: 2026-11-01. Snapshot `1.0.0` en `/private/tmp/lexopen-audit-main-20261101`. Se importaron módulos originales sin modificarlos; Prisma y fetch se sustituyeron en memoria antes de la importación. Datos, usuarios y proveedor son ficticios. Cero solicitudes a base real; cero solicitudes de red, DNS o sockets de proveedor. La primera invocación por CLI tsx falló por su socket IPC (EPERM); `node --import tsx` evitó ese IPC y permitió las pruebas.

## P1 confirmado — local_only aún envía el texto al proveedor configurado

Script: `/private/tmp/lexopen-main-egress-probe.ts`.
Evidencia JSON: `/private/tmp/lexopen-main-egress-probe-production-result.json`.
Primera ejecución en entorno test: `/private/tmp/lexopen-main-egress-probe-result.json`.

Comando reproducible desde el snapshot:

```sh
PROBE_NODE_ENV=production TSX_TSCONFIG_PATH=/private/tmp/lexopen-audit-main-20261101/tsconfig.json node --import tsx /private/tmp/lexopen-main-egress-probe.ts
```

El script configura un proveedor de documentación ficticio `https://203.0.113.10/v1` con clave sintética. Intercepta global.fetch antes de cargar la aplicación, valida URL exacta y devuelve una respuesta fabricada. Así se recorre la frontera HTTP original sin efectuar egress.

Entrada: «Explícame el concepto de confidencialidad profesional». FirmSettings falso devuelve assistantLlmMode=`local_only`, auditLlmPrompts=false y hermesAllowDemo=false. Se ejecuta runAssistantTurn original con usuario ficticio abogado y NODE_ENV=production.

Resultado comprobado con asserts, proceso exit0:

```json
{
  "nodeEnv": "production",
  "firmPolicy": "local_only",
  "classificationSource": "rule",
  "selectedTools": ["respuesta.libre"],
  "interceptedProviderRequests": [{
    "url": "https://203.0.113.10/v1/chat/completions",
    "method": "POST",
    "userMessage": "Explícame el concepto de confidencialidad profesional"
  }],
  "toolResult": {"ok": true, "message": "SYNTHETIC_PROVIDER_RESPONSE", "source": "llm"},
  "realNetworkRequests": 0,
  "realDatabaseRequests": 0
}
```

No se hizo sólo una llamada directa a askLlm: el turno completo leyó la política local_only, clasificó mediante reglas y ejecutó automáticamente respuesta.libre, que alcanzó el POST del proveedor configurado con texto íntegro. Por tanto la restricción sólo protege la clasificación, no las herramientas siguientes. La UI promete «nunca sale texto del usuario a un proveedor remoto» (`src/components/FirmSettingsForm.tsx:196`). Referencias causales: `assistant/pipeline.ts:219-225,280-294`; `assistant/classify.ts:92`; `assistant/tools/respuesta-libre.ts:24-32`; `integrations/llm.ts:487-495,552-573`.

La prueba demuestra un intento de salida construido y completado mediante respuesta falsa; no afirma fuga histórica real ni contacta a ningún proveedor. Se reprodujo tanto en test como en production con el mismo resultado. La posibilidad de que configuración de red del Host bloquee luego esa salida no corrige el incumplimiento del modo local_only.

Aceptación mínima: modo local_only debe permitir operaciones deterministas y LLM local permitido, y bloquear antes de materializar envío cualquier endpoint remoto en clasificador, herramientas de lectura, confirmación de plan y reanudación. Prueba con fetch espía que falle si se intenta URL remota; confirmar cero intentos con prompts de fallback, resumen y brief. remote_allowed debe mantener el flujo legítimo.

## P1 confirmado — mutación sobrevive al fallo de auditoría

Script del agente de integridad, reejecutado aquí: `/private/tmp/lexopen-assistant-integrity-probe.ts`. Utiliza modelos en memoria, auditEvent.create lanza un error ficticio, notaCrearTool original hace create antes de writeAuditStrict.

Salida:

```json
{"probe":"audit failure","returnedError":"No se pudo registrar la auditoría; la operación se abortó","noteStillExists":true}
```

Así la respuesta afirma operación abortada aunque existe la nota. Aceptación: fallo de auditoría deja cero cambios de dominio/activity; reintento con idempotency key no duplica. No se propone alterar la decisión aprobada de best-effort en otros módulos.

## P1/P2 confirmado — undo de otro usuario pisa una edición posterior

El mismo script fabrica token undo de nota.editar con versión original, introduce un cambio posterior «Cambio posterior por colega» y llama a notaEditarTool.undo con `user-B`, rol asistente. Payload no contiene propietario ni versión; la herramienta original restaura por id.

Salida:

```json
{"probe":"undo from another user after newer edit","result":{"ok":true,"message":"Se restauró la nota ..."},"contentAfter":"original"}
```

Se confirmó ejecución como un usuario distinto y pérdida de cambio posterior con el token. La prueba no demuestra robo/exposición de token: éste se entrega explícitamente como parte del fixture. ownerId y expectedVersion no existen en UndoPayload (`assistant/plan-store.ts:138-160`); actualizar por id sin CAS explica la reproducción (`assistant/tools/nota.ts:169-185`). Aceptación: token ligado a dueño/entidad/acción, ACL actual, versión esperada; denegar usuario distinto y conflicto409 si hubo edición posterior; no consumir token antes de validar permisos; negocio+consumo+auditoría atómicos.

## Orden recomendado dentro del primer sprint

1. Gate central de salida LLM con política local_only y pruebas de turno completo.
2. Comandos transaccionales negocio+auditoría, idempotencia y estados de ejecución parcial del plan.
3. Undo con owner/ACL/versionado y consumo atómico; probar cambio de rol, contenido confidencial y edición concurrente.
4. Recuperación OCR paginada con leases/reintentos; prueba con21+ pendientes y reinicio.
5. Repetir suite existente y smoke build de producción con CSRF real, políticas de IA y datos ficticios.

Estas reproducciones justifican volver sobre las líneas del asistente introducidas en PR#151 antes de ampliar sus conectores Word/MCP. No se modificó aplicación ni base de datos reales.
