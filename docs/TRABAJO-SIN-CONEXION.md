# Trabajo sin conexión

El espacio local permite editar escritos preparados y preparar o crear Clientes, tareas, causas, plazos, notas, minutas, documentos, adjuntos, eventos de Agenda y trámites sin red. Se abre desde **Trabajo sin conexión** en la aplicación o desde `/offline.html`. Los cambios se envían al Host al pulsar **Sincronizar**, tras comprobar la cuenta, los permisos y la versión del registro.

## Preparar este navegador

Con conexión, cree el espacio con una clave local de al menos 12 caracteres. Es independiente de su contraseña de cuenta y no se envía al Host. Si ya tenía escritos preparados, use la misma clave: sus copias y sus peticiones pendientes se conservan.

- **Escritos:** abra un escrito y pulse **Trabajar sin conexión**. Se guardan primero los cambios del editor. En el espacio local, pulse **Preparar este escrito**.
- **Clientes:** abra la ficha del cliente y pulse **Trabajar sin conexión**. Si modificó el formulario, se guardará antes de abrir el espacio. Pulse **Preparar cliente** para conservar una copia cifrada.
- **Causas:** en la ficha, pulse **Trabajar sin conexión** y después **Preparar causa**. Se comprueba que puede modificarla.
- **Plazos:** en la lista de Plazos, pulse **Sin conexión** y después **Preparar plazo**.
- **Notas:** en la sección Notas de una causa, pulse **Sin conexión** y después **Preparar nota**.
- **Minutas:** abra la minuta, pulse **Trabajar sin conexión** y después **Preparar minuta**. Se comprueban la causa, la confidencialidad y el documento vinculado.
- **Documentos:** desde Documentos o desde la sección de documentos de una causa, pulse **Sin conexión** y **Preparar documento**.
- **Adjuntos:** en Archivos de un espacio, pulse **Sin conexión** y **Preparar adjunto**.
- **Agenda:** en las opciones de un evento, pulse **Preparar sin conexión** y después **Preparar evento**. Los eventos de Google se preparan sólo para consulta.
- **Trámites:** desde una causa o ficha de cliente, pulse **Preparar sin conexión** y después **Preparar trámite**.
- **Tareas:** en la lista de Tareas, el enlace **Sin conexión** aparece para las tareas que puede editar. En el espacio local, pulse **Preparar tarea**.

El espacio tiene las áreas Escritos, Clientes, Tareas, Causas, Plazos, Notas, Minutas, Documentos, Adjuntos, Agenda y Trámites. Al cambiar de área o registro, guarda los cambios pendientes en la copia local. Para cerrar o recargar, espere el estado **Copia local guardada**. Si el navegador aún no los guardó, la página advierte al salir.

## Crear y editar sin red

Con el espacio desbloqueado, los botones para crear un cliente, tarea, causa, plazo, nota, minuta, evento o trámite local crean borradores cifrados en este navegador. No crean registros en el servidor hasta que los sincronice.

| Área | Datos editables sin conexión |
| --- | --- |
| Clientes | Nombre o razón social, RUT, correo, teléfono, tipo, estado, notas, responsable y vínculos con causas preparadas. |
| Tareas | Título, descripción, instrucciones, consideraciones, estado, prioridad, vencimiento, recordatorio, motivo de espera, responsable y causa preparada. |
| Causas | Ficha, referencias RIT/ROL y RUC, tribunal, materia, procedimiento, estado, etapa, carátula, resumen, sala, cuaderno, abogado de contraparte, notificación y hasta 50 partes. |
| Plazos | Título, descripción, fecha límite revisada, notificación, tipo de cómputo registrado, indicador fatal, tipo, estado, responsable y causa preparada. |
| Notas | Título, contenido y etiquetas de la nota. |
| Minutas | Tipo, título, fecha y hora, modalidad, participantes, resumen, hechos, acuerdos, pasos, riesgos, estado tras el acto, etapa sugerida, confidencialidad y hasta 50 acciones con seguimiento. |
| Documentos | Original local, texto editable, nombre, tipo, ruta y aumento de confidencialidad o privilegio. |
| Adjuntos | Original local, texto editable, nombre, etiquetas y aumento de confidencialidad o privilegio. |
| Agenda | Título, tipo, inicio y fin, días completos, lugar, modalidad, enlace, notas, audiencia, tribunal, estado, responsable y causa preparada. |
| Trámites | Título, detalle, estado, fecha límite revisada, orden y responsable. Las altas necesitan causa preparada. |
| Escritos | Título y texto del escrito preparado. |

