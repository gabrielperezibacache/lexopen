# Desarrollo de capacidades jurídicas propias en LexOpen

Fecha: 1 de noviembre de 2026. Base de producto auditada: LexOpen 1.0.0, main 72400f9b9627cdc147ebf7c14a791c063747a686. Dirección del usuario: descomponer las capacidades de TRIFOLIA e implementarlas dentro de LexOpen para prescindir de esa plataforma.

LexOpen debe conservar su operación de estudio jurídico y sumar un motor propio de investigación, evidencia y redacción. La base existente permite reutilizar causas, clientes, documentos, colaboración, minutas y dos superficies de asistente. La prioridad es asegurar permisos, privacidad y recuperación; después construir fuentes y evidencia comunes, y sobre ellas investigación, cronología, revisión, Word y MCP. Crear varios chats o copiar pantallas no alcanza esa integración.

La referencia funcional comprende 58 capacidades públicas, trazadas en [la matriz de capacidades](auditoria-2026-11-01/MATRIZ-TRIFOLIA.md). No se promete equivalencia con funciones privadas que no se pudieron observar. La implementación comenzó en `codex/lexopen-own-core`: correcciones del núcleo y de los PR 202/203, más el primer lector de fuentes versionadas. El [registro del incremento](IMPLEMENTACION-2026-11-01.md) distingue lo implementado y probado de las fases que siguen pendientes.

Segunda entrega en `codex/pdf-legal-research`: [páginas PDF verificadas e investigación local](PDF-INVESTIGACION-2026-11-01.md), con imagen del original, OCR local, fuentes jurídicas versionadas, extractos literales e historial autorizado. Completa ese flujo de `Documento` y abre F2; no cierra F1 ni F2 completos. La cobertura oficial comprobada y los límites se documentan por separado.

Tercera entrega en `codex/spaces-drive-official-sources`: [archivos de espacios, importación elegida de Drive y fuentes oficiales](ESPACIOS-DRIVE-FUENTES-2026-11-01.md). Integra `SiteFile` con evidencia e investigación, conserva revisiones de Drive, habilita BCN actual/histórica y oficios individuales SII. El resto de F1/F2 y la cobertura no comprobada siguen pendientes.

Cuarta entrega en `codex/case-knowledge-library`: [hechos, cronología, contradicciones y biblioteca](HECHOS-CRONOLOGIA-BIBLIOTECA-2026-11-01.md), con citas comprobadas, revisión humana e historial, fechas inciertas y versiones elegidas para investigación local. Abre F3; las instrucciones aplicadas al asistente, colaboración de colecciones, evaluación jurídica y escala siguen pendientes.

## 1 Decisiones de producto

1. **Cero dependencia operativa de TRIFOLIA.** Sin cuenta, API, MCP, índices, tokens ni suscripción de ese proveedor. La prueba de independencia bloqueará sus dominios y repetirá los flujos de aceptación.
2. **Un Host por estudio como base.** Conservar PostgreSQL, archivos y configuración bajo control del estudio. Acceso de equipo mediante la arquitectura ya admitida. Multiempresa SaaS y alta disponibilidad son proyectos distintos; no agregarlos por imitar planes comerciales.
3. **IA intercambiable.** Mantener proveedores compatibles, permitir inferencia local y separar el permiso para consultar fuentes públicas del permiso para enviar documentos a un modelo remoto. El modo local debe cumplirse en todas las herramientas y adaptadores.
4. **Un expediente y una identidad documental.** Los nuevos hechos, citas, borradores y mapas se vinculan con Causa/Cliente/Site y sus documentos existentes. No crear una carpeta TRIFOLIA paralela.
5. **Evidencia antes de fluidez.** Mostrar documento, página o párrafo, versión, procedencia y fecha relevante. Separar hecho extraído, inferencia del modelo y conclusión del profesional.
6. **Control humano sobre cambios y conclusiones.** Las extracciones son propuestas; las escrituras tienen vista previa, aceptación, historial y reversión segura. Los documentos adjuntos son datos y no instrucciones para ejecutar herramientas.
7. **Continuidad visual.** Reutilizar tokens, modo oscuro, componentes, navegación y accesibilidad de 1.0. Hacer refinamientos locales; no rediseñar toda la aplicación.
8. **Límites propios configurables.** El tamaño de archivo, biblioteca, presupuesto de inferencia y concurrencia se determina con el Host objetivo. Los límites y asientos comerciales de la referencia no se convierten en restricciones artificiales de LexOpen.

