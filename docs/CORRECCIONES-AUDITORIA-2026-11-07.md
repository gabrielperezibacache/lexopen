# Continuación de la auditoría de LexOpen

Fecha: 7 de noviembre de 2026. Cambios locales sobre la aplicación existente, con bases y archivos ficticios para la validación.

## Conservación y revisión del trabajo

| Área | Corrección | Alcance |
| --- | --- | --- |
| Audio de audiencias | Los tramos finalizados se guardan en IndexedDB antes de enviarlos, con la identidad original de la petición. La recuperación exige el usuario y la mesa autorizados y una acción expresa para enviar. | Recuperación tras recarga y reapertura del mismo perfil. Caducidad de ocho horas, cuatro MiB por tramo y presupuesto local de 64 MiB. Si el navegador deniega almacenamiento, se detiene la captura y se ofrece guardar o descargar. El sonido que el navegador aún no ha entregado como tramo no queda garantizado frente a un cierre abrupto. |
| Escritos | Decisión profesional inmutable por versión, permiso específico `escrito.approve`, profesional identificado, observaciones, cotejo expreso y huellas del texto y de sus referencias. | La revisión la registra el titular del escrito privado. Editar, incorporar una fuente o recuperar otra versión exige una nueva revisión. La revisión por un segundo profesional requiere todavía un flujo de asignación. |
| Exportación | Descarga de borrador o de versión aprobada; esta última exige una aprobación vigente. Se vuelven a comprobar fuentes, acceso y versión solicitada. | Recibo de generación con formato, revisión, aprobación, tamaño y SHA-256 de los bytes. Recibo y auditoría son atómicos. Retirar `escrito.approve` bloquea tanto el reintento de aprobación como la liberación de una versión aprobada. Identifica el archivo producido; no acredita recepción externa ni presentación judicial. |
| Plazos | El cálculo automático exige Chile como país de trabajo y conserva el país y régimen interno utilizados. | País sin configurar u otro país: fecha revisada manualmente. El régimen interno sigue siendo una estimación con las reglas ya existentes; los regímenes procesales específicos y los motores de otros países quedan pendientes. No se recalculan fechas históricas. |
| Biblioteca | Búsqueda BM25 en dos pasadas y lotes de hasta 500 fragmentos, sobre toda la selección autorizada. | Desaparece la ventana inicial de 3.000 fragmentos. Las colecciones admitidas pueden aportar hasta 200 libros cada una; se conserva el límite de diez colecciones, veinte libros individuales y doce resultados. Las citas y los permisos se vuelven a comprobar. |
| Bibliografía | ISBN-10/13 normalizado y validado, intercambio RIS/BibTeX y coincidencias conservadoras por título, autor y año. | Los identificadores incompatibles, las ediciones distintas y las coincidencias ambiguas permanecen separados. Una coincidencia no sustituye los metadatos registrados. La procedencia de libros privados conserva sus controles de acceso. |
| WhatsApp | Adaptadores operativos de Meta y Twilio, plantillas sin variables, secretos cifrados, vinculación de un uso con firmas verificadas y baja. | Preferencias explícitas; revalida acceso antes de enviar y conserva los resultados inciertos para reconciliación. Validación con transportes ficticios. Requiere configurar credenciales, plantilla aprobada y webhook HTTPS para uso real. |
| Trabajo sin conexión | Espacio cifrado de escritos preparados y Clientes y tareas, recuperable tras recarga, con creaciones locales y sincronización manual e idempotente. | Rechaza conflictos, cambios de cuenta y permisos retirados; controla concurrencia y cuota. El service worker conserva solo el shell público y elimina la caché antigua. Las asignaciones y los vínculos con causas preparadas funcionan sin red; las opciones nuevas, fuentes y revisiones requieren conexión. |
| CRM | Edición y eliminación incluyen la comprobación actual de permisos, el cambio y la auditoría en una misma transacción. | Un fallo de auditoría conserva el estado anterior. Se mantiene la protección de clientes con causas o facturas relacionadas. |

Las correcciones anteriores de dependencias, contadores de Clientes, permisos de Flujos y creación idempotente de clientes se conservan.

## Interfaz y pruebas continuas

El selector de archivos de Altazor tiene nombre accesible. El formulario de Clientes y el menú móvil devuelven el foco a sus botones de apertura al cerrarse, también cuando el motor no enfoca los botones al hacer clic.

La prueba de integración de la mesa de tareas, las regresiones de revisiones, país, volumen y bibliografía forman parte de los scripts ejecutados en CI. Los formularios y la aprobación de escritos tienen proyectos de prueba para Firefox y WebKit, además de Chromium. La captura nativa usa un trabajo separado de Chromium sobre el servidor compilado, con CSRF de producción y almacenamiento temporal explícito; así no depende de las recargas del servidor de desarrollo.