Las causas nuevas son manuales, se crean a su nombre y registran su membresía, partes, etapa, actividad y auditoría en la misma transacción. El equipo, acceso, cliente, autorizaciones de conflictos y conexiones externas se gestionan con conexión. Los cambios de una ficha preparada conservan esos datos y el origen PJUD, si existe. Las referencias RIT/ROL y RUC con el mismo tribunal se comprueban también frente a altas concurrentes. Las coincidencias reservadas se comunican sin revelar su identidad.

Por defecto, los Clientes y tareas nuevos se asignan a su cuenta y las tareas nuevas no tienen causa. Puede elegir otro responsable o causa preparada en **Responsable y causas**. Buscar opciones nuevas, buscar fuentes, crear escritos, revisar y exportar escritos aprobados requiere conexión. Quitar una copia local no elimina el registro del servidor.

Las fechas y horas de tareas se muestran en la hora local del navegador. Una fecha existente conserva su instante y precisión si no la edita. Al completar una tarea preparada, se aplican las mismas reglas del módulo de Tareas, incluidas sus recurrencias, historial y flujos asociados. Si al completarla cambia sus campos, responsable o causa, el único sucesor recurrente hereda esos valores confirmados.

## Fechas y orígenes de plazos

No se calcula un vencimiento sin conexión. Para crear un plazo o cambiar su fecha límite, notificación o tipo de cómputo, introduzca una fecha revisada y marque **He revisado la fecha límite para el país y el procedimiento aplicables**. Esa confirmación se guarda cifrada con la petición. Cambiar cualquiera de esos datos requiere volver a confirmarla.

Las fechas civiles no se desplazan según la zona del navegador. Si sólo modifica otros datos, se conserva el instante y la procedencia del cálculo registrado. Sustituir sus datos de cálculo convierte la fecha en manual y retira los días y la procedencia anteriores; no atribuye el resultado a un motor jurídico.

Los plazos vinculados a tareas o minutas conservan sus datos de origen y permiten actualizar su estado. Sus fuentes, confidencialidad y versiones también se comprueban. Si cambia la causa o su procedimiento después de preparar el plazo, se conserva la copia y se exige comparar el contexto antes de aplicar una fecha revisada. Marcar un plazo cumplido requiere `plazo.close`, además del permiso de edición; ese permiso se revalida incluso al recuperar un recibo anterior. La membresía de sólo lectura no permite modificarlo.

Puede crear una causa y un plazo vinculados sin red. Seleccione **Copia local · …** en la causa del plazo. Cuando recupere conexión, sincronice primero todos los cambios pendientes de la causa y confirme su resultado, después el plazo. Una respuesta perdida mantiene la dependencia pendiente sin crear otra causa ni enviar un identificador provisional al Host. Los campos de ambos borradores se conservan.

## Notas, minutas y seguimientos

Las notas y minutas nuevas necesitan una causa preparada. También pueden elegir una causa local: sincronice y confirme primero todos los cambios de esa causa. Las copias existentes conservan su causa de origen. Las notas antiguas sin causa requieren permiso general de edición.

Cada acción de una minuta conserva su identidad y posición. Puede añadir acciones, editar sus datos y cambiar su estado; las acciones ya enviadas se conservan y pueden cancelarse. Las tareas y plazos ya generados permanecen vinculados. Si se pierde una respuesta, confirme primero el envío anterior: sus ediciones y nuevas acciones posteriores siguen pendientes, sin repetir sus seguimientos.

