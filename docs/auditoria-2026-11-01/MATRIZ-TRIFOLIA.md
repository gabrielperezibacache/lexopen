# Matriz de capacidades de referencia y desarrollo propio

Fecha: 1 de noviembre de 2026. Referencia: TRIFOLIA de Trifolia SpA, dominio trifolia.cl. Base LexOpen: main72400f9, versión1.0.0.

**Objetivo: implementar capacidades propias en LexOpen, sin cuenta, servicio, MCP ni suscripción TRIFOLIA.** La referencia aporta requisitos públicos; no se examinó su código ni una cuenta autenticada. Las características privadas no observables no quedan certificadas por esta matriz.

Las columnas de trabajo y aceptación son diseño propuesto de LexOpen. Los estados describen la base auditada `main`, no el estado del incremento posterior. E0 a E10 y F0 a F7 remiten al [plan de desarrollo](../PLAN-DESARROLLO-TRIFOLIA.md). El [seguimiento de implementación](../IMPLEMENTACION-2026-11-01.md) registra las correcciones F0 y el aporte parcial de versiones/fragmentos/citas a T03, T13, T18 y T53. Ninguna de estas filas se declara completa por ese primer corte.

## Fuentes primarias consultadas

- S1 — [Producto](https://trifolia.cl/).
- S2 — [Fuentes jurídicas](https://trifolia.cl/fuentes/).
- S3 — [Casos](https://trifolia.cl/casos/).
- S4 — [Conector MCP](https://trifolia.cl/conector-mcp/).
- S5 — [Microsoft Word](https://trifolia.cl/complemento-word/).
- S6 — [Equipos](https://trifolia.cl/equipo/).
- S7 — [Planes](https://trifolia.cl/pricing/).
- S8 — [Accesibilidad y guía funcional](https://trifolia.cl/accesibilidad/).
- S9 — [Privacidad](https://trifolia.cl/privacy-policy/).
- S10 — [Seguridad](https://trifolia.cl/seguridad/).
- S11 — [Términos](https://trifolia.cl/terms/).

## Capacidades y aceptación

| ID | Capacidad pública de referencia | Fuente | Base LexOpen actual | Épica y fase | Aceptación de implementación propia |
| --- | --- | --- | --- | --- | --- |
| T01 | Consulta jurídica en lenguaje natural | S1 | Agente parcial | E2 · F2 | Consulta propia con alcance y fuentes sin cuenta TRIFOLIA. |
| T02 | Investigación combinada sobre cuatro clases de fuentes | S1 | Sin búsqueda federada completa | E2 · F2 | Orquestar legislación, jurisprudencia, documentos administrativos y doctrina; indicar cobertura real. |
| T03 | Respuestas con citas y enlaces al original | S1 | SourceChip y contexto parciales | E1/E2 · F1/F2 | Cada cita abre original, versión y localización comprobada; bloquear referencias inexistentes. |
| T04 | Análisis de precedentes y legislación aplicable | S1 | Briefs parciales | E2 · F2 | Contrastar precedentes y normas con fecha relevante y evidencia; mostrar resultados contrarios. |
| T05 | Borradores de escritos descargables | S1 | Minutas y borradores parciales | E4 · F4 | Borrador versionado y revisable con exportación propia y datos faltantes visibles. |
| T06 | Análisis de contratos, demandas y fallos adjuntos | S1 | Lectura y resumen parciales | E3/E4 · F3/F4 | Análisis por documento/selección, citas y observaciones revisables sin cambiar original. |
| T07 | Jurisprudencia PJUD: Suprema, Apelaciones, civil, penal, familia, laboral y cobranza | S2 | Corpus local y carga manual | E2 · F2 | Conector/corpus propio por órgano y materia; consulta pública separada de causas privadas OJV. |
| T08 | Legislación de LeyChile | S2 | Sin conector completo de legislación | E2 · F2 | Texto y versión normativa con fuente oficial y fecha relevante verificables. |
| T09 | Documentos y decisiones de CGR, DT, SII, CMF, FNE, TDLC, SMA, ambientales, TC, TTA y SUSESO | S2 | Sin cobertura completa de organismos | E2 · F2 | Ficha de viabilidad y pruebas por organismo; no declarar conjunto listo con búsqueda genérica. |
| T10 | Doctrina mediante buscador externo restringido a fuentes académicas chilenas | S2 | Sin conector académico propio | E2 · F2 | Buscar fuentes académicas permitidas con autor, publicación, enlace y límite de texto visible. |
| T11 | Cartografía pública SII para inmuebles | S2 | Ausente | E9 · F6 | Cartografía inmobiliaria con fuente, atribución y fecha; fallback explícito si no hay datos. |
| T12 | Expediente con documentos, cronología y conversaciones | S3 | Causas, movimientos y chat parciales | E3 · F3 | Un expediente con hechos documentales, conversaciones y permisos sobre derivados. |
| T13 | Ingesta PDF, Word y texto, hasta 20 MB por archivo | S3 | Ingestión existente, por endurecer | E1 · F1 | PDF/DOCX/texto conservan original; límite propio medido y estados de procesamiento visibles. |
| T14 | Importación de documentos desde Google Drive | S3 | Drive actual no acredita importador elegido | E1 · F1 | Selector e importación de archivos elegidos, identidad externa y nuevas versiones sin duplicación. |
| T15 | Descripción automática de cada documento | S3 | Resumen bajo solicitud | E1/E3 · F1/F3 | Descripción persistida y versionada por extracción, revisable y enlazada a original. |
| T16 | Extracción automática de hechos y fechas | S3 | Sin hechos estructurados | E3 · F3 | Fecha literal/normalizada, precisión, actores y fragmento de origen; incertidumbre visible. |
| T17 | Cronología que se actualiza al agregar documentos | S3 | Sin cronología documental incremental | E3 · F3 | Agregar documento genera propuestas nuevas sin duplicar ni borrar correcciones humanas. |
| T18 | Cada hecho enlazado a documentos de origen | S3 | Sin relación FactEvidence | E1/E3 · F1/F3 | Todo hecho propuesto abre su versión y página o párrafo; conservar trazabilidad. |
| T19 | Destacar u ocultar hechos de la cronología | S3 | Ausente para hechos | E3 · F3 | Destacar/ocultar/editar hecho con autor e historial sin borrar evidencia original. |
| T20 | Preguntas y detección de contradicciones entre documentos | S3 | Q&A parcial; comparación no estructurada | E3 · F3 | Contradicción muestra ambos fragmentos y admite revisión/rechazo; Q&A respeta alcance. |
| T21 | Invitaciones por correo y caso compartido | S3 | Miembros/espacios parciales | E8 · F5 | Invitación elegida, aceptación y revocación; prueba de acceso por invitado y tercero. |
| T22 | Inmuebles detectados en documentos y parcelas en mapa | S3 | Ausente | E9 · F6 | Rol/comuna candidato desde documento, revisión y enlace a parcela; no afirmar dominio. |
| T23 | Acceso al caso para dueño e invitados | S3 | Permisos de espacio; muro202 incompleto | E8 · F5 | Dueño/invitados autorizados y equipo definido; búsqueda, derivados y descargas coherentes. |
| T24 | MCP remoto para asistentes compatibles | S4 | Sin servidor MCP | E7 · F5 | Servidor MCP LexOpen propio compatible con clientes objetivo; sin endpoints TRIFOLIA. |
| T25 | Acceso autorizado por cuenta y revocable | S4 | Sesiones web; auth MCP ausente | E7 · F5 | Identidad y scopes propios por usuario/expediente; revocar credencial corta llamadas. |
| T26 | Las cuatro búsquedas jurídicas mediante MCP | S4 | Sin herramientas de cuatro fuentes completas | E2/E7 · F2/F5 | Exponer búsquedas propias autorizadas en MCP con el mismo contrato de evidencia. |
| T27 | Cuota por búsqueda; una pregunta puede gastar varias | S4 | Sin presupuesto común de investigación | E5/E7 · F2/F5 | Contabilizar consultas/tokens/tiempo localmente; detener al alcanzar límite configurable. |
| T28 | Panel con detalle de actividad MCP | S4 | Auditoría general parcial | E7 · F5 | Registro propio de llamadas, resultado/costo y errores; contenido sensible minimizado. |
| T29 | Bolsa de búsquedas compartida para equipos | S4 | Ausente como presupuesto de equipo | E7/E8 · F5 | Presupuesto compartido configurable de recursos; no replicar paquete comercial obligatorio. |
| T30 | Panel de investigación dentro de Word Microsoft 365 | S5 | Ausente | E6 · F4 | Panel Word LexOpen usa servicios propios y conserva fuentes/contexto aprobado. |
| T31 | Lectura del documento mediante autorización por documento | S5 | Ausente en Office | E6 · F4 | Leer selección/documento solo tras autorización explícita y mostrar alcance. |
| T32 | Inserciones y correcciones como cambios rastreados | S5 | Ausente | E6 · F4 | Inserciones/correcciones como propuestas y cambios rastreados verificables por plataforma. |
| T33 | Detección de texto cambiado durante una respuesta | S5 | Ausente; undo actual sin CAS | E6 · F4 | Ancla/hash de lectura; edición posterior impide sobrescritura y permite recalcular. |
| T34 | Compatibilidad Word Windows, Mac y web | S5 | No verificado | E6 · F4 | Matriz real Word Windows/Mac/web por API soportada y alternativa explícita. |
| T35 | Equipos con miembros, asientos, actividad y facturas | S6 | Usuarios/grupos/billing interno parciales | E8 · F5 | Administrar miembros, actividad y recursos; cobros comerciales de suscripción fuera del objetivo local. |
| T36 | Documentos e instrucciones comunes por caso | S6 | Wiki/contexto parcial | E3/E8 · F3/F5 | Documentos e instrucciones por expediente, versionadas y con permisos; distinguir contenido de política. |
| T37 | Visibilidad del propietario sobre actividad y conversaciones | S6 | Auditoría parcial; supervisión por definir | E8 · F5 | Política visible de acceso a conversaciones/actividad; muro limita también administradores técnicos. |
| T38 | SSO Google Workspace, Entra ID u Okta; dominio verificado | S6 | OAuth Google de integración no es SSO | E8 · F5 | Adaptadores de identidad propios y dominio verificado; baja corporativa revoca acceso. |
| T39 | Acceso automático al equipo desde dominio y asiento libre | S6 | Ausente | E8 · F5 | Aprovisionamiento opcional por dominio validado y cupo; no conceder causas por dominio solo. |
| T40 | Biblioteca personal reutilizable de hasta 100 documentos | S7 | Documentos/carpetas; colección personal ausente | E5 · F3 | Biblioteca propia de versiones reutilizables con selección, ACL y límite del Host configurable. |
| T41 | Historial, límites y documentos según plan | S7 | Historial y límites parciales | E5 · F2/F3 | Historial continuo y límites técnicos transparentes; no bloqueo artificial por plan comercial. |
| T42 | Planes individuales, equipos, paquetes y on-premise | S7 | Host local ya disponible | E8/E10 · F5/F7 | Operación propia por estudio/equipo; no hace falta copiar venta de planes ni suscripciones SaaS. |
| T43 | Seguimiento de conversaciones y correcciones en el mismo hilo | S8 | Historial multi-turno existente | E5 · F2 | Retomar hilo restaura alcance y fuentes autorizadas; corregir pregunta sin mezclar expedientes. |
| T44 | Mejora de consulta y dictado por voz | S8 | Por ampliar | E5 · F2/F3 | Mejorar consulta y dictado opt-in con proveedor declarado; opción local/texto disponible. |
| T45 | Avance de búsquedas, detener ejecución, copiar y valorar respuesta | S8 | Estados SSE parciales | E5 · F2 | Progreso durante ejecución, cancelación efectiva, copia y valoración; conservar borrador ante fallo. |
| T46 | Exportación de conversación a PDF, Word y Markdown | S8 | Render de minuta; exportación conversación incompleta | E4 · F4 | PDF/DOCX/Markdown propios, citas navegables, tablas y acentos; inspección visual. |
| T47 | Fuentes agrupadas por tipo | S8 | Chips de fuente parciales | E2/E5 · F2 | Agrupar por clase/órgano y mostrar fuente consultada, fallida o no cubierta. |
| T48 | Adjuntos múltiples, incluido Markdown | S8 | Ingestión múltiple parcial | E1/E5 · F1/F3 | Varios adjuntos/tipos con estado individual, alcance elegido y límites claros. |
| T49 | Redacción conversacional que pide datos faltantes | S8 | Borradores parciales | E4 · F4 | Pedir datos faltantes antes de completar borrador; no inventar nombres, montos ni fechas. |
| T50 | Teclado, lector de pantalla, foco y anuncios de avance | S8 | Controles compartidos; cobertura parcial | E5 · Todas | Teclado, lector, foco y anuncios de progreso comprobados en flujos nuevos y heredados. |
| T51 | Consentimiento para analizar conversaciones, revocable | S9 | Política/flags parciales; local_only falla | E10 · F0/F7 | Consentimiento/telemetría explícitos y revocables; análisis de conversaciones separado de operación básica. |
| T52 | Importación Drive limitada a archivos elegidos | S9 | Google conectado; importación no completada | E1/E10 · F1 | Acceso/importación elegida con permisos mínimos y revocación sin copia oculta. |
| T53 | OCR de escaneados mediante proveedor declarado | S9 | OCR local existente; recuperación limitada | E1 · F0/F1 | Procesar escaneados con proveedor local o elegido, sin envío silencioso y con reintentos. |
| T54 | Control de retención, eliminación y portabilidad | S9 | Backups/exportaciones parciales | E10 · F7 | Retención por clase, eliminación y portabilidad de originales, hechos y citas; restore probado. |
| T55 | Comunicación sobre datos enviados a proveedores | S9 | Configuración existente; promesa local incumplida | E10 · F0/F7 | Mostrar destino de modelos/conectores y qué texto sale; modos realmente aplicados. |
| T56 | TLS, cifrado en reposo, roles, registros y respaldos | S10 | Controles existentes; operación por verificar | E0/E10 · F0/F7 | Configurar TLS cuando corresponda, cifrado de disco/backup, roles, logs y recuperación con evidencia. |
| T57 | SGSI ISO 27001 publicado con número y alcance | S10 | No transferible como feature | E10 · F7 | Controles y alcance organizacional propios; no declarar certificación por replicar software. |
| T58 | Servicio móvil iPhone/iPad mencionado en términos | S11 | Web responsive; móvil no certificado | E10 · F6/F7 | Equivalencia de flujos móviles probada en dispositivos objetivo; PWA/nativo según necesidad. |

## Cómo interpretar la paridad

- Una capacidad se marca completa solo con historia, SHA y evidencia de aceptación. La presencia de una pantalla o un stub no cierra la fila.
- T24 a T29 describen el valor de un conector, pero se realizan mediante un servidor MCP propio de LexOpen y fuentes propias; no se conecta TRIFOLIA.
- T35, T41 y T42 incluyen empaquetado comercial de la referencia. Se traducen a administración, límites de recursos y operación propia; copiar venta de suscripciones no es necesario para prescindir de la plataforma.
- T57 es una declaración organizacional del proveedor, no un módulo de código transferible ni una certificación verificada con el emisor.
- T58 se basa en una mención pública de servicio móvil; no se verificaron funciones autenticadas de apps. El cierre exige flujos equivalentes en dispositivos definidos.
- T11 y T22 son inmuebles y parcelas. No equivalen a emisión DTE ni a un mapa de normas tributarias. La cartografía no acredita dominio.
- La referencia no publica una biblioteca de plantillas como función existente en la guía consultada. Plantillas propias de LexOpen se conservan, sin atribuirlas a TRIFOLIA.

## Dependencias que se conservan explícitas

Prescindir de TRIFOLIA no elimina la necesidad de obtener datos jurídicos y cartográficos de sus fuentes ni de elegir un modelo de inferencia. LexOpen debe ser dueño del almacenamiento, índices, hechos, citas, prompts y flujos. Los proveedores de IA son intercambiables, incluida opción local; Drive, Word, SSO y canales externos son adaptadores opcionales. Los flujos web propios deben conservarse si esos adaptadores están desactivados.

La consulta verificó documentación pública mediante búsqueda web; Firecrawl no resolvió su host en esta sesión. No se hicieron compras, consultas autenticadas, análisis jurídico de respuestas ni pruebas reales de Word/MCP del proveedor.