## Comprobaciones realizadas

- Batería unitaria completa, integración PostgreSQL completa y repetición del área de Altazor tras el cambio bibliográfico.
- Lint, TypeScript, compilación de producción y comparación entre migraciones y esquema sin diferencias.
- Colección real de prueba: 21 libros y 3.601 fragmentos preparados; hallazgo en el último volumen, cobertura completa y lotes de hasta 500.
- Fallos de auditoría provocados en PostgreSQL: revisión, exportación y creación, edición y eliminación de clientes. Ninguno deja un cambio parcial.
- Navegador: recorridos de causas, escritos, acceso, Clientes y Flujos; recuperación de audio después de recargar y de cerrar y reabrir un perfil temporal; reintento de transcripción sin perder el original, almacenamiento local denegado y recuperación después de volver a autenticarse.

Firefox presenta en este Mac un fallo de arranque del compositor gráfico antes de abrir la aplicación. Su proyecto permanece configurado para CI; la ejecución local de ese motor no queda validada.

## Actualización del Host

Se añaden las migraciones `20261107190000_writing_reviews` y `20261107191000_deadline_jurisdiction`. Crean las tablas de revisión y generación y agregan procedencia opcional a los plazos. Tras el respaldo habitual y antes de arrancar la versión actualizada, aplicar `prisma migrate deploy`. La validación de estas migraciones se hizo en bases desechables; no se migró el Host del estudio.

## Pendientes que siguen abiertos

Los pilotos con cuentas reales de Drive, correo y OJV, la firma y notarización de instaladores y la restauración en equipos nuevos necesitan sus cuentas, certificados y equipos objetivo. WhatsApp dispone de implementación y pruebas ficticias; queda pendiente el piloto con proveedor real. El modo sin conexión ya permite editar escritos preparados y crear o editar Clientes, tareas, causas manuales y plazos con fechas revisadas; extenderlo a otros módulos queda pendiente. También siguen pendientes la ampliación y evaluación profesional del corpus jurídico, la medición de modelos en el hardware final y la separación de los grandes módulos judicial y Google. Son ampliaciones o validaciones posteriores; no se consideran cerradas por estas pruebas.

La selección de la etapa anterior reúne 27 escenarios distintos comprobados entre Chromium y WebKit, incluidos cinco de captura nativa con entrada y transcriptor ficticios. Las pruebas de reconocimiento no miden fidelidad de voz real.

Novedades y el recorrido académico ya existen. Los planes anteriores deben leerse como planes fechados; este registro distingue los cambios actuales de sus siguientes ampliaciones.

La implementación y preparación de WhatsApp y del espacio local se describen en [WhatsApp y escritos sin conexión](WHATSAPP-Y-OFFLINE.md). Este incremento no agrega migraciones.

## Verificación del incremento de WhatsApp y trabajo sin conexión

- `npm test` y `npm run test:integration`: baterías completas aprobadas sobre PostgreSQL desechable; contratos de Meta y Twilio sin envíos reales. Se repitió la integración de WhatsApp al agregar la invalidación de vínculos por cambio de número del negocio.
- `npm run lint`, TypeScript sin emisión, `git diff --check` y compilación de producción de Next con Webpack: aprobados. La compilación se hizo en una copia aislada, sin copiar `.env` ni datos privados.
- 48 casos de la selección de navegador comprobados: 31 de Chromium, cinco de captura nativa y doce de WebKit. Incluyen veinte ejecuciones de los escenarios nuevos de WhatsApp y espacio local entre ambos motores. Los seis casos de escritos se verificaron con la misma carpeta temporal de originales que el servidor; se mantienen sus comprobaciones de permisos y citas. Las peticiones HTTP de los fixtures ahora aportan origen y CSRF de producción.
- Creación del espacio con la tecla Intro, cifrado, recarga sin red y sincronización: repetidos con éxito en Chromium y WebKit. Revisión visual a 360 y 1.440 píxeles, sin desbordamientos.
- No se ejecutó Firefox localmente por el fallo de arranque gráfico ya documentado. Sus proyectos incluyen las regresiones nuevas para CI. No se validaron teléfonos ni cuentas de proveedores reales.

El indicador de red solo anuncia el estado sin conexión cuando corresponde; evita crear un segundo estado accesible vacío en las pantallas de búsqueda.

La ampliación a Clientes y tareas se describe en [Trabajo sin conexión](TRABAJO-SIN-CONEXION.md). Reutiliza los recibos transaccionales existentes y no requiere migraciones adicionales.

## Ampliación sin conexión a Clientes y tareas