## 2 Qué existe y qué hay que ampliar

| Dominio | Disponible en main 1.0.0 | Desarrollo necesario |
| --- | --- | --- |
| Operación del estudio | Causas, CRM, trámites, plazos, minutas, tareas, horas/gastos/cobros internos | Corregir consistencia, permisos y vínculos de tareas; conservar su funcionamiento |
| Asistencia | Inicio con 24 herramientas, planes/confirmación/deshacer; Agente documental e historial | Política central, ejecución durable, recuperación con citas y progreso real |
| Documentos | Originales, ingestión, OCR, Drive, archivos/versiones de espacios | Identidad común, páginas/fragmentos, importación elegida, biblioteca y recuperación de trabajos |
| Información jurídica | Jurisprudencia y briefs con corpus local/manual | Cobertura propia de fuentes, versiones, vigencia, indexación y evaluación |
| Línea temporal | Movimientos PJUD, minutas, plazos y Evento | Hechos documentales revisables, incertidumbre, evidencia y contradicciones |
| Colaboración | Espacios, miembros, mensajes, wiki, Q&A y workflows | Muro ético completo, permisos por expediente, instrucciones comunes y supervisión explícita |
| Word | Importación documental | Complemento propio, lectura autorizada, propuestas y cambios rastreados |
| MCP | Herramientas internas tipadas | Servidor propio con identidad, permisos, recursos/citas y confirmación de cambios |
| Inmuebles | Sin equivalente cartográfico | Referencias prediales, relación con documentos y capas cartográficas verificadas |
| Operación | Host, respaldo/restauración, actualización, Electron opcional | Ensayo de recuperación, retención, observabilidad de jobs y distribución móvil verificada |

PR 202 y 203 contienen avances aprovechables de equipo y avisos, pero tienen bloqueantes reproducidos o sustentados en fuente. No tratarlos como infraestructura terminada. La decisión está detallada en [la auditoría de PR](AUDITORIA-PR-2026-11-01.md).

## 3 Arquitectura compartida

~~~mermaid
flowchart TD
  U[Inicio y Agente] --> A[Servicios de dominio y autorización]
  W[Complemento Word propio] --> A
  M[Servidor MCP propio] --> A
  A --> C[Causas clientes y espacios]
  A --> R[Investigación y redacción]
  A --> F[Hechos cronología y contradicciones]
  A --> P[Inmuebles y cartografía]
  R --> E[Fuentes versiones páginas fragmentos y citas]
  F --> E
  P --> E
  E --> D[Documentos originales e índice reconstruible]
  E --> O[Conectores de fuentes oficiales]
  A --> Q[Comandos jobs y outbox persistidos]
  Q --> G[Auditoría y métricas]
  R --> L[Política de IA y modelos intercambiables]
~~~

La autorización debe aplicarse al buscar candidatos, materializar texto, construir contexto, exportar y servir una cita. Un resultado indexado no concede acceso permanente: retirar un permiso debe retirar el texto de las siguientes respuestas. Word y MCP llaman a los mismos servicios de dominio que la aplicación; no consultan Prisma ni storage directamente.

### 3.1 Modelo de información propuesto

Los nombres son de diseño y deben ajustarse al esquema durante la implementación. Se agrupan para evitar decenas de entidades antes de validar el primer flujo.

| Grupo | Entidades o relaciones propuestas | Invariantes |
| --- | --- | --- |
| Documento | Recurso común, DocumentVersion, DocumentPage, DocumentChunk, DocumentAnalysis | Original inmutable, hash, tipo, idioma, página/localización, texto extraído y versión del extractor; mantener IDs y storageKeys heredados |
| Fuente jurídica | LegalSource, SourceVersion, SourceSyncRun | URL original, órgano, identificador, fechas del documento/consulta/efecto, tipo de acceso y estado de actualización |
| Investigación | ResearchSession, ResearchRun, ToolCall, Claim, Citation | Actor y alcance, consultas, fuentes examinadas, evidencia de cada afirmación, coste, cancelación y motivo de abstención |
| Expediente | CaseFact, FactEvidence, FactReview, DocumentConflict, CaseInstruction | Fecha literal y normalizada, precisión, confianza, autores/actores, fragmento de origen y decisión humana |
| Redacción | DraftVersion, EditProposal, ReviewDecision | Texto base/hash, propuesta, citas usadas, autor, aceptación/rechazo y versión esperada |
| Biblioteca | KnowledgeCollection y vínculos a recursos | Copias/versiones identificadas, permisos, dedupe y actualización consciente |
| Cartografía | PropertyReference y vínculos de evidencia | Rol/comuna, fuente y fecha, geometría o referencia externa, estado de verificación; no inferir titularidad del dibujo |
| Ejecución | CommandExecution, Job, OutboxMessage y recibos | Idempotencia, claim con lease, reintentos limitados, recuperación, estado terminal y errores visibles |

