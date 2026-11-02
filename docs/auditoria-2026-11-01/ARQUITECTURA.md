# Auditoría de arquitectura y capacidades — LexOpen main 72400f9

Fecha: 2026-11-01. Base: snapshot remoto `/private/tmp/lexopen-audit-main-20261101`, commit `72400f9`, package `1.0.0`. Revisión de código y documentación; posteriormente se ejecutaron probes con mocks, sin servicios externos ni datos reales: ver `/private/tmp/lexopen-main-privacy-probe.md`. Sustituye el diagnóstico inicial del checkout local `d9adee3`/0.1.9 cuando difieran. No equivale a certificación de runtime ni a suite verde actual.

Dirección confirmada por el usuario: reimplementar en LexOpen todas las capacidades funcionales identificadas de TRIFOLIA con implementación propia, local-first y proveedores de modelos intercambiables, incluida opción local. No es conexión, OAuth, dependencia operativa ni suscripción a TRIFOLIA. MCP y complemento Word serán propios de LexOpen; las fuentes oficiales externas son proveedores de datos.

## Estado real de main

Inventario: 56 modelos Prisma, 99 archivos de rutas API, 53 páginas, 109 archivos de prueba TypeScript en src, 9 especificaciones E2E. Son conteos de archivos, no de casos de prueba aprobados.

- Host local de un estudio: Next.js16/React19, Prisma5/PostgreSQL, storage local/S3, Electron opcional. No es SaaS multi-tenant ni multi-Host/HA. Organization no tiene relación de pertenencia con User/Causa/Cliente/Site; IntegrationConfig sigue único por proveedor.
- Ya existe Inicio `/inicio`: normalize → classify → resolve → plan → confirm → execute, con 24 herramientas registradas, confirmación de escrituras y tokens de deshacer. `/dashboard` permanece Panel KPI; `/agente` es la consola documental rica. Reutilizar ambas capas, no construir un tercer asistente. Fuentes: `docs/ASISTENTE.md`, `src/lib/assistant/types.ts:11-36`, `tools/registry.ts:26-50`.
- Ya existe Evento con audiencias/reuniones/recordatorios, calendario mes/semana/agenda y drag-and-drop. Calendar incluye push/update/delete de Evento, pull e ICS. `src/lib/integrations/google.ts:629-870`, `prisma/schema.prisma:1096-1129`.
- Ya existe UI1.0 con tokens, dark mode, shell agrupado, búsqueda rápida y ConfirmDialog. Evitar un rediseño general para integrar capacidades IA.
- Ya existen boot hard-fail de demos salvo KEEP explícito, logs estructurados, request IDs y límites de listas; CI incorpora migrate-diff. Fuentes: `src/lib/security/production-env.ts:12-52,89-104`, `.github/workflows/ci.yml:40-46`.
- Ya existen causas/CRM/trámites/minutas, documentos/OCR, espacios/wiki/blog/Q&A/iSheets/workflows, correo PJUD y facturación interna. No se presenta DTE/SII.
- La QA OJV más reciente declara corregidos B1-B8/B12 y B3/B4/B6, incluyendo unique movimientos, unique parcial de jobs activos y CAS Mis Causas. No reabrir estos hallazgos por leer el checkout 0.1.9. Queda B11 dedupe case-sensitive y PR#195 Solvecha separado según documentación; revisar GitHub para estado actual exacto. Fuente `docs/QA-FUNCIONAL-OJV.md`.

## Hallazgos aún presentes y prioridades

### P1 — Política «Solo LLM local» no centraliza la salida IA

`src/components/FirmSettingsForm.tsx:187-205` ofrece «Solo LLM local» y promete «nunca sale texto del usuario a un proveedor remoto». La política se pasa sólo a classifyIntents (`assistant/pipeline.ts:219-225`); classify usa reglas si local_only (`assistant/classify.ts:92`). Después, herramientas como `respuesta.libre` (`assistant/tools/respuesta-libre.ts:24-32`), `documento.resumir` (`tools/documento.ts:114-125`) y briefs llaman a askLlm directamente. `integrations/llm.ts:487+` carga el proveedor global y no consulta assistantLlmMode. Con proveedor remoto configurado, una lectura IA puede salir aun cuando clasificación esté en local_only.

Acción: política de salida central en la frontera LLM (no sólo en clasificador), distinguir proveedor local/remoto por destino confiable, proteger también confirm/reanudación y añadir prueba de turno completo que verifique cero llamadas remotas en local_only. La política actual tampoco escoge automáticamente un LLM local: sustituye sólo la clasificación por reglas.

### P1 — Recuperación OCR incompleta y no reintentable

`src/lib/document-processing-queue.ts:89-105` sigue fijando recoveryStarted=true antes de consultar sólo take:20. Cada nueva recuperación retorna si el flag está activo. Con más de20 pendientes al arrancar, el resto queda sin recuperar en ese proceso. Un fallo de consulta o storage tampoco restablece el flag. La cola mantiene bytes en memoria y concurrencia1; no hay claim durable por job. Health es quien dispara la recuperación.

