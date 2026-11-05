# Asistente operativo e Inicio

LexOpen 1.0 separa dos superficies de IA para el staff del estudio:

| Superficie | Ruta | Rol |
| --- | --- | --- |
| **Inicio** | `/inicio` | Home post-login del staff: saludo Chile-time, status del Host (plazos fatales, audiencias, movimientos), composer con tools tipados y **confirmación humana** en escrituras. |
| **Panel** | `/dashboard` | KPIs y métricas del estudio (no es el home). **No** redirige a `/inicio`. |
| **Agente** | `/agente` | Consola completa del copiloto (context pack, utilidades, alcance documental, approve→minuta). Reutiliza `lib/ai/*` y `/api/integrations/hermes`. |
| **Portal** | `/portal` | Clientes: sin asistente staff. |

## Pipeline de Inicio (`src/lib/assistant/`)

1. **Normalize** — es-CL / America/Santiago, RIT/ROL/RUC.
2. **Classify** — JSON multi-intent (Zod) + fallback por reglas si no hay LLM o `FirmSettings.assistantLlmMode = local_only`.
3. **Resolve / plan** — búsqueda con ACL; plan ordenado server-side.
4. **Confirm** — escrituras requieren `POST /api/assistant/confirm` (planId).
5. **Execute** — tool registry + `writeAuditStrict` + cards / undo.

APIs: `POST /api/assistant`, `POST /api/assistant/confirm`, `POST /api/assistant/undo`.
Misma superficie de seguridad que el resto del Host (sesión, CSRF, RBAC, rate-limit).

## Configuración del estudio

En **Configuración → Asistente / IA** (`FirmSettings`):

- `assistantLlmMode`: `local_only` \| `remote_allowed`
- `auditLlmPrompts`: si está activo, la auditoría puede guardar prompts completos (default off)

`local_only` se comprueba en la frontera común del proveedor: Inicio, Agente,
resúmenes, briefs y pruebas de conexión no envían texto a modelos remotos. Permite
un modelo configurado en loopback (`localhost`/`127.0.0.1`/`::1`); si el endpoint
configurado es remoto, la acción explica el bloqueo antes de realizar el envío.

## Confirmación, recuperación y deshacer

Los planes y sus resultados parciales se conservan en PostgreSQL durante su
vigencia. Cada paso de escritura confirma juntos el cambio, la actividad, la
auditoría y un recibo de ejecución. Repetir la confirmación del mismo plan recupera
los recibos ya guardados y reintenta los pasos pendientes sin duplicar acciones.
Un plan detenido por un cierre del proceso puede recuperarse tras vencer su lease.

Deshacer requiere el mismo usuario, permisos actuales y el mismo estado que dejó
la acción original. Si alguien modificó el recurso después, se informa un conflicto
y se conserva su trabajo. La reversión, el consumo del token y su auditoría se
confirman en una transacción; el token no se consume al fallar la autorización.

Las API de pagos y plazos aceptan `Idempotency-Key`; debe conservarse al reintentar
la misma operación. La misma clave con datos diferentes se rechaza.
Los formularios conservan esa clave incluso después de una respuesta perdida y
una recarga en la misma pestaña; guardan sólo la clave y una huella compacta del
envío. La rotan tras confirmar éxito o al cambiar los datos del envío.

Las tareas del asistente usan el servicio común de pendientes, incluido su
historial y sus espejos. Completar una tarea recurrente no ofrece deshacer: la
siguiente ocurrencia se gestiona desde Pendientes.

Al reabrir o reutilizar un chat se comprueba de nuevo el acceso a sus fuentes.
Un historial antiguo sin procedencia verificable se conserva, pero requiere
iniciar un hilo nuevo para evitar reintroducir material fuera de los permisos
actuales. El administrador técnico no hereda acceso a chats de otras personas.

La selección documental se aplica antes del límite de contexto (120 documentos),
por lo que una carpeta antigua o una selección explícita no queda desplazada por
archivos recientes de otras carpetas. Cuando el alcance excede el límite, la
respuesta anuncia su cobertura parcial; no implica lectura de todo el expediente.

## Conexión con la IA del estudio

- Inicio reutiliza `lib/integrations/llm.ts`, plazos, search, chat-history y dominio existente.
- `/agente` sigue siendo la consola rica para briefing, doc QA y utilidades ancladas.
- En producción, demos `LLM_ALLOW_DEMO` / `HERMES_ALLOW_DEMO` hard-fail al boot salvo `LEXOPEN_KEEP_*_DEMO=1` (ver `docs/WEB-HOST.md`).

## Calendario y Evento

El asistente puede crear/mover **Eventos** (modelo Prisma `Evento`). El calendario
(`/calendario`) unifica plazos, tareas, audiencias y eventos (mes / semana /
agenda, drag-and-drop). Google Calendar: push, pull e ICS.

## Límites honestos

- El asistente es **operativo**, no asesoría jurídica automatizada.
- Escrituras siempre con confirmación humana.
- PJUD, Google y LLM remoto son opt-in / configurables; fallan closed en prod sin credenciales.