No introducir vectores ni un grafo por costumbre. Hacer un ensayo con búsqueda textual/estructurada y embeddings locales; decidir índice y extensión mediante calidad, memoria, instalación y restauración del Host. Si un índice vectorial cae, el original y las citas siguen disponibles y debe poder reconstruirse.

### 3.2 Unificación de asistentes

Inicio conserva las operaciones cotidianas y sus confirmaciones. Agente conserva la lectura amplia, investigación y redacción. Una conversación que pasa de una pregunta operativa al expediente abre la vista documental con el mismo alcance y las fuentes guardadas. Un servicio común resuelve política de IA, permisos, recuperación, ejecución y trazas; las vistas no mantienen reglas distintas.

La respuesta debe expresar qué se revisó, qué falta por procesar y qué fuentes no estuvieron disponibles. El progreso se transmite durante búsqueda/extracción, no después de terminar. Detener cancela nuevas consultas y generación, registra lo ya consumido y conserva el borrador previo.

## 4 Fases y entregas

Estimación inicial: **20 a 28 semanas de calendario** para paridad pública amplia, con dos desarrolladores a tiempo completo, QA parcial y revisión jurídica recurrente. Es una hipótesis de planificación, no una fecha comprometida. Debe recalibrarse al terminar la fase de fuentes, usando un Host concreto y mediciones de extracción/modelo. Con una sola persona, el trabajo no conserva ese plazo. Las fases se solapan solo donde no comparten dependencias bloqueantes.

| Fase | Ventana orientativa | Resultado utilizable | Dependencia de salida |
| --- | --- | --- | --- |
| F0 Núcleo fiable | Semanas 1 a 3 | Base verificable, PR abiertos corregidos o acotados, privacidad y jobs recuperables | Bloqueantes de seguridad/integridad cerrados |
| F1 Documentos y evidencia | Semanas 4 a 6 | Lectura de expediente con citas a versiones y páginas | F0 para datos/permisos; exploración técnica puede empezar antes |
| F2 Investigación propia | Semanas 7 a 11 | Preguntas sobre fuentes jurídicas y expediente, con citas verificadas | F1 y conectores mínimos validados |
| F3 Casos y biblioteca | Semanas 10 a 14 | Hechos, cronología, contradicciones y biblioteca reutilizable | F1; aprovecha investigación F2 |
| F4 Redacción y Word | Semanas 13 a 18 | Borradores/exportación y revisión real dentro de Word | Evidencia estable y comandos seguros |
| F5 MCP y equipo | Semanas 16 a 21 | Clientes externos autorizados, colaboración y SSO opcional | Servicios/permisos estables; PR 202 corregido |
| F6 Cartografía y acceso móvil | Semanas 19 a 24 | Inmuebles vinculados a evidencia y flujos móviles verificados | Entidades/evidencia; viabilidad de datos cartográficos |
| F7 Piloto y recuperación | Semanas 24 a 28 | Aceptación de la matriz completa, carga y restauración | Entregas anteriores y hallazgos críticos cerrados |

### F0 Núcleo fiable

Primero partir de main 72400f9 en un checkout de implementación actualizado, conservando la copia local 0.1.9 y sus datos. No mezclar en bloque las 47 ramas cerradas. Mantener los cambios OJV ya integrados y contrastar las decisiones históricas de septiembre con el árbol actual.