Se incorporan altas locales y edición de copias preparadas de Clientes y tareas en el mismo almacén cifrado. Los escritos y sus peticiones existentes se conservan. Las nuevas rutas de preparación y sincronización entregan datos mínimos sin caché, comprueban el actor y la autorización actual y comparan una huella de la versión completa antes de actualizar. Los recibos de operación se confirman con el cambio y contienen únicamente identidad y versión. Los rechazos de validación anteriores al cambio permiten corregir el borrador; las respuestas perdidas conservan la petición original.

La edición en línea de Clientes también aporta una versión de partida y conserva el formulario ante conflictos. Al abrir el espacio local guarda primero los cambios; durante ese guardado evita modificaciones que quedarían fuera de la petición. Las tareas reutilizan el servicio normal, con historial, espejos, recurrencias y flujos dentro de la misma transacción. El límite conjunto es de 100 registros locales, incluidos hasta 40 escritos, y 16 MiB.

Validación de este incremento:

- Suite unitaria completa y suite de integración PostgreSQL completa aprobadas. Se ajustó una expectativa del contrato de aprobaciones de Altazor a sus campos actuales, conservando las comprobaciones de vinculación y ausencia de datos privados.
- Integración específica de sincronización: creaciones y actualizaciones concurrentes, reintentos, claves con otros datos, control de versión en ambos sentidos, recibo anterior frente a versión posterior, sesión y rol retirados y pérdida de acceso al expediente. Un fallo de auditoría revierte también la creación de Clientes y tareas y su recibo; completar una tarea recurrente mediante peticiones repetidas produce un único sucesor, historial e inicio de flujo.
- Lint, TypeScript, compilación de producción y comprobación del diff aprobados.
- 75 pruebas de navegador aprobadas: 45 de Chromium, cinco de captura nativa y 25 de WebKit. Incluyen 26 ejecuciones de los trece escenarios nuevos de Clientes y tareas, la conservación del espacio cifrado anterior y las regresiones existentes de escritos, WhatsApp, CRM, Flujos, Tareas, navegación y audio.
- Ocho comprobaciones adicionales aprobadas después de compactar la interfaz móvil: creación y edición, recarga cifrada y conservación de escritos anteriores en ambos motores. Revisión visual a 360 y 1.440 píxeles sin desbordamientos.

Se usaron bases, cuentas y archivos ficticios y un servidor compilado aislado. Firefox permanece en CI; no se repitió su arranque local por el fallo del compositor ya documentado. No se ejecutaron operaciones sobre datos del estudio. [Guía de uso](TRABAJO-SIN-CONEXION.md).

## Asignaciones y vínculos sin conexión

Clientes y tareas pueden cambiar responsables con opciones preparadas en el almacén cifrado. Clientes permite añadir y retirar vínculos explícitos con causas autorizadas; las causas ocultas o no elegidas se conservan. Al sustituir el cliente de una causa se actualizan sus tareas con cliente asociado, tras comprobar permiso sobre todas ellas. Tareas permite mover o retirar la causa de una tarea manual sin anclajes; los orígenes, espacios y jerarquías se conservan.

Las referencias versionadas incluyen perfil del responsable, acceso y equipo de la causa, cliente asociado y contexto de la tarea. La comprobación de permisos, los cambios de relaciones, las tareas dependientes, la revisión de conflictos, el historial, la auditoría y el recibo se realizan en una transacción. Las respuestas perdidas repiten la petición exacta, mientras las elecciones posteriores permanecen pendientes. Una referencia rechazada consume su identidad sin modificar datos; restaurar su estado o permisos no reactiva aquel envío. Revisar y confirmar expresamente las referencias conserva los campos locales y permite preparar otra petición.

Se mantienen las copias y peticiones anteriores. Los catálogos se guardan cifrados únicamente cuando se preparan opciones; las búsquedas no se almacenan como un directorio completo. El shell público pasa a seis archivos y no incorpora caché de API ni páginas autenticadas. Bloquear durante un guardado ya no puede dejar una sal incompleta o una copia ilegible. Se conserva el límite de 100 registros, hasta 100 opciones de cada tipo, 16 MiB, 20 cambios de causas por petición y 100 tareas dependientes.

También se corrige el sucesor recurrente del servicio común de Tareas: al completar y reasignar o mover una tarea simultáneamente, hereda los campos, fecha, responsable, causa y cliente ya confirmados. Los reintentos producen un único sucesor. Este incremento no requiere migraciones nuevas.

Validación del incremento de asignaciones y vínculos:

- `npm test`, `npm run test:integration` y `npm run test:offline:integration`: aprobados con PostgreSQL y datos desechables. Se repitieron las baterías tras corregir la herencia del sucesor recurrente.
- Referencias y permisos actuales, versiones obsoletas, origen y jerarquía protegidos, altas con responsable y causa, reintentos concurrentes, rechazo duradero incluso tras restaurar el estado anterior, revocación de la delegación original y conservación de causas ocultas. Fallos de auditoría provocados revierten Cliente, causa, tareas dependientes y recibo.
- Lint, TypeScript sin emisión, `git diff --check`, comprobaciones de sintaxis de los módulos públicos y compilación de producción con Webpack: aprobados. Se usó una copia aislada sin `.env` ni datos del estudio.
- 88 casos de la selección de navegador validados: 50 de Chromium, cinco de captura nativa y 33 de WebKit. Los 16 nuevos cubren referencias cifradas y recarga sin red, cambios posteriores a una respuesta perdida, revisión expresa de referencias rechazadas, permisos retirados, compatibilidad con peticiones anteriores, bloqueo durante el guardado y un único sucesor recurrente con los vínculos y campos confirmados.
- El recorrido antiguo de acceso necesitaba origen y token CSRF para ejercitar las mutaciones sobre el servidor compilado. Sus selectores se acotaron al contenido principal para evitar las copias temporales de las transiciones; sus cuatro casos se repitieron y aprobaron.
- Revisión móvil y de escritorio a 360 y 1.440 píxeles, con confirmación final sin desbordamientos. Firefox permanece configurado para CI y no se volvió a ejecutar localmente por el fallo del compositor ya documentado.

Las opciones nuevas se preparan con conexión; sin red se trabaja con las ya cifradas. Los vínculos fijados por el origen o la jerarquía de una tarea se conservan. [Guía de uso actualizada](TRABAJO-SIN-CONEXION.md).

## Causas y plazos sin conexión

Se amplía el almacén cifrado existente con causas y plazos. Las causas admiten altas manuales, edición de ficha y hasta 50 partes. Se conservan el origen, equipo, acceso, cliente y conexiones externas de las copias preparadas; esas relaciones se gestionan con conexión. El Host comprueba referencias duplicadas y conflictos de interés dentro de la transacción. Una coincidencia bloqueante conserva la copia y requiere revisión autorizada con conexión, sin exponer identidades reservadas. Partes, membresía, etapas, actividades, auditoría y recibo se confirman o revierten juntos.

Los plazos admiten altas y edición con fechas revisadas expresamente, estado, responsable y causa preparada. No se añade un cálculo procesal sin red. Se conserva el cálculo registrado cuando no se cambian sus datos; modificar fecha límite, notificación o tipo de cómputo requiere confirmación y retira la procedencia y los días del cálculo anterior. Las fechas civiles se conservan y también se muestran con el mes en palabras para facilitar su revisión. Los plazos derivados conservan los datos de origen y permiten actualizar su estado con permisos vigentes. Sus fuentes, confidencialidad y el contexto de la causa intervienen en la versión de partida. Cambiar el procedimiento o la causa invalida una revisión anterior del plazo.

Una causa nueva puede seleccionarse como dependencia local de un plazo. El plazo espera a que todos los cambios pendientes de la causa se sincronicen y se confirmen; una respuesta perdida reutiliza la petición exacta y conserva los cambios posteriores de ambos registros. Los identificadores provisionales no se envían al Host.

El permiso de edición, el de cierre, los responsables y las causas de origen y destino se revisan también al recuperar un recibo, incluidos plazos sin causa. La ruta normal de plazos resuelve de nuevo al actor y rechaza la membresía de sólo lectura. El alta normal de causas vuelve a comprobar duplicados y conflictos en la transacción serializable; las comprobaciones y la auditoría usan los permisos actuales. El formulario de edición de causas aporta su versión inicial y conserva los campos ante una actualización posterior desde el espacio local.

No cambia el formato del almacén: se conservan escritos, Clientes, tareas, opciones cifradas y peticiones anteriores. Se mantienen AES-256-GCM, PBKDF2-SHA-256, las cuotas existentes, el bloqueo y la protección frente a otra pestaña. El shell público v5 conserva los mismos seis archivos públicos y no almacena respuestas autenticadas. Este incremento no requiere migraciones nuevas.

Validación de causas y plazos:

