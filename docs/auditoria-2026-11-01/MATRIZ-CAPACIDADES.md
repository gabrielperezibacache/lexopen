# Matriz histórica de capacidades de LexOpen

Fecha original: 1 de noviembre de 2026. Base auditada: `main@72400f9`, versión 1.0.0. Edición documental: 2 de noviembre de 2026.

Este inventario se elaboró a partir de investigación pública y auditoría del repositorio. Conserva 58 IDs de planificación para seguir las épicas y las entregas. Las capacidades son objetivos de desarrollo; no constituyen un listado de funciones implementadas o probadas.

Los estados de la base corresponden al corte histórico indicado, no a la versión actual. E0 a E10 y F0 a F7 remiten al [plan de desarrollo](../PLAN-DESARROLLO-LEXOPEN.md). El [seguimiento de implementación](../IMPLEMENTACION-2026-11-01.md) documenta el primer incremento; el [plan maestro](../PLAN-MAESTRO-LEXOPEN-2026-11-02.md) recoge las etapas posteriores.

## Capacidades y aceptación

| ID | Capacidad planificada | Base auditada al 1 de noviembre | Épica y fase | Aceptación prevista |
| --- | --- | --- | --- | --- |
| T01 | Consulta jurídica en lenguaje natural | Agente parcial | E2 · F2 | Consulta con alcance y fuentes identificadas. |
| T02 | Investigación combinada sobre cuatro clases de fuentes | Sin búsqueda federada completa | E2 · F2 | Orquestar legislación, jurisprudencia, documentos administrativos y doctrina; indicar cobertura real. |
| T03 | Respuestas con citas y enlaces al original | SourceChip y contexto parciales | E1/E2 · F1/F2 | Cada cita abre original, versión y localización comprobada; bloquear referencias inexistentes. |
| T04 | Análisis de precedentes y legislación aplicable | Briefs parciales | E2 · F2 | Contrastar precedentes y normas con fecha relevante y evidencia; mostrar resultados contrarios. |
| T05 | Borradores de escritos descargables | Minutas y borradores parciales | E4 · F4 | Borrador versionado y revisable con exportación propia y datos faltantes visibles. |
| T06 | Análisis de contratos, demandas y fallos adjuntos | Lectura y resumen parciales | E3/E4 · F3/F4 | Análisis por documento/selección, citas y observaciones revisables sin cambiar original. |
| T07 | Jurisprudencia PJUD: Suprema, Apelaciones, civil, penal, familia, laboral y cobranza | Corpus local y carga manual | E2 · F2 | Conector/corpus propio por órgano y materia; consulta pública separada de causas privadas OJV. |
| T08 | Legislación de LeyChile | Sin conector completo de legislación | E2 · F2 | Texto y versión normativa con fuente oficial y fecha relevante verificables. |
| T09 | Documentos y decisiones de CGR, DT, SII, CMF, FNE, TDLC, SMA, ambientales, TC, TTA y SUSESO | Sin cobertura completa de organismos | E2 · F2 | Ficha de viabilidad y pruebas por organismo; no declarar conjunto listo con búsqueda genérica. |
| T10 | Doctrina mediante buscador externo restringido a fuentes académicas chilenas | Sin conector académico propio | E2 · F2 | Buscar fuentes académicas permitidas con autor, publicación, enlace y límite de texto visible. |
| T11 | Cartografía pública SII para inmuebles | Ausente | E9 · F6 | Cartografía inmobiliaria con fuente, atribución y fecha; fallback explícito si no hay datos. |
| T12 | Expediente con documentos, cronología y conversaciones | Causas, movimientos y chat parciales | E3 · F3 | Un expediente con hechos documentales, conversaciones y permisos sobre derivados. |
| T13 | Ingesta PDF, Word y texto | Ingestión existente, por endurecer | E1 · F1 | PDF/DOCX/texto conservan original; límite propio medido y estados de procesamiento visibles. |
| T14 | Importación de documentos desde Google Drive | Drive actual no acredita importador elegido | E1 · F1 | Selector e importación de archivos elegidos, identidad externa y nuevas versiones sin duplicación. |
| T15 | Descripción automática de cada documento | Resumen bajo solicitud | E1/E3 · F1/F3 | Descripción persistida y versionada por extracción, revisable y enlazada a original. |
| T16 | Extracción automática de hechos y fechas | Sin hechos estructurados | E3 · F3 | Fecha literal/normalizada, precisión, actores y fragmento de origen; incertidumbre visible. |
| T17 | Cronología que se actualiza al agregar documentos | Sin cronología documental incremental | E3 · F3 | Agregar documento genera propuestas nuevas sin duplicar ni borrar correcciones humanas. |
| T18 | Cada hecho enlazado a documentos de origen | Sin relación FactEvidence | E1/E3 · F1/F3 | Todo hecho propuesto abre su versión y página o párrafo; conservar trazabilidad. |
| T19 | Destacar u ocultar hechos de la cronología | Ausente para hechos | E3 · F3 | Destacar/ocultar/editar hecho con autor e historial sin borrar evidencia original. |
| T20 | Preguntas y detección de contradicciones entre documentos | Q&A parcial; comparación no estructurada | E3 · F3 | Contradicción muestra ambos fragmentos y admite revisión/rechazo; Q&A respeta alcance. |
| T21 | Invitaciones por correo y caso compartido | Miembros/espacios parciales | E8 · F5 | Invitación elegida, aceptación y revocación; prueba de acceso por invitado y tercero. |
| T22 | Inmuebles detectados en documentos y parcelas en mapa | Ausente | E9 · F6 | Rol/comuna candidato desde documento, revisión y enlace a parcela; no afirmar dominio. |
| T23 | Acceso al caso para dueño e invitados | Permisos de espacio; muro202 incompleto | E8 · F5 | Dueño/invitados autorizados y equipo definido; búsqueda, derivados y descargas coherentes. |
| T24 | MCP remoto para asistentes compatibles | Sin servidor MCP | E7 · F5 | Servidor MCP de LexOpen compatible con los clientes objetivo y sus permisos. |
| T25 | Acceso autorizado por cuenta y revocable | Sesiones web; auth MCP ausente | E7 · F5 | Identidad y scopes propios por usuario/expediente; revocar credencial corta llamadas. |
| T26 | Las cuatro búsquedas jurídicas mediante MCP | Sin herramientas de cuatro fuentes completas | E2/E7 · F2/F5 | Exponer búsquedas propias autorizadas en MCP con el mismo contrato de evidencia. |
| T27 | Presupuesto medible de consultas | Sin presupuesto común de investigación | E5/E7 · F2/F5 | Contabilizar consultas/tokens/tiempo localmente; detener al alcanzar límite configurable. |
| T28 | Panel con detalle de actividad MCP | Auditoría general parcial | E7 · F5 | Registro propio de llamadas, resultado/costo y errores; contenido sensible minimizado. |
| T29 | Presupuesto de consultas del equipo | Ausente como presupuesto de equipo | E7/E8 · F5 | Presupuesto compartido configurable de recursos; no replicar paquete comercial obligatorio. |
| T30 | Panel de investigación dentro de Word Microsoft 365 | Ausente | E6 · F4 | Panel Word LexOpen usa servicios propios y conserva fuentes/contexto aprobado. |
| T31 | Lectura del documento mediante autorización por documento | Ausente en Office | E6 · F4 | Leer selección/documento solo tras autorización explícita y mostrar alcance. |
| T32 | Inserciones y correcciones como cambios rastreados | Ausente | E6 · F4 | Inserciones/correcciones como propuestas y cambios rastreados verificables por plataforma. |
| T33 | Detección de texto cambiado durante una respuesta | Ausente; undo actual sin CAS | E6 · F4 | Ancla/hash de lectura; edición posterior impide sobrescritura y permite recalcular. |
| T34 | Compatibilidad Word Windows, Mac y web | No verificado | E6 · F4 | Matriz real Word Windows/Mac/web por API soportada y alternativa explícita. |
| T35 | Equipos con miembros, actividad y registros económicos | Usuarios/grupos/billing interno parciales | E8 · F5 | Administrar miembros, actividad y recursos; cobros comerciales de suscripción fuera del objetivo local. |
| T36 | Documentos e instrucciones comunes por caso | Wiki/contexto parcial | E3/E8 · F3/F5 | Documentos e instrucciones por expediente, versionadas y con permisos; distinguir contenido de política. |
| T37 | Visibilidad del propietario sobre actividad y conversaciones | Auditoría parcial; supervisión por definir | E8 · F5 | Política visible de acceso a conversaciones/actividad; muro limita también administradores técnicos. |
| T38 | SSO Google Workspace, Entra ID u Okta; dominio verificado | OAuth Google de integración no es SSO | E8 · F5 | Adaptadores de identidad propios y dominio verificado; baja corporativa revoca acceso. |
| T39 | Acceso al equipo por dominio verificado | Ausente | E8 · F5 | Aprovisionamiento opcional por dominio validado y cupo; no conceder causas por dominio solo. |
| T40 | Biblioteca personal reutilizable | Documentos/carpetas; colección personal ausente | E5 · F3 | Biblioteca propia de versiones reutilizables con selección, ACL y límite del Host configurable. |
| T41 | Historial y límites técnicos transparentes | Historial y límites parciales | E5 · F2/F3 | Historial continuo y límites técnicos transparentes; no bloqueo artificial por plan comercial. |
| T42 | Operación individual o en equipo en el Host del estudio | Host local ya disponible | E8/E10 · F5/F7 | Operación propia por estudio/equipo; no hace falta copiar venta de planes ni suscripciones SaaS. |
| T43 | Seguimiento de conversaciones y correcciones en el mismo hilo | Historial multi-turno existente | E5 · F2 | Retomar hilo restaura alcance y fuentes autorizadas; corregir pregunta sin mezclar expedientes. |
| T44 | Mejora de consulta y dictado por voz | Por ampliar | E5 · F2/F3 | Mejorar consulta y dictado opt-in con proveedor declarado; opción local/texto disponible. |
| T45 | Avance de búsquedas, detener ejecución, copiar y valorar respuesta | Estados SSE parciales | E5 · F2 | Progreso durante ejecución, cancelación efectiva, copia y valoración; conservar borrador ante fallo. |
| T46 | Exportación de conversación a PDF, Word y Markdown | Render de minuta; exportación conversación incompleta | E4 · F4 | PDF/DOCX/Markdown propios, citas navegables, tablas y acentos; inspección visual. |
| T47 | Fuentes agrupadas por tipo | Chips de fuente parciales | E2/E5 · F2 | Agrupar por clase/órgano y mostrar fuente consultada, fallida o no cubierta. |
| T48 | Adjuntos múltiples, incluido Markdown | Ingestión múltiple parcial | E1/E5 · F1/F3 | Varios adjuntos/tipos con estado individual, alcance elegido y límites claros. |
| T49 | Redacción conversacional que pide datos faltantes | Borradores parciales | E4 · F4 | Pedir datos faltantes antes de completar borrador; no inventar nombres, montos ni fechas. |
| T50 | Teclado, lector de pantalla, foco y anuncios de avance | Controles compartidos; cobertura parcial | E5 · Todas | Teclado, lector, foco y anuncios de progreso comprobados en flujos nuevos y heredados. |
| T51 | Consentimiento para analizar conversaciones, revocable | Política/flags parciales; local_only falla | E10 · F0/F7 | Consentimiento/telemetría explícitos y revocables; análisis de conversaciones separado de operación básica. |
| T52 | Importación Drive limitada a archivos elegidos | Google conectado; importación no completada | E1/E10 · F1 | Acceso/importación elegida con permisos mínimos y revocación sin copia oculta. |
| T53 | OCR de escaneados mediante proveedor declarado | OCR local existente; recuperación limitada | E1 · F0/F1 | Procesar escaneados con proveedor local o elegido, sin envío silencioso y con reintentos. |
| T54 | Control de retención, eliminación y portabilidad | Backups/exportaciones parciales | E10 · F7 | Retención por clase, eliminación y portabilidad de originales, hechos y citas; restore probado. |
| T55 | Comunicación sobre datos enviados a proveedores | Configuración existente; promesa local incumplida | E10 · F0/F7 | Mostrar destino de modelos/conectores y qué texto sale; modos realmente aplicados. |
| T56 | TLS, cifrado en reposo, roles, registros y respaldos | Controles existentes; operación por verificar | E0/E10 · F0/F7 | Configurar TLS cuando corresponda, cifrado de disco/backup, roles, logs y recuperación con evidencia. |
| T57 | Controles y alcance de seguridad organizacional | Requiere evaluación organizacional | E10 · F7 | Controles y alcance organizacional propios; no declarar certificación por replicar software. |
| T58 | Experiencia móvil en dispositivos objetivo | Web responsive; móvil no certificado | E10 · F6/F7 | Equivalencia de flujos móviles probada en dispositivos objetivo; PWA/nativo según necesidad. |