El nombre indicado como responsable es una anotación. Los seguimientos nuevos creados desde el espacio local se asignan a su cuenta; los responsables reales de seguimientos existentes se conservan. El Host comprueba por separado el permiso para modificar cada tarea y plazo y, al completar el plazo, el permiso de cierre. Las fechas nuevas o modificadas y los cambios de tipo de cómputo requieren revisión expresa por acción. No se calcula un vencimiento procesal sin conexión.

La minuta, su documento Markdown, acciones, tareas, plazos, actividades, avisos internos, auditoría y recibo se confirman juntos. Sólo se actualizan los campos de seguimiento que cambian en la acción; las instrucciones y otros cambios independientes se conservan. La versión incluye el documento, los seguimientos y el contexto de la causa: si otra sesión los modifica, compare las copias antes de sincronizar.

El documento generado incluye el estado de cada acción. Completar un seguimiento desde la minuta ejecuta los mismos flujos de finalización y crea el mismo sucesor recurrente que completarlo desde Tareas, dentro de la misma transacción. Repetir el recibo no vuelve a generar esos efectos.

En el formulario con conexión, una respuesta perdida o incompleta mantiene el envío original y permite **Reintentar guardado**. Sus opciones permanecen bloqueadas hasta confirmar ese resultado. Un rechazo de validación permite corregir los campos y conservar la identidad de la operación para evitar una creación duplicada.

Las minutas confidenciales requieren el permiso correspondiente. La copia local no permite desclasificarlas. Un documento con original físico, ajeno a la minuta o compartido entre minutas requiere revisión con conexión antes de reemplazarlo. La etapa sugerida es una anotación; avanzar la causa, subir a Drive y usar IA se gestiona con conexión.

Este incremento añade la migración `20261107233000_minute_action_options`, con columnas opcionales para el orden, tipo de cómputo e indicador fatal de las acciones. Aplique las migraciones habituales del Host (`npm run db:migrate`) y genere el cliente Prisma al actualizar. Las acciones anteriores conservan sus datos y toman los valores existentes del plazo cuando corresponde. Las minutas históricas con más de 50 acciones siguen siendo legibles con conexión; su preparación y edición desde este flujo requieren una revisión del alcance. El almacén cifrado v1 del navegador se mantiene compatible.

## Documentos y adjuntos

Prepare los originales autorizados con conexión. Podrá descargarlos sin red, editar texto o seleccionar **Añadir o sustituir archivo local**. Los archivos se cifran en el mismo almacén; no entran en CacheStorage, localStorage ni cachés de páginas o API. Bloquear vacía los campos, metadatos, historial visible y URLs temporales. Una copia de lectura permite descargar el original y mantiene sus controles de edición deshabilitados.

Cada archivo admite hasta **8 MiB**. Se mantienen **16 MiB para toda la copia cifrada** y **100 registros en conjunto**. La representación base64 ocupa más que el archivo original. Los bytes se guardan una sola vez por huella dentro del contenido cifrado; una petición pendiente referencia esos mismos bytes inmutables. Si continúa cambiando el archivo después de una respuesta perdida, se conservan las dos versiones necesarias y se informa si falta espacio. No se borra otra copia para admitir la nueva. Puede descargar el archivo o una copia completa JSON con los cambios y el envío pendiente.

Los documentos nuevos necesitan una causa preparada; también pueden esperar una causa local cuyos cambios estén completamente sincronizados y confirmados. Los adjuntos nuevos necesitan un espacio y, opcionalmente, una carpeta preparados. En **Preparar destinos con conexión**, busque y prepare sólo los necesarios. Se comprueban el espacio, la carpeta y sus padres, la causa y los permisos actuales. El origen de los archivos existentes queda fijado. Quitar un destino del catálogo conserva las elecciones de las copias.

Los originales de texto plano, Markdown, CSV o JSON UTF-8 de hasta 1 MiB pueden editarse en el campo de texto. Los demás originales se conservan como binarios; esto incluye contenidos con bytes nulos, UTF-8 inválido o mayor tamaño. Descargar un archivo local produce los bytes seleccionados; descargar la copia completa incluye también la petición pendiente. Esas descargas explícitas no están cifradas.

