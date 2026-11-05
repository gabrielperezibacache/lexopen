# Auditoría de la interfaz de LexOpen

Fecha: 5 de noviembre de 2026.

## Alcance y evidencia

Se inventariaron las **64 rutas autenticadas** de la aplicación y 132 archivos de componentes alcanzados por sus importaciones. Se revisaron textos, formularios, acciones y destinos, con inspección manual prioritaria de causas, biblioteca, documentos, audiencias, escritos y minutas. El inventario estático no acredita el comportamiento completo de cada pantalla ni sustituye una prueba de sus integraciones.

La revisión visual de esta entrega cubre **Académico y Descubrir**, a 1440 px y 360 px, con cuentas, textos y respuestas de búsqueda ficticias. El recorrido académico utilizó las APIs, la base y el almacenamiento reales de una instalación temporal, con un proveedor local de respuestas de prueba. No se utilizaron ClaveÚnica, Drive, LinkedIn, correo ni credenciales reales. La revisión general de Inicio, acompañante y Sincronización se documenta por separado con sus capturas.

## Correcciones principales

- Académico ofrece Investigar, Escribir y Enseñar; conserva tarea, objetivo y pasajes al reabrir. Las propuestas tienen guardado automático, historial, recuperación como nueva revisión y descarga Word.
- Los escritos jurídicos incorporan descarga Word con notas al pie nativas y apéndice de fuentes. Antes de exportar se vuelven a comprobar propietario, causa, permisos y respaldos; una referencia manual no se convierte en una cita verificada.
- Documentos sustituye términos internos por acciones de lectura y consulta. La procedencia, las ubicaciones y las huellas de integridad se consultan bajo detalles. El reintento de procesamiento ahora comunica los errores y sólo confirma una solicitud aceptada.
- Las plantillas de minutas se crean mediante campos normales; JSON queda como opción avanzada. La API rechaza estructuras inválidas y una plantilla antigua inválida ya no interrumpe el asistente de creación.
- Se aclararon las explicaciones de carpetas, tablas, novedades, preguntas, procedimientos y continuidad entre abogados. Se conservaron las restricciones de publicación, privacidad y cotejo.

## Matriz por ruta

“Revisión estática” significa inspección de la implementación, no ejecución acreditada. Los pendientes describen comprobaciones o mejoras que todavía requieren trabajo.