Acción: trabajos persistidos con claim/lease y procesamiento paginado hasta drenar, reintentos/backoff y presupuesto de memoria. Prueba con21+ pendientes, caída intermedia y reinicio. Es prerrequisito para expedientes grandes y cronologías documentales fiables.

### P1 — Escrituras confirmadas no atómicas con auditoría

Persisten mutaciones de negocio seguidas de writeAuditStrict fuera de transacción. Crear plazo y activity y luego auditar: `src/app/api/plazos/route.ts:69-101`; actualizar plazo:119-129. Nueva tool crear Evento también hace create y después audit (`assistant/tools/evento.ts:49-70`). Si falla auditoría, el dato ya está guardado pero la respuesta indica error. executePlanSteps atrapa error por paso y continúa (`assistant/pipeline.ts:184-205`); confirmar consume antes el plan (`api/assistant/confirm/route.ts:25-38`), de modo que no hay reintento durable ni semántica clara de ejecución parcial.

Acción: negocio+auditoría en una transacción por comando; idempotency keys y estados de ejecución persistidos; plan multipaso debe comunicar y recuperar resultados parciales. Efectos externos por outbox. No es propuesta de convertir toda auditoría best-effort a strict: docs aprobadas mantienen best-effort donde es aceptado; se trata de consistencia donde ya se promete strict.

### P1/P2 — Undo no liga propietario ni versión y elude filtros en algunas tools

StoredPlan sí tiene ownerId; UndoPayload no (`assistant/plan-store.ts:106-160`). Undo route exige staff y resuelve herramienta, pero no comprueba roles declarados/propietario del token (`api/assistant/undo/route.ts:19-38`). Por ejemplo documento.undo actualiza por entityId sin confidentialWhere (`assistant/tools/documento.ts:192-205`); nota/evento undo tampoco compara versión. Un token compartido/recuperado por otro staff puede ejecutar la reversión; una reversión tardía puede borrar cambios de otro usuario. No se afirma filtración de tokens ajenos demostrada.

Acción: ownerId, role/ACL revalidada, entidad+versión esperada, consumo transaccional y auditoría; evitar consumir el token antes de validar tool/permiso. Pruebas con asistente sobre documento confidencial, usuario distinto y edición posterior.

### P2 — Calendar avanzado presente, con deuda concreta

Corregir diagnóstico antiguo: Evento guarda googleEventId y hace PUT/POST (`integrations/google.ts:693-722`); también hay pull e ICS. Sin embargo Plazo sigue enviándose con POST sin vínculo (`565-626`), por lo que reenvíos pueden crear duplicados. Pull lista maxResults250 y no procesa nextPageToken (`754-777`), busca por googleEventId con findFirst y luego create/update (`789-820`); el esquema sólo tiene String opcional, sin unique (`schema:1114`). Concurrencia puede duplicar importaciones. Conviene store de vínculo cuenta/calendario/id externo único, paginación, cancelaciones y reintentos.

### P2 — Retrieval documental parcial

Se mantiene ranking léxico por nombre/ruta/tipo/texto (`ai/document-context.ts:63-130`) sobre80 documentos recientes por causa (`context-pack.ts:95-109`). El documentoId singular SÍ se busca adicionalmente fuera del80 y se fija primero (`243-260,274-279`): no presentar ese caso como fallo. En cambio documentoIds múltiples/rutaPrefix se filtran sólo sobre el conjunto previo (`268-271`), con riesgo de omitir documentos antiguos de la selección o carpeta. No hay índice semántico, fragmentos por página, trazabilidad de citas a página ni retrieval de corpus jurídico oficial verificado.

Acción: capa común de fuentes/versiones/páginas/fragmentos + búsqueda híbrida; buscar selección explícita antes del límite; revalidar ACL en consulta y materialización; mostrar cobertura incompleta. Medir retrieval/citas y abstención con expediente de evaluación, no sólo pedir mejores prompts.

### P2 — Dominio documental duplicado

Documento se vincula con causa/cliente/OCR/Drive; SiteFile/FileVersion con espacio/carpeta/versiones. `schema.prisma:514-582`. Para integración TRIFOLIA, diseñar recurso documental común o vínculo normalizado, preservando IDs, originales, storageKeys y versiones. Los conectores Word, MCP y cronología deben operar sobre la misma identidad y ACL.

### P2 — Workflows, calendario jurídico y tasas

Workflows tienen disparadores automáticos reales, pero decisiones sólo mediante currentStep/último actor y JSON, sin historial por paso. Avance sin compare-and-swap (`api/workflows/route.ts:53-112`), start no comprueba active (`33-49`). Mejorar si se extienden aprobaciones; no inventar que esto forma parte de TRIFOLIA sin evidencia.

Plazos mantiene aproximaciones de feriados/materias (`lib/plazos.ts:59-86,107-119`): separar ayuda operativa de cómputo jurídico validado. Retención default0.1375 persiste (`lib/billing.ts:4-5`, `schema:30`); verificar tasa vigente con SII y usar vigencias por fecha. Esto es deuda propia de LexOpen; el mapa SII de TRIFOLIA corresponde a cartografía de inmuebles/parcelas y es una función distinta de DTE o tasa de boleta.

