# Asistente operativo e Inicio

LexOpen 1.0 separa dos superficies de IA para el staff del estudio:

| Superficie | Ruta | Rol |
| --- | --- | --- |
| **Inicio** | `/inicio` | Home post-login del staff: saludo Chile-time, status del Host (plazos fatales, audiencias, movimientos), composer con tools tipados y **confirmación humana** en escrituras. |
| **Panel** | `/dashboard` | KPIs y métricas del estudio (no es el home). **No** redirige a `/inicio`. |
| **Agente / Hermes** | `/agente` | Consola completa del copiloto (context pack, utilidades, alcance documental, approve→minuta). Reutiliza `lib/ai/*` y `/api/integrations/hermes`. |
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

## Relación con Hermes / LLM

- Inicio **no** reescribe el pipeline Hermes: reutiliza `lib/integrations/llm.ts`, plazos, search, chat-history y dominio existente.
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