**Sincronizar archivo** guarda primero la petición cifrada y comprueba tamaño, base64 canónico y SHA-256. Los cambios, revisión conservada, actividad, auditoría, flujo de subida de un adjunto y recibo se confirman en la misma transacción de base de datos. Se escriben originales en claves nuevas; no se reemplaza un objeto compartido. Una respuesta perdida conserva la identidad y los bytes enviados. Primero se confirma ese envío; los cambios posteriores se envían después como otra revisión, sin repetir registros, versiones ni flujos.

El Host compara el original y sus datos de negocio, fuentes y contexto. Los cambios de otra sesión detienen el envío y conservan la copia local. Un original que falta no se sustituye por texto extraído. La preparación de texto tiene una cola duradera; sus cambios derivados y bloqueos OCR no revisan el original ni producen un falso conflicto. Cambiar sus bytes, nombre, clasificación, versión o contexto sí se detecta. Las rutas normales de clasificación y nueva versión conservan revisiones y comprueban permisos actuales; la clasificación desde la causa aporta su versión inicial.

Los documentos de PJUD, Drive, Obsidian, audio o minutas conservan su fuente: pueden prepararse para lectura y edición de ficha autorizada, mientras la sustitución del original requiere revisión con conexión. No se desclasifican archivos ni se añade su publicación en el portal desde la copia local. Un adjunto reservado no se modifica. Los documentos sin causa permiten editar la copia propia con permiso de edición, o requieren permiso general para otras copias.

**Consultar versiones del Host** recupera las revisiones conservadas, con paginación. Cada descarga vuelve a autorizar el archivo actual, su causa anterior y los indicadores de confidencialidad y privilegio de aquella revisión. Se conservan los originales desde la primera actualización de este flujo; no se reconstruyen bytes históricos que la aplicación no hubiera guardado anteriormente.

La actualización requiere aplicar `20261108010000_offline_file_revisions` y regenerar el cliente Prisma. Añade revisiones de documentos y referencias a originales en las versiones de adjuntos. El shell público v8 contiene nueve archivos; el formato cifrado v1 sigue siendo compatible con las copias anteriores. La ruta de archivos admite 12 MiB de JSON para transportar un original base64 de 8 MiB; las demás rutas mantienen sus límites propios.

## Agenda y trámites

Los eventos con hora conservan su instante si no se edita el campo y muestran las horas en la zona del navegador. Los días completos usan fechas civiles; el campo de fin muestra el último día incluido y el servidor conserva el fin exclusivo. Crear un evento o cambiar sus fechas requiere la confirmación expresa de revisión. Cambiar sólo el texto no recalcula el horario. El Host avisa de solapamientos al sincronizar; la copia local no contiene toda la agenda del equipo.

Los eventos importados de Google son de consulta en el espacio local. Una causa fijada por tareas u otros vínculos no se puede mover desde esa copia. La cuenta, el responsable, su acceso a la causa y las delegaciones se comprueban al enviar y recuperar recibos. Google y otras integraciones externas se gestionan con conexión.

Los trámites nuevos necesitan una causa preparada, incluida una causa local cuyos cambios estén sincronizados y confirmados. La causa de un trámite existente queda fijada. Un vencimiento nuevo o modificado necesita revisión manual; no se calculan días procesales sin red. Se puede completar, cancelar o reabrir un trámite conservando su identidad.

Trámite, tarea vinculada, historial, actividad, avisos, auditoría y recibo se confirman juntos. Sólo se actualizan los campos compartidos que haya cambiado en el trámite; instrucciones, consideraciones, prioridad, recordatorio y recurrencia independientes se conservan. Si otra sesión cambia la tarea o el contexto desde la preparación, se exige comparar las copias. Al pasar a hecho se ejecuta una sola vez el flujo y la recurrencia de la tarea. Las paredes de acceso de la tarea también se aplican a la preparación y las listas normales de trámites.