| ID | Trabajo concreto | Aceptación mínima |
| --- | --- | --- |
| C00 | Resolver compilación limpia y verificar las convenciones de Next 16 instalado | Build completo desde npm ci; sin exports auxiliares en route.ts; evidencia del mismo SHA y entorno. Leer node_modules/next/dist/docs antes de modificar código |
| C01 | Centralizar política de salida IA | local_only produce cero intentos a modelos remotos en clasificación, respuesta libre, resumen, confirmación y reanudación; proveedor local aprobado funciona |
| C02 | Comandos transaccionales e idempotentes | Fallo de auditoría revierte dominio/activity; reintentar un pago o comando no duplica; plan multipaso informa resultados parciales y puede retomarse |
| C03 | Deshacer con dueño, ACL y versión | Usuario ajeno denegado; cambio posterior genera conflicto sin sobreescritura; consumo y reversión atómicos |
| C04 | Corregir 2FA y visibilidad heredada | Reconfigurar TOTP no desactiva el factor vigente; búsquedas/descargas no revelan tareas o textos internos a clientes |
| C05 | Recuperación durable de documentos | 21 y 201 pendientes se drenan tras reinicio; error de storage/BD no deshabilita recuperación; memoria/concurrencia acotadas |
| C06 | Completar PR 202 | Matriz API por rol, miembro/excluido, grants/revokes y 2FA; bulk sin bypass; tareas espejadas coherentes; aprobaciones concurrentes controladas |
| C07 | Completar PR 203 | Aviso+hito+outbox atómicos; varios dispositivos funcionan; acuse autorizado; leases recuperan caídas; digest no duplica ni cambia su semántica al reintentar |
| C08 | Integrar y ensayar migraciones de ambos PR | Resolver schema/package/CHANGELOG con unión de tests; upgrade desde copia 1.0 con datos ficticios; roles y escalamiento respetan el mismo muro |
| C09 | Conservar información al actualizar PJUD | Detectar duplicados divergentes, archivarlos antes del dedupe y verificar la migración 201 sobre fixture; detener workers en ventana de upgrade |
| C10 | Compatibilidad de Host y documentación | Toast/minuta funcionan por HTTP LAN admitido y HTTPS; benchmark exige base desechable y acota fixture; documentos describen estado actual |

No convertir todos los eventos de auditoría en strict indiscriminadamente: preservar la decisión de best effort donde existe. Donde una operación promete atomicidad, cumplirla con transacción o comunicar semántica distinta de manera explícita.

Salida F0: suite existente, pruebas negativas de permisos/2FA/privacidad y fallos transaccionales, build completo, smoke productivo con CSRF real y ensayo de restauración. CI exitoso de un PR aislado no sustituye probar la combinación.

### F1 Documentos y evidencia

Implementar un flujo vertical: elegir documentos de una causa o carpeta, ingerirlos sin alterar el original, extraer páginas y texto, seleccionar un fragmento y abrir la cita exacta. Después ampliar tipos y volumen.

- Resolver Documento y SiteFile mediante vínculo/recurso común y versiones, con migración aditiva. Comparar número de originales, hashes, vínculos y permisos antes/después.
- Admitir PDF, DOCX, texto y Markdown; OCR local cuando corresponda. Registrar páginas sin texto, fallos y extracción parcial. Reintentar solo trabajos fallidos; no sustituir el archivo original por el texto extraído.
- Importar desde Drive únicamente archivos elegidos, con identidad externa/hash y política de nueva versión. No interpretar el push actual de LexOpen como importación completa.
- Recuperar selección explícita de IDs/carpeta antes de límites de documentos recientes. Combinar búsqueda textual, filtros y recuperación semántica evaluada.
- Citas con fragmento comprobado, versión y localización; conservar el texto literal citado y su hash. Exportar referencias resolubles aunque se regenere el índice.

Aceptación: documento antiguo fuera de los primeros 80 recuperado en selección múltiple; PDF escaneado/multipágina con cita correcta; extracción fallida visible; permiso revocado corta consulta y cita; volver a importar el mismo archivo no crea duplicados inadvertidos; restauración recupera originales y evidencia.

### F2 Investigación jurídica propia

Descomponer investigación en búsqueda, obtención, normalización, recuperación, contraste y respuesta. El modelo redacta sobre resultados obtenidos; no inventa identificadores, fallos o artículos para completar una respuesta.

| Paquete | Cobertura que se debe construir | Primer corte y expansión |
| --- | --- | --- |
| Legislación | LeyChile/BCN, versión y fecha relevante | Un corpus acotado con versiones comprobadas; después actualización incremental y relaciones |
| Jurisprudencia | Resoluciones de cortes y materias documentadas en la referencia | Separar investigación de fallos públicos del monitoreo de causas privadas OJV; filtros por órgano, rol, fecha y materia |
| Documentos administrativos | CGR, DT, SII, CMF, FNE, TDLC, SMA, tribunales ambientales, TC, TTA y SUSESO | Registro por organismo con acceso real, identificadores y formato comprobados; no declarar el conjunto listo por un buscador genérico |
| Doctrina | Publicaciones académicas y documentos de acceso permitido | Metadatos, resumen y enlace; texto completo solo cuando se obtiene legítimamente; búsqueda restringida y transparente |
| Material del estudio | Documentos autorizados y biblioteca propia | Diferenciar fuente interna, documento oficial y comentario doctrinal en resultados y citas |