- `npm test` e integración PostgreSQL completa: aprobados. La integración específica sin conexión se repitió con las versiones de causas de origen, plazos sin causa, permisos de cierre retirados, fechas inválidas y referencias rechazadas aunque se restaure su estado anterior.
- Fallos reales de auditoría provocados en PostgreSQL para altas y cambios de causas y plazos: no quedan partes, membresías, etapas, actividades ni recibos parciales. Las altas concurrentes y los reintentos confirman un único registro y un único cambio de etapa.
- Compilación de producción y TypeScript en la copia aislada: aprobados; lint de los archivos del incremento y `git diff --check` sin errores ni avisos. La comprobación final global de TypeScript y lint también quedó aprobada, sin errores ni avisos.
- 100 casos de la selección completa de navegador aprobados: 56 de Chromium, cinco de captura nativa y 39 de WebKit. Incluyen doce ejecuciones nuevas de causas y plazos, además de las regresiones de Clientes, tareas, vínculos, escritos, WhatsApp, CRM, Flujos, acceso y navegación.
- Se añade una prueba de alta concurrente entre `/api/causas` y `/api/offline/sync`: un único registro, etapa, membresía y auditoría. Con ella se validan 101 casos distintos. Se repitieron los casos nuevos y de vínculos después de reforzar el contexto de las causas y la espera de las dependencias locales.
- Revisión visual a 360 y 1.440 píxeles de causas y plazos; confirmación de las fechas expresadas en palabras, sin desbordamientos. Firefox permanece configurado para CI y no se validó en este Mac por el fallo del compositor ya registrado.

La comprobación global final de TypeScript y lint pasó una vez disponibles los módulos de Altazor que se estaban incorporando al árbol compartido. Las confirmaciones se ejecutaron sobre una compilación aislada de producción, con 29 casos de causas, plazos y vínculos aprobados tras las últimas comprobaciones de contexto y dependencias. No se modificaron datos ni servicios del estudio.

## Notas y minutas sin conexión

Se añaden altas y edición de notas y minutas en el almacén cifrado existente. Se mantienen AES-256-GCM, PBKDF2-SHA-256 con 600.000 iteraciones, el formato v1, las cuotas, el bloqueo y la protección entre pestañas. El shell público v6 añade el módulo de minutas y conserva siete archivos públicos, sin páginas ni respuestas autenticadas. Las copias y peticiones anteriores siguen siendo compatibles.

Las minutas incluyen todos sus campos y hasta 50 acciones con identidades estables y orden conservado. Cada acción permite seguimiento como tarea y plazo, revisión expresa de fechas, estado, prioridad, tipo de cómputo e indicador fatal. Los seguimientos existentes no se desvinculan y las acciones ya enviadas se conservan; pueden cancelarse. Los nuevos seguimientos offline se asignan al actor, conservando los responsables reales existentes. La causa de origen queda fijada; las altas pueden depender de una causa local completamente sincronizada y confirmada.

Minuta, documento Markdown, acciones, tareas, plazos, actividades, avisos, auditoría y recibo se confirman atómicamente. Los recibos conservan identidades y pruebas de autorización, sin repetir texto. Reintentar una respuesta perdida recupera la misma operación y conserva los cambios posteriores para otra petición. Los rechazos de referencias consumen su identidad; restaurar los permisos no reactiva el envío anterior. El cierre comprueba también la edición del plazo. Los conflictos incluyen cambios en documento, acciones, seguimientos y contexto de causa; se conserva la copia local para comparar.

Las rutas normales de minutas comparten las mutaciones atómicas y revalidan permisos. La vista aporta una versión al cambiar el estado de una acción. El documento nuevo hereda la confidencialidad; el filtro de acceso protege también documentos antiguos vinculados a minutas confidenciales aunque su indicador propio no se hubiera propagado. La edición offline no desclasifica ni reemplaza originales físicos o documentos compartidos. Sólo actualiza los campos de seguimiento que cambian, conservando instrucciones independientes. Las fechas civiles se conservan tanto en Markdown como en la vista normal. Las minutas históricas con más de 50 acciones siguen siendo legibles y una ampliación posterior no transforma un recibo confirmado en una operación nueva.

Este incremento requiere la migración `20261107233000_minute_action_options`, con columnas opcionales `orden`, `tipoComputo` y `esFatal`. Se verificó en bases desechables; no se aplicó a los datos del estudio. Al actualizar el Host, ejecute las migraciones habituales y regenere el cliente Prisma. Drive, IA, desclasificación y avance de etapa permanecen como operaciones con conexión.

Validación de notas y minutas:

- `npm test`, `npm run test:integration`, `npm run test:offline:integration` y `npm run typecheck`: aprobados. Lint global y de los archivos finales, sintaxis de los módulos públicos y `git diff --check`: sin errores ni avisos. Compilación de producción con Webpack aprobada en una copia aislada con cliente Prisma propio, sin `.env` ni datos del estudio.
- PostgreSQL desechable: concurrencia y recuperación del mismo recibo, permisos y membresías retirados, cambios de otra sesión, rechazo permanente tras restaurar permisos, protección de confidencialidad y documentos originales, conservación de instrucciones independientes y lectura de minutas históricas extensas. Los fallos de auditoría provocados revierten nota, minuta, documento, acciones, seguimientos, avisos y recibo. La migración coincide con el esquema, sin diferencias.
- 121 casos distintos de navegador validados: 68 de Chromium, 48 de WebKit y cinco de captura nativa. Incluyen las 18 ejecuciones de los nueve escenarios nuevos y las regresiones de escritos, Clientes, tareas, asignaciones, vínculos, causas, plazos, WhatsApp, CRM, Flujos, acceso, navegación y plantillas. La selección principal dio 120 aprobados y un fallo del selector al encontrar la copia temporal de una transición. El selector se acotó a la vista visible y la comprobación de fechas/seguimiento se repitió con éxito en ambos motores; no quedó un fallo funcional pendiente. El fixture antiguo de preparación de causas aporta ahora origen y token CSRF al servidor de producción.
- Revisión visual de acciones a 360 y 1.440 píxeles, sin desbordamientos, y confirmación del día civil en la vista normal. Firefox permanece configurado para CI; no se validó localmente por el fallo del compositor ya registrado. No se realizaron operaciones sobre datos del estudio ni envíos reales a proveedores.

[Guía de uso y actualización del Host](TRABAJO-SIN-CONEXION.md).

## Documentos y adjuntos sin conexión

Se incorporan documentos de causas y archivos de espacios al almacén cifrado, con preparación de originales, descarga sin red, edición de texto y selección o sustitución de archivos. Se mantienen AES-256-GCM, PBKDF2-SHA-256, el formato v1 y las cuotas de 16 MiB y 100 registros. Cada original admite 8 MiB; sus bytes se comparten por huella dentro del contenido cifrado para que la petición pendiente no duplique su espacio. El shell v7 conserva ocho archivos públicos y no incorpora originales ni API a CacheStorage. Bloquear limpia campos, metadatos, historial visible y URLs temporales.

Las altas requieren causas o destinos de espacios/carpetas preparados; los documentos también pueden depender de causas locales completamente confirmadas. Los archivos existentes conservan su causa, espacio y carpeta de origen. Se revalidan actor, sesión, confidencialidad, privilegio, permisos de edición, reservas y contexto antes de escribir y al recuperar recibos. Las copias de lectura mantienen la descarga y bloquean la edición. La desclasificación, publicación nueva en el portal y sustitución de fuentes de PJUD, Drive, Obsidian, audio o minutas requieren conexión. Las revisiones históricas comprueban también los permisos de su causa anterior y sus propios indicadores reservados.

La nueva ruta valida los límites tanto declarados como transmitidos, base64 canónico, tamaño y SHA-256. Un original ausente nunca se reemplaza por texto extraído. Se verifica también la escritura: si el almacenamiento devuelve otros bytes o el original recién cargado no está disponible, se revierte la operación de base de datos y se mantiene la petición reintentable. Las claves nuevas no sustituyen originales compartidos. Tras un resultado confirmado sólo se elimina un intento propio si una misma instantánea demuestra que no lo conserva ningún documento, versión o ingreso. Los fallos de resultado incierto conservan los datos necesarios para recuperar la operación.

Documento o adjunto, revisiones, ingreso manual, actividad, auditoría, flujo de subida y recibo se confirman en una transacción. Los recibos no repiten textos ni archivos. Las respuestas perdidas usan la misma petición y sus mismos bytes; los cambios posteriores se conservan para una revisión nueva. Una alteración temporal posterior del original no obliga a cambiar la identidad de una petición ya confirmada. Los nombres marcados como reservados no se añaden a actividades, payloads de flujos ni auditoría de este flujo.

Las rutas normales de clasificación de documentos y nueva versión de adjuntos comparten permisos actuales y conservación de revisiones. La clasificación desde la causa aporta su versión inicial. Los originales anteriores permanecen recuperables por versión, con paginación. La preparación de texto usa la cola duradera existente y se despierta después del cambio confirmado; los resultados derivados y bloqueos de extracción no cambian la versión del original. Bytes, metadatos de negocio, revisión y contexto sí intervienen en el control de conflictos.

Se añade `20261108010000_offline_file_revisions`: historial de documentos y referencias a originales en `FileVersion`. Debe aplicarse al actualizar el Host y regenerarse el cliente Prisma. Para transportar 8 MiB en base64 se configura el límite de proxy de Next en 12 MiB, conforme a la guía incluida de esta versión; la API mantiene además su propio límite transmitido de 12 MiB. Los demás endpoints conservan sus límites específicos. La migración sólo se ejecutó en bases desechables.

Validación de documentos y adjuntos:

- `npm test`, `npm run test:integration`, `npm run test:offline:integration`, `npm run typecheck`, lint global y compilación de producción con Webpack: aprobados en una copia aislada con cliente Prisma propio. Tras los últimos controles de integridad y privacidad se repitieron las integraciones offline, el caso específico de almacenamiento defectuoso y la comprobación de tipos/lint. La migración coincide con el esquema sin diferencias.
- PostgreSQL desechable: reintentos concurrentes con una sola revisión, historial y flujo; carga simultánea por ingreso normal y offline con un único documento; control de permisos actuales y rechazo duradero; lectura autorizada y confidencialidad histórica; fuentes protegidas, archivos ausentes, huellas alteradas, contenido Unicode y binarios con bytes nulos. Los fallos de auditoría provocados y una escritura que devuelve otros bytes revierten registros, revisiones, ingresos, flujos, auditoría y recibo. Se preservan los originales anteriores.
- 144 casos distintos de navegador validados: 81 de Chromium, 58 de WebKit y cinco de captura nativa. Incluyen veinte ejecuciones de los diez escenarios nuevos, además de las regresiones anteriores y los recorridos de evidencias de documentos/espacios y archivo de causas. La selección amplia dio 141 aprobados y un selector duplicado por la copia de una transición; el recorrido de archivo pasó al acotarlo al contenido principal y aportar CSRF de producción. Los veinte casos de archivos se confirmaron en ambos motores sobre la última compilación.
- Los casos nuevos comprueban descarga byte a byte sin red, IndexedDB cifrado, sustitución con original recuperable, edición normal concurrente, conservación de cambios posteriores a una respuesta perdida, restauración de permisos con revisión expresa, causas locales, texto Unicode y un original de 8 MiB cuya petición pendiente no duplica sus bytes. Se verificó también la recuperación de una petición confirmada después de una alteración temporal del almacenamiento, reutilizando la misma identidad. El límite real del proxy de Next se corrigió y el archivo máximo pasó en ambos motores.
- Revisión visual a 360 y 1.440 píxeles sin desbordamientos. Firefox permanece configurado para CI; no se validó localmente por el fallo del compositor ya registrado. Las pruebas usaron bases, cuentas y archivos ficticios. No se aplicaron migraciones a datos del estudio ni se hicieron envíos a proveedores reales. Los servicios temporales se detuvieron al terminar.

[Guía de uso y límites de archivos](TRABAJO-SIN-CONEXION.md).

## Continuación: Agenda y Trámites sin conexión

Se añaden Agenda y Trámites al almacén cifrado existente y enlaces para preparar registros desde sus vistas normales. Se conserva el formato v1 y sus cuotas; el shell público v8 añade `operations.js` y contiene nueve archivos públicos. No se cachean datos de agenda, respuestas de API ni páginas autenticadas. Bloquear limpia también la lectura de fechas y los avisos de solapamiento.

Agenda admite altas y cambios de ficha, horarios, días completos, estado, responsable y causa preparada. El último día mostrado está incluido y se transmite como fin exclusivo. La creación o modificación del intervalo exige revisión expresa. El Host calcula los solapamientos con su información actual al sincronizar. Los eventos procedentes de Google son de consulta; la integración externa continúa con conexión. Los vínculos fijados por tareas o cliente no se pueden mover desde el espacio local.

Trámites admite altas, cambios de detalle y fecha revisada, orden, asignación, finalización, cancelación y reapertura. La causa de origen queda fijada y las altas pueden esperar una causa local completamente sincronizada. La escritura del trámite y su tarea, historial, actividad, avisos, auditoría, recurrencia y flujo se confirma junto con el recibo. Se actualizan sólo los campos compartidos cambiados, conservando instrucciones, consideraciones, prioridad, recordatorios y otros datos independientes de la tarea. Cualquier cambio posterior de la tarea o contexto desde la preparación exige comparar las copias.

Las dos áreas conservan las peticiones inciertas cifradas y su identidad para recuperarlas tras recargar. Los cambios posteriores al envío se conservan para una petición nueva después de confirmar la anterior. Se revalidan permisos, sesión, delegaciones, acceso del responsable, caso de origen y destino y versiones de referencias. Un rechazo de referencia consume la petición y exige revisión explícita; restaurar temporalmente un perfil no resucita el envío rechazado. Las listas de trámites de causas y Clientes y su API respetan también los muros de acceso de la tarea vinculada.

Las rutas normales de Trámites comparten la transacción y la comprobación de versión. Los formularios muestran errores, conservan sus datos ante conflictos y mantienen inmutable un alta de resultado incierto. Repetir sus datos tras recargar reutiliza una clave conservada por huella; no se guarda el texto del formulario en sessionStorage. Editar sólo el detalle conserva la precisión del vencimiento existente. Aplicar plantillas incorpora recibos e historial en la misma transacción. Las plantillas y sugerencias de IA necesitan conexión. No se añade una migración en este incremento.