Los formularios normales de Trámites comparten esta transacción, envían la versión mostrada y conservan el formulario si hay conflicto. Una respuesta de alta incierta mantiene el mismo envío y bloquea la edición hasta confirmar su reintento. Aplicar plantillas también tiene identidad de operación; las plantillas y sugerencias de IA requieren conexión. Este incremento no añade migraciones de base de datos.

## Responsables y causas

En **Responsable y causas → Preparar opciones con conexión**, busque responsables o causas y pulse **Preparar opción** en las que necesite. Solo se ofrecen causas que puede modificar. Los resultados de búsqueda son temporales; las opciones seleccionadas quedan cifradas junto con los borradores. Se pueden preparar hasta 100 responsables y 100 causas, sin expulsar opciones automáticamente. Quitar una opción del catálogo local conserva las elecciones hechas en los borradores.

- **Clientes:** cambie el responsable y marque las causas que quiere vincular o desvincular. Se aplican únicamente esos cambios explícitos; las causas ocultas y las no seleccionadas se conservan. Vincular una causa con otro cliente sustituye ese vínculo y actualiza las tareas que tenían un cliente asociado a la causa. Requiere poder modificar tanto la causa como todas esas tareas. No cambia el equipo de la causa.
- **Tareas:** cambie el responsable y seleccione una causa o **Sin causa**. Se comprueba el acceso del responsable a la tarea de origen y a la nueva causa. La causa de una tarea con origen, espacio, jerarquía, plazo, evento, trámite o minuta asociado permanece fijada; puede cambiar su responsable si tiene permiso. Mover una tarea con cliente asociado ajusta también ese cliente.
- **Copias anteriores:** no se reemplazan los campos locales ni las peticiones pendientes. Tras confirmar una petición anterior, se incorporan las referencias actuales. Sin una petición pendiente puede preparar referencias con conexión si la versión del registro sigue coincidiendo.

Cada petición admite hasta 20 cambios de vínculos de Clientes y 100 tareas dependientes en total. Si excede ese alcance, el Host rechaza la operación completa y conserva la copia local para dividir el cambio.

## Sincronizar sin duplicados

Al volver la conexión, inicie sesión con la misma cuenta y pulse **Sincronizar registro** o **Sincronizar escrito**.

1. El espacio guarda cifrada la petición exacta, con una identidad de operación estable, antes de contactar con el Host.
2. El Host confirma el cambio y su recibo en la misma transacción. Para Clientes, tareas, causas, plazos, notas y minutas, el recibo guarda identidad, versiones y las referencias necesarias para volver a comprobar permisos; no repite los datos del contacto ni los textos de tareas, notas o minutas.
3. Si se pierde la respuesta, reintente. La misma petición recupera el recibo anterior: no vuelve a crear el registro ni duplica el historial, la siguiente tarea recurrente o el inicio de un flujo.
4. Si continuó editando después de una respuesta perdida, se confirma primero aquella petición. Sus campos y elecciones posteriores de responsable o causa siguen en la copia; vuelva a sincronizar para enviarlos con una nueva identidad y la versión confirmada.

Si un dato es rechazado por validación antes de guardar, puede corregirlo y sincronizar de nuevo. Los fallos de red, las respuestas desconocidas y los fallos de servidor conservan la identidad original para reintentarlos de forma segura.

## Conflictos y permisos

La sincronización de Clientes, tareas, causas, plazos, notas y minutas compara una huella de la versión completa del registro, incluidos sus datos de asignación y fechas de actualización. Detecta también los cambios hechos desde los formularios en línea. Los formularios de Clientes y causas aportan control de versión para impedir que una ficha abierta anteriormente sobrescriba un cambio ya sincronizado.

Si cambió el registro, se detiene la sincronización y se conserva su copia. **Descargar copia local** permite recuperar todos sus campos, incluidos los cambios y la petición pendiente. Compare las versiones antes de reemplazarla. **Descargar versión del servidor** pide confirmación cuando hay cambios locales; aceptarla los reemplaza por la versión actual. Una creación sin identidad confirmada debe reintentarse antes de poder descargar su versión del servidor.