## Cómo interpretar el avance

- Una capacidad se marca completa sólo con historia, SHA y evidencia de aceptación. La presencia de una pantalla o un stub no cierra la fila.
- T24 a T29 describen la planificación de un adaptador MCP que reutilice servicios y permisos de LexOpen.
- T35, T41 y T42 se orientan a administración, presupuestos técnicos y operación del Host. No implican una oferta comercial de suscripciones.
- T57 requiere controles y alcance organizacional propios. Una certificación no se obtiene por implementar un módulo de software.
- T58 exige ensayos en los dispositivos definidos; una interfaz adaptable no acredita una aplicación nativa ni una prueba física.
- T11 y T22 tratan inmuebles y parcelas. La cartografía no acredita dominio y no equivale a emisión DTE.

## Proveedores y fuentes

LexOpen conserva almacenamiento, índices, hechos, citas y flujos. La obtención de información jurídica o cartográfica necesita fuentes identificadas y condiciones de uso verificadas. Los modelos de IA son configurables, incluida la opción local. Drive, Word, SSO y otros canales son adaptadores opcionales; el alcance de cada uno debe declararse y probarse.

La investigación original fue documental y de solo lectura. No acreditó operación autenticada de servicios externos ni pruebas reales de Word o MCP. Esta edición retira el directorio comparativo de enlaces y conserva los objetivos y estados históricos para seguir el desarrollo de LexOpen.