[Uso de Agenda y Trámites](TRABAJO-SIN-CONEXION.md#agenda-y-trámites).


Validación de Agenda y Trámites:

- Suite unitaria completa, integración de todas las áreas offline y minutas, integración de plazos/Agenda, tareas, Clientes y Flujos: aprobadas sobre datos ficticios. Se comprueban fallos reales de auditoría con reversión completa, reintentos concurrentes, permisos actuales, rechazo duradero de referencias, conflicto por cambios en tareas y un único sucesor recurrente y flujo de finalización.
- TypeScript, lint global y compilación de producción con Webpack: aprobados en una copia aislada con cliente Prisma propio. La última compilación incluye la conservación de precisión de fechas y los reintentos de formularios normales.
- 179 casos distintos de navegador comprobados: 102 de Chromium, 72 de WebKit y cinco de captura nativa. Incluyen 28 nuevos de Agenda y Trámites y las regresiones anteriores. La selección inicial dio 172 aprobados y tres fallos de fixture: un selector duplicado durante una transición y dos comparaciones que incluían la petición inicial de preparación. Se corrigieron las comprobaciones; los 29 recorridos finales, incluidos esos tres, pasaron sobre la compilación final.
- Los casos nuevos cubren IndexedDB cifrado, bloqueo sin textos ni avisos residuales, recarga sin red, respuestas perdidas con cambios posteriores, conflictos y revocaciones, días completos con fin exclusivo, consulta de eventos de Google y la recuperación de altas normales tras recargar conservando sólo la huella y clave del envío en sessionStorage. Editar el detalle mantiene el instante y milisegundos de su fecha y las instrucciones independientes de la tarea.
- Vistas comprobadas a 360 y 1.440 píxeles. Se amplió el ancho mínimo de los botones para evitar etiquetas superpuestas; la confirmación no mostró desbordamientos. Firefox permanece configurado para CI y no se validó en este Mac. No se modificaron datos del estudio ni se hicieron envíos a proveedores reales. El servidor y PostgreSQL temporales se detuvieron al terminar.

La batería general `npm run test:integration` **no está aprobada en este incremento**: se detuvo en `src/lib/altazor/secrets/computer-secrets.integration.test.ts`. Su simulador de `/v1/health` no anuncia `lexopen_computer_use_policy: "v1"`, que exige el control de autorizaciones del escritorio de Altazor. Los módulos de integración del alcance anterior se ejecutaron y aprobaron por separado; queda pendiente actualizar ese simulador y completar la batería general.


## Revisión de tareas y flujos de trabajo

Tareas valida fechas reales de vencimiento y recordatorio, impide ciclos directos e indirectos en la jerarquía y consulta el perfil, la sesión y las delegaciones vigentes dentro de la transacción. Las rutas generales, de espacios y de reasignación comparten comprobantes de operación; repetir una petición con la misma clave no duplica tareas, historial, avisos, sucesores recurrentes ni instancias de flujo. Los formularios conservan el cuerpo y la clave tras una respuesta incierta y permiten reintentar. Los cambios de estado desde espacios incluyen la versión de la tarea. Las recurrencias con fecha sin hora mantienen la medianoche UTC usada por el espacio de tareas, incluso al cruzar cambios de horario de verano; se comprobó con Santiago, Tokio y Sídney.

Avanzar un flujo exige `expectedStep`: omitirlo produce 400 y una decisión sobre un paso antiguo produce 409. Se mantienen las comprobaciones del rol del paso y del acceso actual al espacio. El cliente conserva la decisión y su clave ante una respuesta perdida o incompleta, bloquea la decisión opuesta mientras se confirma y distribuye los controles dentro del bloque en móvil. Las pruebas verifican aprobación, rechazo, finalización, concurrencia y reversión de creación, inicio y avance si falla la auditoría.

Validación local: `npm test`, `npm run typecheck`, ESLint de los archivos modificados, compilación de producción con TypeScript habilitado, integraciones de tareas/exportación, flujos, permisos, trabajo sin conexión/minutas, plazos y agenda. Se cubrieron 94 casos distintos en Chromium: 91 pasaron en la primera tanda y los tres fallos de preparación/selectores se corrigieron; la última tanda de nueve casos pasó completa sobre la compilación final. Las capturas de escritorio y móvil se revisaron. La compilación aislada reutilizó los archivos tipográficos reales ya disponibles mediante el adaptador de pruebas de Next, debido a la falta de respuesta de Google Fonts. Las bases y registros usados fueron desechables y ficticios. No se descargaron ni instalaron modelos.