Los recibos también exigen los permisos actuales: retirar el rol profesional, vencer la sesión, cambiar una delegación o perder acceso a la causa de una tarea impide sincronizarla o recuperar su resultado. Iniciar sesión con otra cuenta no permite enviar las peticiones de la cuenta original. Las copias ya preparadas siguen siendo copias locales desbloqueables mediante su clave; sin red no reflejan revocaciones posteriores.

Las referencias tienen versiones propias de perfil, permisos, equipo, causa y contexto de tarea. Si una referencia cambió o perdió autorización antes de aplicar la operación, se registra un rechazo definitivo para esa identidad, sin cambiar los registros. **Revisar referencias rechazadas** muestra las referencias actuales; **Confirmar referencias revisadas** conserva los campos y prepara una petición nueva. Puede deshacer las elecciones rechazadas antes de revisar. Si también cambiaron los campos del registro principal, debe comparar las copias; no se renueva esa versión silenciosamente. Un recibo de éxito frente a cambios posteriores tampoco reemplaza la copia local.

## Cifrado y recuperación

Se mantienen IndexedDB, AES-256-GCM y PBKDF2-SHA-256 con 600.000 iteraciones y sal aleatoria. Se cifran juntos los escritos, contactos, tareas, causas, plazos, notas, minutas, acciones, documentos, adjuntos, originales, destinos, eventos, trámites, identidad de la cuenta, versiones, responsables, causas preparadas, elecciones y peticiones pendientes. La clave solo se conserva en memoria mientras el espacio está abierto. No se usa almacenamiento en texto plano como alternativa.

El límite es de **100 registros locales en total**, de los cuales hasta 40 pueden ser escritos, y **16 MiB** de datos. Los envíos de fichas, distintos de archivos, admiten hasta 256 KiB de JSON; si se supera, el Host lo rechaza antes de guardar y la copia local permite descargar los datos y reducir el envío. No se borran registros ni cambios pendientes por caducidad o para liberar espacio. Una pestaña con una versión local antigua no puede sobrescribir ni borrar la copia guardada por otra.

Bloquear el espacio durante un guardado invalida el trabajo en curso sin corromper el cifrado ni reemplazar una copia anterior con datos incompletos.

Si se deniega el almacenamiento o se agota la cuota, la página conserva los campos visibles, informa de que no están guardados y permite descargarlos. Las descargas de registros son JSON sin cifrado, bajo su control. Borrar los datos del navegador elimina las copias locales; la clave no sustituye una copia de respaldo.

Requiere HTTPS o localhost, WebCrypto e IndexedDB. El service worker conserva únicamente nueve archivos públicos (shell v8): el documento offline, sus estilos y siete módulos de código. No guarda páginas autenticadas, respuestas de API, originales ni adjuntos. La actualización del shell elimina la caché anterior y conserva el almacén cifrado existente.

## Comprobación

`npm run test:offline:integration` ejecuta la integración específica con PostgreSQL desechable. También está incluida en `npm run test:integration`. Las regresiones de navegador están en `e2e/offline-files.spec.ts`, `e2e/offline-memos.spec.ts`, `e2e/offline-legal-native.spec.ts`, `e2e/offline-legal.spec.ts`, `e2e/offline-links.spec.ts`, `e2e/offline-records.spec.ts` y `e2e/offline-workspace.spec.ts`. La prueba de concurrencia con el alta normal usa Chromium; los demás escenarios offline están incluidos en Chromium, Firefox y WebKit de CI.

Para probar contra un servidor aislado, el proceso de Playwright y el servidor deben compartir `DATABASE_URL`, `E2E_DATABASE_URL`, `SESSION_SECRET` y `STORAGE_PATH`. Las desconexiones se provocan mediante un proxy HTTP de bucle local que afecta también al service worker. Los datos y las cuentas son ficticios.