Cada conector debe tener una ficha de viabilidad: recurso/API disponible, cobertura, paginación, metadatos, actualización, condiciones de almacenamiento, límites, fallos y costo. No se asume que todos los organismos tienen API ni se compromete acceso automático antes de probarlo. En ausencia de acceso sostenible, ofrecer ingestión manual identificada y registrar la brecha de cobertura.

Flujo de investigación: aclarar la consulta cuando falten fecha, materia o propósito; elegir fuentes; buscar con presupuesto; contrastar resultados favorables y contrarios; verificar identificadores/citas; producir respuesta con fuente y cobertura. El usuario puede abrir fuentes agrupadas y retomar la investigación en el mismo hilo. Incluir progreso, cancelación, copiar, valoración y exportación.

Salida F2: preguntas de evaluación con fuentes oficiales accesibles, contradicción entre precedentes visible, norma histórica diferenciada de vigente y abstención cuando no existe respaldo. Los valores de calidad propuestos en la sección 7 se fijan definitivamente con la primera muestra revisada.

### F3 Casos, cronología y biblioteca

Avance del 1 de noviembre: el [cuarto incremento](HECHOS-CRONOLOGIA-BIBLIOTECA-2026-11-01.md) implementa hechos citados, cronología con incertidumbre, contradicciones revisables y biblioteca personal con versiones fijadas. El [registro de comprobaciones](conocimiento-2026-11-01/VALIDACION.md) distingue pruebas terminadas de las pendientes. Los párrafos siguientes mantienen el alcance completo de F3, aún abierto.

La cronología debe representar hechos y su evidencia, sin confundir fecha de carga, fecha del documento y fecha del acontecimiento. Guardar texto temporal literal, normalización, rango/precisión y carácter inferido. Integrar movimientos PJUD como una fuente diferenciada, no como verdad equivalente a toda alegación documental.

Al añadir una nueva versión, procesar solo el material nuevo y marcar qué hechos pueden quedar desactualizados. Detectar posibles duplicados por contenido y referencia; una corrección del profesional debe sobrevivir a la siguiente extracción. Permitir aceptar, editar, destacar, ocultar y filtrar hechos, conservando historial.

La detección de contradicciones debe presentar al menos dos fragmentos identificados y explicar la incompatibilidad propuesta: fecha, monto, actor, versión o afirmación. Diferenciar contradicción, discrepancia aparente y ausencia de información. Ninguna etiqueta se convierte automáticamente en conclusión jurídica.

La biblioteca reutiliza versiones de documentos, colecciones e instrucciones. Elegir qué material entra a cada consulta, permitir retirar documentos, mostrar límites reales del Host y conservar permisos por estudio/equipo. Compartir un caso requiere invitación de uso único, aceptación, revocación y comprobación de acceso a todos sus derivados.

Aceptación: cronología incremental sin duplicados; fecha ambigua conserva incertidumbre; hecho abre su página; contradicción abre ambos fragmentos; un archivo eliminado o sin permiso deja de alimentar respuestas; revisión humana se conserva al reanalizar; biblioteca funciona entre conversaciones sin mezclar causas.

### F4 Redacción, exportación y Word propio

Reutilizar minutas y borradores. Añadir planificación de escrito, preguntas por datos faltantes, hechos/citas seleccionados y versiones editables. Distinguir un dato confirmado de un espacio pendiente; no rellenar nombres, montos o fechas desconocidas. La aceptación crea una nueva versión o propuesta, no una sustitución silenciosa.

Exportación propia a DOCX, PDF y Markdown de respuestas, borradores y cronologías. Validar acentos, tablas, notas, enlaces y numeración; inspeccionar archivos renderizados antes de dar una exportación por terminada. Una exportación fiel requiere pruebas de documentos reales autorizados, no solo que exista el archivo.

Construir un complemento Office de LexOpen: selección/documento con permiso explícito, panel de investigación, fuentes, revisión y propuestas con control de cambios. Guardar ancla y hash del texto leído; si cambia mientras responde el modelo, bloquear la aplicación automática y permitir recalcular. Aplicar cambios por partes y mantener estilos, tablas y notas.