### P2/P3 — UX y observabilidad residual

SSE Inicio acumula eventos hasta que runAssistantTurn termina; `api/assistant/route.ts:55-60` espera y sólo después emite status/plan en86-92. Para progreso real se necesita callback/async generator. Mantener draft ante error, explicar qué fuentes se consultaron y qué acciones ya ocurrieron. Paginación actual es límite, no navegación cursor completa (`lib/api/list-limit.ts`). Docs PLAN* mezclan estados históricos «main sin Inicio», «versión0.1.9» con cabeceras actualizadas1.0: reescribir estado actual y preservar historia en sección separada.

## Correspondencia técnica para capacidades TRIFOLIA confirmadas por investigación externa

No se atribuyen CRM comercial, CLM o firmas a TRIFOLIA sin evidencia. La referencia proporcionada por investigadora es IA jurídica avanzada, Word, MCP, cronología, jurisprudencia y mapa SII de inmuebles/parcelas. El objetivo es paridad funcional mediante código propio LexOpen, sin conector o dependencia de la plataforma TRIFOLIA.

| Área | Reutilizar de LexOpen main | Extensión necesaria |
| --- | --- | --- |
| Asistente jurídico/Julia | Agente, fuentes de causa/carpeta, chat history, borradores, approve→minuta; Inicio operativo y tools | Unificar política, retrieval híbrido jurídico/documental, citas comprobables, cobertura y evaluaciones; evitar tercer chat |
| Cronología | Movimientos PJUD clasificados, minutas, plazos/Eventos y carpeta investigativa | Hechos extraídos de documentos por página, actores, precisión/incertidumbre temporal, contradicciones, evidencia asociada, revisión y exportación |
| Jurisprudencia/investigación | Modelo Jurisprudencia, ingest, buscar/brief IA | Conectores oficiales/admitidos, procedencia, actualización, filtros, semántica, citas verificables y estado vigente; corpus demo no es colección oficial |
| Word | AnyDoc importa DOCX a Markdown y mantiene original | Complemento Office, autenticación Host, selección/contexto, inserción revisable/control de cambios, exportación DOCX fiel y QA; importar DOCX no equivale a Word integrado |
| MCP | 24 tools tipadas con Zod + permisos + previews | Adaptador MCP que reutilice herramientas/ACL, scopes por usuario/expediente, confirmación de writes y auditoría; no hay servidor/transporte MCP en árbol |
| Mapa SII | Sin implementación equivalente; billing/UF no lo sustituyen | PropertyReference vinculado a causa/cliente/documento, rol predial/comuna, fuente cartográfica y geometría cuando esté disponible; capas de inmuebles/parcelas con procedencia, fecha y correspondencia documental; no inferir dominio/propiedad sólo del mapa |

## Orden de ejecución sugerido

1. Consolidar PR pendientes según auditoría GitHub; preservar1.0 y fixes OJV ya integrados. Corregir privacidad local_only, atomicidad/undo/OCR antes de ampliar entrada de expedientes.
2. Fuente/documento/version/página/fragmento/ACL común; migración aditiva con respaldo y ensayo de restauración, no reset de datos.
3. Incremento vertical de investigación: corpus oficial acotado → búsqueda híbrida → citas → respuesta y exportación; evaluación de precisión/cobertura/abstención.
4. Cronología revisable sobre ese mismo corpus y expediente; evidencias/citas trazables.
5. Word y MCP como adaptadores del dominio existente. Puede investigarse compatibilidad/auth en paralelo, pero no duplicar backend ni saltar confirmación.
6. Mapa SII de inmuebles/parcelas: PropertyReference, fuentes cartográficas oficiales, rol/comuna/geometría y vínculo documental. No confundir con DTE ni con mapa de normativa; confirmar acceso permitido y cobertura de la fuente oficial.
7. Piloto con expedientes grandes y datos ficticios; validación por roles, importación/reinicio, concurrencia, exportación y restore. Luego prueba externa opt-in con credenciales apropiadas.

## Pruebas y límites de evidencia

CI main ejecuta PostgreSQL16, migrate deploy+diff, npm test, integración transaccional, lint, build y Chromium E2E. Push sólo main/cursor; PR todos. E2E usa dev server, demo IA y CSRF relajado; añadir smoke de producción con CSRF real y flags cerrados. Estado actual de checks debe tomarse de GitHub; no inferir PASS por docs ni conteo de tests.

Se ejecutaron probes acotados de módulos originales con Prisma/fetch falsos: confirmaron local_only→POST proveedor configurado tanto en test como production, nota persistida tras fallo de auditoría y undo de usuario distinto sobre cambio posterior. Evidencia en `/private/tmp/lexopen-main-privacy-probe.md`. No se ejecutaron pruebas de navegador, egress remoto ni pruebas con credenciales. Los demás hallazgos son comprobaciones estáticas.