Resultado local del incremento de asignaciones y vínculos: suites unitarias e integración PostgreSQL completas, integración específica de relaciones y recibos, lint, TypeScript y compilación de producción aprobados. Se validaron 88 casos de la selección de regresión: 50 de Chromium, cinco de captura nativa y 33 de WebKit, incluidos los 16 casos nuevos de asignaciones, vínculos, recurrencia, rechazo de referencias, copias anteriores y bloqueo durante un guardado. El fixture de acceso se adaptó al CSRF de producción y al contenido principal durante las transiciones; sus cuatro recorridos se repitieron con éxito. Se confirmaron las vistas a 360 y 1.440 píxeles sin desbordamientos. Firefox está configurado en CI; el compositor de este Mac impide validarlo localmente. No se modificaron datos del estudio.


Validación de causas y plazos: baterías unitarias e integración PostgreSQL completas aprobadas, con repetición de la integración específica sin conexión. Se validaron 101 casos distintos de navegador: la selección de 100 casos y un caso adicional de alta concurrente entre la API normal y el modo sin conexión. Los doce casos nuevos de interfaz se comprobaron en Chromium y WebKit y se repitieron junto con las regresiones de vínculos después de los últimos controles de contexto y dependencias. Se revisaron las vistas a 360 y 1.440 píxeles.

La compilación de producción y TypeScript pasan en la copia aislada. La comprobación final de TypeScript y lint sobre el árbol compartido también pasó, sin errores ni avisos. Se confirmaron 29 casos de causas, plazos y vínculos después de las últimas comprobaciones de contexto y dependencias. Firefox sigue configurado para CI y no se validó localmente. En aquel incremento de causas y plazos no se añadieron migraciones ni se modificaron datos del estudio.

Validación de notas y minutas: suite unitaria, integración PostgreSQL completa, integración offline, TypeScript, lint y compilación de producción aprobados en una copia aislada. Se validaron 121 casos distintos de navegador (68 de Chromium, 48 de WebKit y cinco de captura nativa), incluidos los 18 casos nuevos. Tras acotar un selector a la vista visible durante las transiciones, la comprobación de fechas y seguimientos se confirmó en ambos motores. La migración coincide con el esquema; sólo se aplicó a bases ficticias. Revisión a 360 y 1.440 píxeles sin desbordamientos. Firefox permanece en CI, sin validación local.

Validación de documentos y adjuntos: suites unitarias e integración PostgreSQL completas, integración offline, TypeScript, lint y compilación de producción aprobados. Se validaron 144 casos distintos de navegador (81 de Chromium, 58 de WebKit y cinco de captura nativa), incluidos los veinte casos de archivos sobre la última compilación. Se confirmaron reintentos del original de 8 MiB, conservación de ambas versiones tras una respuesta perdida, recuperación ante almacenamiento temporalmente alterado, conflictos con la edición normal, permisos e historial. La migración no presenta diferencias con el esquema y sólo se aplicó a bases ficticias. Vistas a 360 y 1.440 píxeles sin desbordamientos.


Validación de Agenda y Trámites: suite unitaria, integraciones de todas las áreas offline y minutas, plazos/Agenda, tareas, Clientes y Flujos, TypeScript, lint global y compilación con Webpack aprobados en una copia aislada. Se comprobaron 179 casos distintos de navegador (102 de Chromium, 72 de WebKit y cinco de captura nativa), incluidos los 28 nuevos. Los 29 recorridos finales confirmaron los tres ajustes de fixture, el borrado de avisos al bloquear, los reintentos tras recargar y la conservación de milisegundos al editar detalles. Las vistas a 360 y 1.440 píxeles no presentaron desbordamientos.

La integración general no se da por aprobada: se detuvo en el simulador de autorización de secretos del escritorio de Altazor, cuya respuesta de salud aún no anuncia el contrato exigido por el control nuevo. Las integraciones del alcance offline y operativo pasaron por separado. Este incremento no añade migraciones ni modifica datos reales. Véase el detalle en [Correcciones de auditoría](CORRECCIONES-AUDITORIA-2026-11-07.md#continuación-agenda-y-trámites-sin-conexión).