| Ruta | Función principal | Problema observado | Cambio o pendiente |
|---|---|---|---|
| `/academico` | Investigar, escribir y enseñar | Herramientas académicas dispersas y editor sin versiones recuperables | Ruta propia, tres recorridos, fuentes persistentes, guardado automático, historial y Word. UI y flujo nativo verificados. |
| `/agente/archivo` | Consultar conversaciones anteriores | El archivo puede confundirse con otro asistente activo | Se mantiene como consulta histórica; el trabajo nuevo conduce a ALTAZOR. Revisión estática. |
| `/agente` | Abrir el asistente contextual | Enlaces heredados podían fragmentar la entrada al asistente | Adaptador conserva causa/documento accesible y prepara la intención; los pasajes se eligen expresamente. Revisión estática del adaptador. |
| `/audiencias/[workspaceId]` | Acompañar una audiencia | La cantidad de herramientas exige separar uso inmediato de preparación | En vivo, fuentes, lectura y notas están visibles; preparación y análisis son progresivos. Textos simplificados; no se afirma prueba de audio real. |
| `/audiencias` | Encontrar o preparar una audiencia | Elegir causa y mesa debe preceder al panel en vivo | Se conserva el flujo causa → mesa → panel y los estados de sesión. Revisión estática. |
| `/auditoria` | Revisar actuaciones y cambios | Información de control distinta del trabajo jurídico diario | Se mantienen filtros y acceso restringido; no se altera el registro. Revisión estática. |
| `/ayuda/mesa-asistente` | Configurar el entorno de trabajo del asistente | Contiene instrucciones técnicas para el administrador | Se conserva como ayuda especializada, separada de las acciones diarias. Revisión estática. |
| `/biblioteca/[id]` | Leer y citar un libro o sentencia | La explicación del reconocimiento y el recuento de fragmentos era técnica | Texto de lectura más claro; se conservan página del original, límites y datos de cotejo bajo detalles. Revisión estática de este lector. |
| `/biblioteca` | Organizar libros y colecciones | Importación, lectura y escritura comparten superficie | Se conservan apartados por tarea y personalización progresiva; privacidad y originales siguen explícitos. Revisión estática. |
| `/buscar` | Encontrar asuntos y materiales | Resultados de distintos ámbitos necesitan destinos reconocibles | Inventario de buscador, filtros y enlaces; pendiente prueba transversal con resultados numerosos y teclado. |
| `/calendario` | Consultar y organizar fechas | Varios tipos de fecha comparten la vista | Se conservan distinciones entre eventos, plazos y audiencias. Pendiente validación visual de arrastre con zoom y móvil. |
| `/causas/[id]/audiencias` | Trabajar en audiencias de una causa | Puede confundirse con el panel independiente | Se mantiene el enlace al panel independiente y el ámbito de la causa. Revisión estática. |
| `/causas/[id]/editar` | Modificar la ficha procesal | Formulario amplio por los datos legales necesarios | No se eliminan datos ni permisos; pendiente completar estados de error visuales con datos extremos. |
| `/causas/[id]/escritos` | Redactar y fundamentar un escrito | Sólo había descarga Markdown y TXT | Word real con notas al pie nativas, apéndice y comprobación actual de fuentes. Los otros formatos son secundarios. |
| `/causas/[id]/mesa` | Preparar documentos con el asistente | El ejecutor opcional puede confundirse con una función lista para usar | Se conserva el estado de configuración y el encargo revisable. Revisión estática; no se prueba un escritorio remoto. |
| `/causas/[id]/minuta/nueva` | Registrar una actuación y sus tareas | Uso visible de handoff, Markdown y stub; plantillas inválidas podían interrumpir el formulario | Textos normales, aviso de carpeta comprensible y lectura protegida de plantillas. Se mantienen publicación, etapa y avisos expresos. |
| `/causas/[id]/minutas/[minutaId]` | Consultar una minuta y sus acuerdos | Cambios y próximas acciones deben distinguirse del contenido registrado | Se conservan resumen, acuerdos y seguimiento. Revisión estática; no se cambia el contenido jurídico. |
| `/causas/[id]` | Preparar y seguir una causa | Documentos mostraban el formato interno Markdown como acción | Acción renombrada Texto preparado. Se conservan las fuentes, cuadernos, permisos y continuidad entre apartados. |
| `/causas/mis-causas` | Importar la cartera judicial | Ingreso y configuración histórica comparten recorrido | Nueva entrada de Sincronización concentra el flujo manual; la sesión oficial sigue siendo del profesional. Revisión estática, sin ingreso real. |
| `/causas/monitoreo` | Revisar novedades de la cartera | Movimientos y descargas necesitan estados diferentes | Se conserva seguimiento y se remite al estado de documentos de Sincronización. Revisión estática del enlace y componentes. |
| `/causas/nueva` | Abrir una causa | Carga de información extensa pero propia del trabajo jurídico | Se mantienen identificación y partes; no se ocultan RIT, RUC ni tribunal. Revisión estática. |
| `/causas` | Consultar la cartera | Filtros y acciones masivas pueden aumentar la densidad | Se mantienen filtros y selección explícita; pendiente prueba visual con cartera extensa y nombres largos. |
| `/clientes/[id]` | Consultar antecedentes del cliente | IA, documentos y causas deben mantener la identidad del cliente | Revisados enlaces y componentes vinculados; no se cambia la separación de accesos. Pendiente recorrido completo con varios expedientes. |
| `/clientes` | Gestionar clientes | El alta y la lista comparten pantalla | Se conserva el formulario acotado y el vínculo a la ficha. Revisión estática. |
| `/configuracion` | Configurar el estudio y el Host | Información técnica abundante | Se permite aquí información adicional; no se traslada a los formularios de trabajo. Revisión estática. |
| `/correo` | Trabajar con los buzones | Lectura, clasificación y envío tienen efectos distintos | Se conservan acciones y confirmaciones existentes; no se envían mensajes durante esta revisión. Revisión estática. |
| `/cuenta/notificaciones` | Elegir avisos personales | Información técnica del canal Telegram permanece visible | Se identifica como configuración; pendiente uniformar terminología de canales sin alterar avisos procesales. |
| `/cuenta` | Gestionar acceso y preferencias personales | Seguridad y conexiones necesitan contexto propio | Se conservan contraseña, segundo factor y conexiones personales. Revisión estática, sin credenciales reales. |
| `/dashboard` | Consultar el resumen del estudio | Convive con el inicio centrado en ALTAZOR | Se conserva como resumen operativo; no se crea otro bot. Pendiente medir uso antes de retirar accesos heredados. |
| `/documentos/[id]/fuentes` | Leer el original y cotejar citas | La localización debe distinguir página física de pasaje | Se conservan versión, imagen y limitaciones de extracción. Identificadores de integridad permanecen en detalles. Revisión estática. |
| `/documentos` | Incorporar, leer y consultar documentos | VDR/matter, OAuth/stub e identificadores técnicos visibles; reintentos no informaban fallos | Textos directos, procedencia y ubicaciones en detalles, descarga de texto clara; reintento muestra error o confirmación reales. |
| `/facturacion/cuenta-corriente` | Consultar cargos y pagos | Requiere explicar el sentido del saldo sin esconderlo | Se mantiene la explicación y el alcance de exportación; no se cambian cálculos ni efectos contables. Revisión estática. |
| `/facturacion/facturas/[id]` | Revisar un documento de cobro | Asistencia y pagos requieren distinguir propuesta de confirmación | Se conservan acciones y estados; no se generan cobros ni documentos tributarios durante la revisión. Revisión estática. |
| `/facturacion/facturas` | Organizar facturas y boletas | CSV/XML son formatos técnicos pero aclaran el alcance real | Se mantiene el límite del facturador externo; pendiente revisión visual de listados grandes. Revisión estática. |
| `/facturacion/gastos` | Registrar desembolsos | Formulario vinculado a cliente y causa | Inventario del formulario y acciones; sin cambios de permisos ni montos. Revisión estática. |
| `/facturacion/horas` | Registrar trabajo facturable | Tiempo y tarifa deben conservar su relación con el asunto | Se conserva el registro y la agrupación; pendiente prueba visual de filtros y edición con fechas extremas. |
| `/facturacion` | Consultar la situación de cobros | Resumen y navegación secundaria pueden ser densos | Revisión estática de entradas y componentes; no se elimina información financiera útil. |
| `/facturacion/tarifas` | Acordar honorarios | Modalidades diferentes requieren precisión del formulario | Se conservan las modalidades y condiciones; no se reinterpreta su contenido económico. Revisión estática. |
| `/facturacion/uf` | Consultar valores de conversión | Unidad, fecha y moneda son esenciales | Se conservan expresamente; no se validaron valores monetarios contra servicios externos en esta revisión. |
| `/flujos` | Revisar procesos del estudio | Acciones de proceso pueden confundirse con su configuración | Inventario de acciones y estados; pendiente recorrido con un proceso completo y varios responsables. |
| `/inicio` | Conversar y delegar a ALTAZOR | Antes había entradas separadas al acompañante | Implementación coordinada de un acompañante persistente, con memoria, tareas y conexiones progresivas. Revisión estática aquí; capturas generales a cargo de la revisión de Inicio. |
| `/integraciones` | Configurar servicios del estudio | Explicaciones de OAuth y endpoints | Se mantiene como configuración técnica, separada de Conexiones personales y de Sincronización. Revisión estática. |
| `/jurisprudencia/fuentes/[id]` | Leer y citar una fuente conservada | Una fuente importada no acredita automáticamente vigencia o autoridad | Se conservan versión, texto e integridad bajo detalles; no se convierte una búsqueda de metadatos en cita corroborada. Revisión estática. |
| `/jurisprudencia` | Investigar fuentes jurídicas | Búsqueda, biblioteca e incorporación comparten pantalla | Se mantienen la elección de fuentes y los límites de cobertura; pendiente recorrido visual completo con resultados oficiales y fallos de acceso. |
| `/mensajes` | Leer conversaciones del equipo | No debe confundirse con el asistente personal | Se mantiene la mensajería del estudio; no se envía ningún mensaje en esta revisión. Revisión estática. |
| `/minutas` | Retomar actas y administrar plantillas | Crear una plantilla exigía escribir JSON | Campos normales y tipos legibles; formato avanzado opcional y validado. JSON malformado ya no puede romper la aplicación de la plantilla. |
| `/notificaciones` | Consultar avisos | Un aviso leído no modifica el estado procesal | Se conservan sus acciones específicas y destinos. Revisión estática. |
| `/personas` | Gestionar personas del equipo | Convive con clientes y miembros de espacios | Se mantiene su ámbito del estudio; pendiente revisar visualmente el alta con permisos distintos. |
| `/plazos` | Consultar y registrar vencimientos | Datos legales y cómputo no deben confundirse con configuración | Se conservan tipos y advertencias existentes; no se recalculan plazos reales ni se retiran controles jurídicos. Revisión estática. |
| `/portal` | Consultar lo compartido con el cliente | Texto de entrada usaba matter | Explicación en español directo; archivos y preguntas mantienen el mismo control de publicación. Revisión estática. |
| `/sincronizacion` | Actualizar causas y archivos | Ingreso y automatización necesitaban un acceso único | Recorrido coordinado con Poder Judicial y Drive, estados de sesión y descargas. Revisión estática aquí; no se acredita una conexión real nueva. |
| `/sites/[id]/archivos/[fileId]/fuentes` | Leer y cotejar archivos del espacio | Debe conservar acceso de cada versión | Se mantiene el lector común de fuentes con el ámbito del espacio. Revisión estática. |
| `/sites/[id]/archivos` | Organizar archivos compartidos | VDR/data room/metadatos como descripción principal | Carpetas y archivos en lenguaje directo; compartir mediante etiqueta cliente permanece explícito. Importación conserva el mismo comportamiento. |
| `/sites/[id]/blog` | Publicar novedades del espacio | Descripción usaba matter | Texto simplificado a novedades del espacio; revisión y publicación siguen siendo expresas. Revisión estática. |
| `/sites/[id]/flujos` | Ejecutar los procesos de un espacio | Debe mantener el ámbito del equipo | Se conservan acciones y acceso al proceso; pendiente prueba visual con distintas etapas. |
| `/sites/[id]/isheets/[sheetId]` | Editar una tabla compartida | Tipos de columna pueden requerir ayuda contextual | Inventario del editor y formulario; pendiente revisión visual de tablas anchas y edición por teclado. |
| `/sites/[id]/isheets` | Organizar tablas del equipo | Issues log/reporting/matter sin explicación directa | Descripción y vacío en lenguaje de seguimiento jurídico. Pendiente unificar la etiqueta histórica iSheets en la navegación. |
| `/sites/[id]` | Consultar el trabajo de un espacio | Resumen, herramientas y ajustes conviven | Se conservan acceso, contexto y vínculos; ajustes permanecen secundarios. Revisión estática. |
| `/sites/[id]/personas` | Gestionar miembros de un espacio | Miembros y grupos tienen efectos distintos | Se conserva la distinción y las comprobaciones existentes. Revisión estática, sin alterar permisos. |
| `/sites/[id]/qa` | Registrar preguntas y respuestas | Q&A aparecía como explicación principal | Descripción y vacío explican preguntas del cliente y del equipo. Las respuestas oficiales conservan su acción explícita. |
| `/sites/[id]/tareas` | Coordinar las tareas del espacio | No debe confundirse con todas las tareas del estudio | Se mantiene el ámbito del espacio y la creación acotada. Revisión estática. |
| `/sites/[id]/wiki` | Documentar acuerdos y procedimientos | Playbooks/checklists/home/Markdown como introducción | Entrada en español directo; edición conserva su formato y versiones. Pendiente editor enriquecido con vista previa. |
| `/sites` | Encontrar o crear espacios de equipo | La variedad de tipos puede dificultar el primer uso | Se conservan guía y filtros; pendiente revisar el alta con un estudio nuevo y pocas causas. |
| `/tareas` | Consultar el trabajo pendiente | La lista global puede mezclar procedencias | Se conservan filtros y enlaces al ámbito de cada tarea. Revisión estática; pendiente prueba con carga amplia. |