Microsoft documenta APIs de revisión y cambios rastreados, pero algunas operaciones dependen de requisitos de plataforma. El primer ensayo debe fijar versión de Word Windows, Mac y web, comprobar funciones disponibles y mostrar una alternativa de propuesta si falta alguna; no prometer compatibilidad por usar JavaScript. [Documentación oficial de Word](https://learn.microsoft.com/en-us/office/dev/add-ins/word/manage-tracked-changes).

Aceptación: lectura limitada al alcance aprobado; un párrafo editado durante generación no se sobrescribe; cambios visibles y aceptables/rechazables; autenticación revocada corta acceso; archivos complejos preservados en las plataformas objetivo. Word es un adaptador opcional: la aplicación web conserva investigación, revisión y exportación propias.

### F5 MCP propio y colaboración

Construir un servidor MCP LexOpen que permita a asistentes autorizados usar las fuentes y servicios propios. Primer corte de solo lectura: buscar fuentes, recuperar fragmentos y consultar hechos autorizados. Segundo corte: proponer borradores y acciones mediante plan y confirmación. Reutilizar los permisos, límites y ejecución durable del núcleo.

Scopes por usuario, expediente y operación; credenciales revocables y cifradas; catálogo determinista; recursos con procedencia; límites de texto y costo; trazas sin volcar contenido sensible por defecto. Comprobar permisos en cada llamada, incluso si la herramienta se descubrió antes de una revocación. El modo local y las restricciones de exportación también se aplican a MCP.

Fijar versión del protocolo/SDK y clientes objetivo durante el ensayo de compatibilidad. La revisión pública 2026-07-28 introduce cambios importantes: no implementar copiando flujos antiguos de sesión sin verificar la especificación elegida. [Publicación oficial de MCP](https://blog.modelcontextprotocol.io/posts/2026-07-28/).

En equipo, completar roles, delegaciones, instrucciones comunes y administración. Mostrar de manera explícita quién puede ver conversaciones/actividad; un administrador técnico no obtiene por defecto acceso irrestricto a un expediente protegido. SSO se implementa mediante adaptadores estándar de identidad, con pertenencia y rol controlados por el estudio; el dominio por sí solo no concede acceso a causas.

Los planes y bolsas comerciales de TRIFOLIA se traducen en presupuestos locales de inferencia/búsqueda y administración, no en un sistema de cobro de suscripciones. Facturación interna de LexOpen conserva su propósito actual.

Aceptación: dos clientes MCP objetivo, credencial revocada/caducada, documento no autorizado, intento de prompt injection en fuente y repetición de comando; acceso coherente entre web/Word/MCP; identidad corporativa desactivada retira sesión y permisos.

### F6 Inmuebles y móvil

El mapa de referencia es **cartografía de inmuebles y parcelas**, no un mapa de normativa tributaria. Extraer candidatos de rol/comuna desde documentos, conservar fragmento de origen y pedir revisión si falta identificación. Enlazar la referencia predial con causa/cliente y capas o recursos cartográficos de fuente identificada.

Antes de comprometer mapas offline o descarga masiva, verificar los formatos y condiciones de acceso a la cartografía SII. Mostrar atribución, fecha, incertidumbre y estado de disponibilidad; no inventar un polígono cuando la fuente falla. La ubicación de una parcela no prueba dominio ni sustituye los documentos del caso.

Para acceso móvil, completar primero los flujos web/PWA: lectura de expediente y fuentes, búsqueda, cronología, alertas, carga y revisión. Validar navegación, teclado, accesibilidad, estados de red y tamaño de archivos en dispositivos concretos. Una PWA instalada no acredita las funciones de una aplicación nativa; iOS/Android nativo se justifica solo por una necesidad que la web no resuelva.

Aceptación: identificación predial ambigua queda pendiente; mapa y documento se abren desde el mismo hecho; fuente caída informa su estado; flujos de lectura/consulta/carga funcionan en iPhone/iPad y Android objetivo; datos no quedan en una caché de sesión revocada. No se promete envío offline de cambios hasta diseñar conflictos y cola persistida.

### F7 Piloto, seguridad y operación

Cerrar la matriz de 58 capacidades con evidencia por flujo. Probar corpus grande, fallos de extracción y conectores, apagado durante jobs, concurrencia, permisos revocados, cambio de modelo, exportaciones y restauración completa. El índice es reconstruible y el backup incluye originales, versiones, hechos, citas, configuración y claves necesarias para recuperar.

Añadir retención/eliminación por clase de datos, exportación del estudio, separación de logs operativos y contenido, minimización de avisos externos y política de telemetría explícita. Documentar cifrado de disco/backup y configuración de red; un cifrado de tokens no equivale a cifrar toda la base.

La certificación ISO publicada por otra organización no se hereda al implementar funciones. Un programa de seguridad y una posible certificación de LexOpen requieren alcance y evidencia propios; no forman parte de la aceptación de una feature.

Piloto inicial con datos ficticios y documentos públicos permitidos; después casos autorizados con revisión profesional. Criterio de cierre: ninguna vulnerabilidad crítica/alta abierta en los flujos habilitados y ningún requisito de la matriz marcado completo sin prueba identificada.

## 5 Backlog y dependencias

| Épica | Entregas identificables | Depende de | Trazabilidad de referencia |
| --- | --- | --- | --- |
| E0 Confianza | C00 a C10, comandos/privacidad/ACL/leases/build | Base actual | Transversal |
| E1 Evidencia | Recursos/versiones/páginas/fragmentos/citas, selección e ingestión | E0 | T06, T12 a T15, T18, T48, T52 a T54 |
| E2 Investigación | Conectores por clase/órgano, recuperación híbrida y verificación | E1 | T01 a T04, T07 a T10, T47 |
| E3 Expediente inteligente | Hechos/revisión/cronología/contradicciones/instrucciones | E1; E2 para contraste jurídico | T12, T15 a T20, T36 |
| E4 Redacción | Borradores, datos faltantes, comparación y exportación | E1 y E2 | T05, T06, T46, T49 |
| E5 Experiencia | Hilos, biblioteca, progreso, cancelar, voz y accesibilidad | E1; E2/E3 progresivos | T40, T41, T43 a T45, T48, T50 |
| E6 Word | Ensayo Office, complemento, propuestas y concurrencia | E0, E1, E4 | T30 a T34 |
| E7 MCP propio | Herramientas/recursos propios, identidad/scopes y consumo | E0, E1, E2 | T24 a T29 |
| E8 Equipo | Roles/muro corregidos, invitaciones, actividad, SSO y presupuesto | E0; integración con E3 | T21, T23, T35 a T39, T42 |
| E9 Inmuebles | Referencia predial, entidades y mapa con fuente | E1 y E3; viabilidad de datos | T11, T22 |
| E10 Operación | Retención/portabilidad, transparencia, seguridad y móvil | Todas, con controles desde E0 | T51, T53 a T58 |

Los ensayos de Office, identidad, MCP y fuentes cartográficas pueden adelantarse para descubrir limitaciones; su incorporación al producto espera a que autorización y evidencia estén listas. No abrir ramas simultáneas que redefinan Task, Notification o Documento de manera incompatible.

## 6 Primeras dos semanas de implementación

| Orden | PR propuesto | Contenido acotado | Prueba decisiva |
| --- | --- | --- | --- |
| 1 | codex/build-and-host-baseline | Compilación limpia, export auxiliar TOTP, IDs compatibles LAN; fijar baseline de migraciones | Build desde instalación limpia; navegador por HTTP LAN y HTTPS |
| 2 | codex/ai-egress-policy | Política central y selección explícita local/remota | Espía de red en turno completo confirma cero intentos remotos en local_only |
| 3 | codex/auth-boundaries | Reenrolamiento TOTP, búsqueda portal y controles servidor compartidos | Matriz de acceso y prefetch sin bypass, con CSRF productivo |
| 4 | codex/commands-and-undo | Transacción de comandos/pagos, idempotencia, dueño y versión de undo | Fallo inyectado revierte; retry no duplica; conflicto no pisa edición |
| 5 | Seguimiento de PR 202 | Cerrar permisos y espejos; rebase y pruebas negativas | Muro efectivo en texto/binario/búsqueda/contexto/bulk |
| 6 | Seguimiento de PR 203 | Cerrar hitos, acuses, varios dispositivos y recuperación | Repetir los cuatro fallos de esta auditoría y demostrar su corrección |

No obliga a terminar seis PR en diez días: permite trabajar con alcances claros y ordenar revisión. OCR/leases y ensayo de migración 201 son el siguiente bloque de F0, con investigación de fuentes y formatos en paralelo sin datos privados.

## 7 Evaluación y definición de terminado

| Dimensión | Evidencia requerida |
| --- | --- |
| Acceso | Cero lecturas/escrituras no autorizadas en matriz rol, causa, miembro, cliente, grant/revoke; repetir web, IA, Word, MCP y exportación |
| Privacidad | local_only sin intentos remotos; scopes reducidos; trazas sin secretos/texto por defecto; revocación efectiva |
| Citas | Toda cita resuelve al original/versión; fragmento literal y localización comprobados; cita inexistente se bloquea |
| Calidad jurídica | Conjunto inicial de al menos 100 preguntas revisadas; objetivo provisional de respaldo de afirmaciones de 95% y recuperación Recall@10 de 90%; revisar por materia, no promediar errores graves |
| Abstención | Fuentes inexistentes, inaccesibles o no concluyentes se reflejan en respuesta; no reemplazar faltantes por inventos |
| Hechos | Fechas/actores/valores y relaciones de evidencia verificados en muestra; propuesta incierta no presentada como hecho confirmado |
| Integridad | Fault injection en dominio/auditoría/outbox/recibo; reintentos sin duplicar; concurrencia sin perder cambios; jobs recuperados tras reinicio |
| Rendimiento | Medir p50/p95, memoria, páginas procesadas, filas SQL y costo en el Host objetivo; corpus de 1.000 documentos/10.000 páginas como ensayo inicial ajustable |
| Exportación | PDF/DOCX renderizados e inspeccionados, referencias y tablas verificadas; conservar original y versión |
| Operación | Restauración comprobada, migraciones desde versión anterior, índices reconstruidos, health sin efectos secundarios inesperados |
| Accesibilidad | Teclado completo, foco, avisos de progreso, lector de pantalla y móviles objetivo; roles ARIA por sí solos no bastan |
| Independencia | Flujos aceptados funcionan sin cuentas/credenciales y con dominios TRIFOLIA bloqueados; fuentes/modelos externos declarados y sustituibles donde corresponde |

Estos objetivos son criterios propuestos de aceptación y no métricas obtenidas en esta auditoría. La calidad de inferencia local depende del modelo y equipo elegido; no se promete equivalencia de calidad por implementar la interfaz.

Una historia termina con migración/reversibilidad evaluada, permisos negativos, error/cancelación, recuperación, prueba funcional apropiada y documentación de operación. El registro de aceptación enlaza ID T, historia, SHA, fixture y evidencia. Si una fuente o plataforma no permite la función, su celda permanece parcial o bloqueada; no se oculta bajo una etiqueta de paridad.

## 8 Riesgos y decisiones de control

| Riesgo | Decisión y punto de revisión |
| --- | --- |
| Cobertura pública desigual de organismos | Ensayos por conector en F2; declarar lo que realmente se consulta y mantener importación identificada |
| Modelo local insuficiente o Host pequeño | Medir en F1/F2 antes de fijar modelo, tamaño de lote o promesa de velocidad; opción remota solo opt-in y con política central |
| Migración pierde versiones o información divergente | Migraciones aditivas, archivo de conflictos y restore probado; no editar retroactivamente migraciones aplicadas |
| Word cambia texto durante generación | Anclas/versiones, vista de diferencias y conflicto; ensayo temprano por plataforma |
| Índice o respuesta conserva datos revocados | Filtrado y revalidación de acceso, invalidación y pruebas sobre derivados/cachés |
| Ampliación excesiva del producto | Entregas verticales; separar facturación SII, cómputo jurídico certificado, CRM comercial y SaaS multiempresa del objetivo funcional de referencia |
| Estado de PR y documentación divergen | Registro de evidencia por SHA; revalidación antes de integrar, sin reabrir todas las ramas históricas |

## 9 Documentos de trabajo

- [Auditoría y decisiones de integración](AUDITORIA-PR-2026-11-01.md).
- [Catálogo de 58 capacidades y correspondencia con épicas](auditoria-2026-11-01/MATRIZ-TRIFOLIA.md).
- [Inventario de 206 PR](auditoria-2026-11-01/pull-requests.csv).
- [Revisión PR 202](auditoria-2026-11-01/PR-202.md) y [revisión PR 203](auditoria-2026-11-01/PR-203.md).
- [Arquitectura actual](auditoria-2026-11-01/ARQUITECTURA.md) y [evidencia de privacidad/integridad](auditoria-2026-11-01/PRUEBAS-PRIVACIDAD.md).

La documentación pública usada para descomponer funciones está identificada en la matriz. Las propuestas de entidades, etapas, métricas y pruebas son diseño de LexOpen, no afirmaciones sobre la implementación interna de TRIFOLIA.
