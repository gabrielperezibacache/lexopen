# Auditoría de pull requests y continuidad de LexOpen

Fecha: 1 de noviembre de 2026, America/Santiago. Repositorio: [gabrielperezibacache/lexopen](https://github.com/gabrielperezibacache/lexopen). Base inspeccionada durante la auditoría: main 72400f9b9627cdc147ebf7c14a791c063747a686, versión 1.0.0. Al terminar esa auditoría, el checkout del usuario seguía en codex/audit-consolidation, d9adee3, versión 0.1.9, sin cambios funcionales ni de datos.

**Seguimiento:** por instrucción posterior del usuario, la implementación continúa en `codex/lexopen-own-core`. Los hallazgos y resultados de este documento describen los snapshots originales; su corrección y validación se registran en [Implementación del núcleo y fuentes propias](IMPLEMENTACION-2026-11-01.md). No interpretar el fallo histórico de un test como resultado del código corregido.

**Recomendación: corregir los bloqueantes de la base y de los PR 202 y 203 antes de integrarlos; después ampliar los servicios jurídicos de LexOpen.** La expansión necesita evidencia/documentos y permisos comunes. El [plan elaborado](PLAN-DESARROLLO-LEXOPEN.md) descompone esa implementación.

## 1 Cobertura de todos los PR

| Estado al consultar GitHub | Cantidad | Tratamiento |
| --- | ---: | --- |
| Integrados | 157 | Revisar implementación final y seguimientos; no volver a integrar las ramas |
| Cerrados sin integrar | 47 | Conservar historia y recuperar solo requisitos aún faltantes, mediante cambios nuevos |
| Abiertos | 2 | Revisión focalizada de código, controles, migraciones y checks; solicitar cambios |
| Total | 206 | Numeración 1 a 206, sin huecos |

Se descargaron los 206 diffs contra su base registrada: 2.957 entradas de archivos cambiados y 272.211 líneas de diff acumuladas. Son cambios con solapamientos, no tamaño de código único. Para todos hay inventario de estado, SHA, archivos, alcance y continuidad. La profundidad varía: triage de todos, lectura de fuente de cambios pequeños y revisión focalizada de seguridad/integridad/rendimiento en cambios grandes. **No es una revisión línea por línea de los 206 PR ni una recertificación de su CI histórico.** Los anexos señalan las revisiones parciales y las exclusiones de lockfiles, imágenes y material de scratch.

- [Inventario CSV por PR](auditoria-2026-11-01/pull-requests.csv).
- [Registro individual 1 a 99](auditoria-2026-11-01/PR-001-099.md).
- [Registro individual 100 a 201 y 204 a 206](auditoria-2026-11-01/PR-100-206.md).
- [Revisión 202](auditoria-2026-11-01/PR-202.md) y [revisión 203](auditoria-2026-11-01/PR-203.md).

## 2 Decisión sobre los dos PR abiertos

| PR y revisión exacta | Evidencia de GitHub | Decisión |
| --- | --- | --- |
| [202 Roles y equipo](https://github.com/gabrielperezibacache/lexopen/pull/202), HEAD 0193d410a5c5aa4d59c13432227ef9886c35c153; 9 commits | Dos checks build success; sin reviews registradas al consultar | Solicitar cambios: muro ético incompleto, 2FA evadible, capacidades de escritura sin aplicar y bulk de tareas sin controles suficientes |
| [203 Notificaciones](https://github.com/gabrielperezibacache/lexopen/pull/203), HEAD a5fcb72d41354683956c1002740ad4b7b283940e; 8 commits, 75 archivos | Dos checks build success; sin reviews registradas al consultar | Solicitar cambios: pérdida de avisos, acuses ajenos, falta de recuperación y rollback silencioso con varios dispositivos |

Los checks son evidencia del SHA consultado, no prueba de los invariantes ausentes de sus suites. No se enviaron reviews, comentarios ni solicitudes a GitHub; las decisiones son recomendaciones de esta auditoría. No hubo merges ni cierres.

La simulación local de combinación de los HEAD 202 y 203 produce conflictos en CHANGELOG.md, package.json y prisma/schema.prisma. Además hay solapamientos funcionales en tareas, trámites y minutas que Git puede combinar sin entender sus invariantes. Integrar secuencialmente: corregir base → corregir/rebasar 202 → adaptar 203 al equipo y muro ya corregidos → ensayar la combinación. No conservar la selección de destinatarios de escalamiento basada únicamente en admin y abogado si el modelo incorpora socio/supervisor.

## 3 Hallazgos prioritarios en main

P1 indica que debe resolverse antes de habilitar el flujo afectado o ampliar su superficie. P2 corresponde a seguimiento importante. Un riesgo deducido de fuente se distingue de una reproducción ejecutada.

| ID | Prioridad y efecto | Evidencia y límite | Corrección requerida |
| --- | --- | --- | --- |
| A01 | P1 Compilación limpia no validada | La alternativa oficial Webpack compiló código y falló en validación de rutas por export auxiliar mintTotpPendingToken en auth/totp/route.ts:237. Antes, tsc sin tipos generados había pasado. Turbopack no pudo completarse por red/puerto auxiliar del entorno | Mantener utilidades en lib/auth; limitar exports de route.ts a convenciones de Next instalado; repetir build completo desde instalación limpia |
| A02 | P1 Modo Solo LLM local puede construir envío remoto | Turno real del asistente con local_only y NODE_ENV=production alcanzó POST al proveedor falso con el texto íntegro. Fetch fue interceptado: cero red/BD real | Gate central en frontera LLM para clasificación y todas las herramientas; proveedor local permitido, remoto bloqueado |
| A03 | P1 Escritura persiste aunque auditoría informa aborto | Herramienta real de nota con Prisma simulado conserva nota después del fallo de auditoría; pagos/plazos muestran el mismo orden no transaccional en fuente | Transacción dominio+actividad+auditoría, idempotencia y ejecución de planes con estados recuperables |
| A04 | P1 Deshacer sobrescribe ediciones posteriores | Herramienta real con fixture en memoria permitió undo por otro usuario con token y restauró contenido sobre una edición posterior; no se demostró robo del token | Dueño, autorización vigente, versión esperada y consumo atómico; conflicto ante edición posterior |
| A05 | P1 Reconfigurar TOTP desactiva el factor vigente | Fuente auth/totp/route.ts:152-159 cambia secret y totpEnabled=false con sesión, sin pedir código anterior; disable sí pide código | Guardar secreto pendiente separado; confirmar antes de sustituir; proteger reenrolamiento y rotar sesiones |
| A06 | P1 Búsqueda de portal revela tareas internas | Search:114-130 consulta tareas por espacio sin assigneeId; la ficha restringe tareas propias | Compartir predicado de visibilidad en lista, búsqueda, contexto y exportación; prueba negativa con cliente |
| A07 | P1 Recuperación OCR se detiene en 20 | document-processing-queue.ts:89-105 fija bandera permanente antes de buscar take20; siguientes llamadas no continúan. Revisión estática | Jobs persistidos, paginación y leases; recuperar 21/201 y fallos de storage/reinicio |
| A08 | P1 Compatibilidad LAN HTTP rota para avisos/minutas | Expresiones de PR 204 y 145 con crypto.randomUUID reproducidas en Chromium: indefinido en origen HTTP de LAN, disponible en localhost. No fue sesión completa de LexOpen entre dos PC | ID de interfaz compatible con modos admitidos, detección de capacidad y prueba LAN/HTTPS |
| A09 | P1 Antes de upgrade, dedupe 201 puede descartar información divergente | SQL elimina repetidos por clave, conserva el más antiguo sin fusionar campos/documentos ni archivarlos. No se afirma pérdida ya ocurrida en una instalación real | Preflight de conflictos, respaldo/archivo, política de consolidación y prueba PostgreSQL; preservar historial de jobs |
| A10 | P2 Benchmark 87 escribe en la BD configurada | salas-benchmark crea500 causas, opera cartera sin scope, cleanup fuera de finally y salida0 ante error. No se ejecutó | Guard obligatorio de BD desechable, IDs ficticios acotados y cleanup/rollback; excluirlo de uso normal |
| A11 | P2 Rendimiento SQL anunciado sin evidencia suficiente | Distinct y relación take1 de 206 no demuestran LATERAL ni selección por cliente en SQL con Prisma5.22 sin las capacidades relevantes | Registrar SQL, filas/memoria y EXPLAIN con fixture; índice y consulta adecuados, sin cifras no medidas |
| A12 | P2 Retrieval, calendario y workflows aún parciales | Selección múltiple/carpeta limitada por top80; Plazo Calendar sin mapping; pull Evento sin paginar más de250; workflows sin CAS/historial por decisión | Base de evidencia y recuperación; mapping único/paginación; estados de workflow versionados |

Fuentes de código para A01/A05: [ruta TOTP actual](https://github.com/gabrielperezibacache/lexopen/blob/72400f9b9627cdc147ebf7c14a791c063747a686/src/app/api/auth/totp/route.ts#L152). Para A02: [respuesta libre](https://github.com/gabrielperezibacache/lexopen/blob/72400f9b9627cdc147ebf7c14a791c063747a686/src/lib/assistant/tools/respuesta-libre.ts#L24). Para A07: [recuperación documental](https://github.com/gabrielperezibacache/lexopen/blob/72400f9b9627cdc147ebf7c14a791c063747a686/src/lib/document-processing-queue.ts#L89). Los anexos incluyen las demás rutas y líneas, vinculadas a su snapshot.

La afirmación de A01 se limita al resultado local observado. El PR 206 muestra CI build success en su HEAD f402d963618124b93e329c3f19017747361c7d38; no se investigó la diferencia completa entre entornos. No se presenta el fallo ambiental de Turbopack como defecto de la aplicación. El error de export de ruta apareció después de compilar con Webpack y sí requiere resolver o explicar antes de declarar un build limpio reproducible.

## 4 Bloqueantes del PR 202

1. **Muro ético incompleto.** Proteger la ficha de causa no protege los documentos binarios, búsqueda, tareas ni contextos que se alcanzan por rutas alternativas. Una cuenta excluida puede seguir obteniendo contenido no marcado confidencial por ID. Evidencia estática en HEAD revisado.
2. **2FA obligatorio solo en proxy.** El matcher omite solicitudes con cabeceras prefetch, mientras requireUser no repite la política. La implementación real del matcher de Next confirmó que esas cabeceras omiten el control; falta prueba HTTP autenticada completa.
3. **Lectura usada como autorización de escritura.** Causa PATCH usa acceso de lectura y no la capacidad causa.write; contabilidad o revoke de escritura no se aplican de forma consistente.
4. **Bulk de tareas por IDs sin ACL de causa.** El PATCH masivo omite controles nuevos, historia y transición; el individual también requiere revisión de origen/destino.

También quedan espejos Task/Tramite/MinutaAccion unilaterales y aprobaciones sin compare-and-set/expiración efectiva. Los E2E de roles son smoke de UI, no matriz negativa del muro. [Detalles y aceptación](auditoria-2026-11-01/PR-202.md).

## 5 Bloqueantes del PR 203 reproducidos

Las siguientes pruebas ejecutaron funciones originales contra PostgreSQL16 temporal. Se usaron usuarios, plazos y suscripciones ficticios; no hubo envío externo.

| Invariante | Resultado observado |
| --- | --- |
| Hito y aviso deben confirmarse juntos | Al inyectar fallo en notification.create, el hito quedó guardado. Reintentar dejó2 hitos y la notificación T-3 siguió ausente |
| Solo un destinatario autorizado acusa su plazo | Un usuario cliente sin relación acusó2 hitos del abogado mediante ackPlazo; la ruta acepta ese plazoId sin control adicional |
| Un envío interrumpido debe recuperarse | Fila enviando con lockedAt antiguo: siguiente lote reclamó0 y la dejó atascada |
| Varios dispositivos no deben perder la notificación | Dos destinos push colisionan en dedupe por canal; función devolvió mensajes=1 y notificationId, pero no persistió ni aviso ni mensajes |

La última prueba demuestra rollback silencioso después de capturar una violación de unicidad dentro de una transacción PostgreSQL abortada. Debe deduplicarse por destino y manejar el conflicto sin continuar una transacción fallida. [Informe completo](auditoria-2026-11-01/PR-203.md), con paginación, digest, escalamiento y revisión outbound como seguimientos.

## 6 Lo que conviene conservar

La auditoría no justifica reiniciar el producto. Main ya contiene Inicio con24 herramientas y confirmación, Agente documental, calendario Evento con push/pull/ICS, UI1.0 y modo oscuro, controles de entorno productivo, logs, límites de listas y migraciones comprobadas. Roles/notificaciones agregan piezas válidas que necesitan completar invariantes.

Los cambios OJV 200 y201 mejoran el matching de tribunal/RIT, unicidad y claim. Su implementación requiere pruebas reales de migración/concurrencia, sin volver a listar los fallos ya corregidos como si siguieran pendientes. Solvecha195 ya está integrado; la documentación de QA conserva texto histórico que debe aclararse. No se verificó acceso vivo a OJV/ClaveÚnica ni resolución de CAPTCHA.

Las mejoras de agregados, consultas concurrentes, estados de carga y accesibilidad se conservan. Los rótulos HIGH/CRITICAL y cifras de aceleración de los autores no se adoptan automáticamente: una mejora de IDs visuales no demuestra un fallo de autenticación, y una prueba de regex no mide filas SQL ni carreras de BD.

## 7 Validación realizada

| Comprobación en copia aislada | Resultado |
| --- | --- |
| npm ci y cliente Prisma de main | Correctos |
| npm test main | Exit0; utilidades, contratos, scripts y pruebas existentes de la cadena configurada |
| npm run lint main | Exit0 |
| npx tsc sin tipos Next generados por build | Exit0; alcance insuficiente para validar exports de rutas |
| Migraciones main sobre PostgreSQL16 nuevo | Correctas |
| npm run test:integration main | Exit0; rollback, concurrencia de alertas y atomicidad de contraseña/auditoría |
| Build Turbopack | Incompleto: primero tipografías por red; después puerto auxiliar rechazado por entorno |
| Build Webpack oficial | Compilación de código completada; fallo de validación por export auxiliar TOTP; build no aprobado |
| Migraciones PR203 en BD nueva | Correctas; no demuestra upgrade de datos existentes |
| Cuatro probes de PR203 con BD | Fallos reproducidos descritos arriba |
| Modo local_only con turno real y fetch interceptado | Intento remoto reproducido incluso con NODE_ENV=production; cero egress real |
| Auditoría/undo con herramientas reales y Prisma en memoria | Inconsistencias reproducidas; no prueba transaccional PostgreSQL de esas herramientas |
| Crypto.randomUUID en Chromium | Incompatibilidad HTTP LAN reproducida en fixture |
| Matcher 2FA de Next | Exclusión por prefetch reproducida; sin HTTP/BD |
| E2E completo y prueba productiva de todos los módulos | No ejecutados en esta auditoría |
| Word, MCP y servicios externos con cuentas reales | No autenticados ni probados; investigación documental únicamente |

[Evidencia conservada](auditoria-2026-11-01/evidencia/README.md). El PostgreSQL temporal de auditoría se detiene al finalizar. No se usó la base de una instalación real, no se ejecutó el benchmark riesgoso y no se modificaron secretos.

## 8 Cómo continuar

La primera entrega debe hacer reproducible el build y cerrar privacidad, autorización, transacciones/undo, recuperación y upgrade. Después integrar las partes corregidas de202 y203 como una unidad comprobada. Un CI verde aislado y un merge sin conflicto no bastan.

La siguiente inversión es una capa común de originales/versiones/páginas/fragmentos/citas, con permisos y jobs durables. De ella dependen investigación jurídica propia, cronología, contradicciones, biblioteca y redacción. Word y MCP serán adaptadores propios de esos servicios; cartografía SII se vinculará a inmuebles y documentos. El [plan de desarrollo](PLAN-DESARROLLO-LEXOPEN.md) incluye fases, historias, calendario orientativo, dependencias y aceptación para cada capacidad pública identificada.