## Verificación y límites

- Académico: creación, conservación de tarea y fuentes tras recargar, propuesta con citas, guardado automático, descarga Word/Markdown, borrador privado para LinkedIn, incorporación a escrito, recuperación de versión y rechazo de fuentes retiradas.
- Descubrimiento: consentimiento de consulta, búsqueda de prueba, búsqueda guardada, importación y exportación bibliográfica, persistencia y ancho móvil. Los resultados de búsqueda fueron sintéticos; no se acredita cobertura real de un proveedor por esta prueba.
- Dominio académico: aislamiento por propietario, conflictos entre versiones, historial original, guardados sin duplicación, recuperación no marcada como revisada, alteración de versiones y revocación de fuentes.
- Herramientas académicas del bot: plan nativo confirmado, proyecto privado, fuentes y destino obtenidos del servidor, selección ligada al turno exacto, reintentos sin duplicados y denegación al retirarse una fuente. La preparación no ejecuta el modelo ni publica.
- Word jurídico: descarga desde la aplicación por HTTP, seis piezas OOXML válidas, notas al pie reales y relaciones internas; pruebas de referencias desconocidas, definiciones manuales, integridad del archivo, propietario, causa y revocación de fuentes. Un escrito ficticio se abrió con LibreOffice empaquetado, se renderizó en dos páginas y ambas se inspeccionaron visualmente; las citas repetidas conservan notas completas y las fuentes comienzan en otro folio. La comprobación no equivale a presentar el escrito en un tribunal.
- Plantillas de minutas: formulario real con campos normales, persistencia de textos y próximos pasos, y rechazo HTTP 400 de un formato avanzado inválido, con cuenta ficticia.
- Los cambios de textos no modifican permisos, efectos de publicación, cálculos de plazos ni importes. Las pantallas financieras y de seguridad conservan sus límites explícitos.

La documentación de cada prueba y las capturas de la aplicación acompañan al README. Una opción configurada, una sesión abierta o una prueba con respuestas ficticias no debe describirse como integración externa real validada.
