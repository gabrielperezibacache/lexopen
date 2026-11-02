# Mesa privada de audiencia

## Mode

Operate y Read. Continuación precisa del marco existente de LexOpen; hereda Sora, Fraunces, papel, tinta, cobre y verde mar. No lleva materiales de los estantes al panel de trabajo.

## Outcome

Preparar y acompañar una audiencia dentro de una causa autorizada: reunir lecturas, regresar a una página física o pasaje, seguir un guion guardado, transcribir audio por tramos, registrar lo observado y preparar hechos, notas o escritos desde registros elegidos. La transcripción permanece diferenciada de la grabación.

## Hierarchy

Causa y mesa actual; dossier; lectura; herramientas de notas, conversación y agenda. El gestor de audio acompaña debajo con carga, grabación seleccionada, transcripción y revisión. Un PDF físico permanece legible y los controles se adaptan antes de reducir la lectura.

En **En vivo**, el dossier deja espacio a dos zonas: lector persistente y cuaderno de intervención. En escritorio el lector tiene altura acotada, desplazamiento propio y foco de teclado; permanece disponible mientras se recorre el cuaderno. El cuaderno ordena control de sesión y tiempo, guion, punto activo, registro rápido y anotaciones de la sesión. En móvil se alterna En vivo y Lectura mediante navegación superior adherida; el lector recupera su desplazamiento normal y los campos del cuaderno siguen montados.

«Registrar lo ocurrido», junto al control de sesión, lleva al formulario y enfoca su encabezado. «Registrar en vivo», sobre un pasaje del lector, abre ese mismo formulario con un respaldo opcional. Los márgenes de llegada despejan la cabecera y las pestañas móviles. «Volver al control de sesión» devuelve al comienzo del cuaderno.

«Transcribir la audiencia» se sitúa junto al control de sesión. La captura pide una elección explícita de micrófono o audio de pestaña compartida, un nombre y confirmación antes de solicitar permiso al navegador. La opción de pestaña conserva sólo las pistas de audio y libera también las pistas de vídeo de la selección. El texto llega tras procesar archivos independientes de unos quince segundos; no se presenta como dictado palabra por palabra ni como una grabación continua certificada. Servicio configurado, alcance y estado permanecen visibles.

Cada tramo ofrece escucha del original, texto automático, advertencias, descargas y «Usar pasaje en el registro». Esta acción prepara una anotación editable con su cita; no la guarda ni la transforma automáticamente. Desde «Crear hecho, nota o escrito», la preparación ocupa una sección en el flujo con origen, pasaje, destino, contenido editable, confirmación de revisión y resultado enlazado.

## Saved work and recovery

El guion guarda apertura, cierre, orden, punto activo y puntos tratados tras una pausa de escritura de 900 ms. Los puntos se vinculan a la revisión de cada nota: una nota modificada exige volver a revisarla antes de considerarla tratada. Las anotaciones rápidas se guardan sólo al confirmar; quedan como notas de audiencia disponibles para seleccionar en los escritos de la causa.

Cambiar de herramienta conserva los campos. Antes de cambiar de mesa se guarda el guion y se exige registrar o descartar una anotación pendiente. Ante navegación SPA, una copia temporal en RAM conserva únicamente texto propio y tipo de registro: hasta veinte mesas y durante ocho horas, dentro de la misma pestaña. Se recupera sólo después de una lectura nuevamente autorizada. No conserva el pasaje citado ni sustituye el guardado en el Host; se borra al guardar, descartar o perder acceso. Una petición cuyo resultado no se confirmó exige revisar el registro antes de volver a guardarla.

Salir de En vivo, ocultar la pestaña o perder autorización detiene la captura y libera sus pistas. La cola admite dos tramos; si el servicio no alcanza el ritmo, la captura se detiene con explicación y conserva lo recibido. Un original guardado cuyo procesamiento falló ofrece reintento de transcripción; un tramo aún no incorporado ofrece envío, descarga o descarte explícitos. Los reintentos mantienen sus identificadores para recuperar una respuesta perdida sin duplicar audio.

La navegación interna puede recuperar el audio pendiente desde RAM: hasta veinte mesas, ocho horas y dos tramos de hasta cuatro MiB por mesa. La recuperación ocurre tras volver a autorizar la mesa y la captura, y nunca envía ni reactiva el micrófono por sí sola. No sustituye el guardado en el Host ni sobrevive a recargar o cerrar la aplicación. Perder acceso borra esa copia. El texto y la cita precargados desde una transcripción se excluyen de la copia temporal de anotaciones; si el tramo deja de estar disponible, se retiran del formulario. Los tramos anteriores se vuelven a consultar, con acceso actual, antes de mostrarse de nuevo.

El tiempo parte de una lectura del servidor y avanza mediante un reloj monotónico del navegador. Se actualiza al consultar la sesión, cada quince segundos mientras En vivo está abierto y al recuperar el foco. Si falla la sincronización, el tiempo mostrado queda detenido, también durante reintentos fallidos; el aviso explica que la sesión del servidor puede seguir en marcha. Una lectura correcta vuelve a sincronizarlo. Iniciar, pausar, reanudar y finalizar son acciones explícitas; el reloj no calcula plazos ni inicia grabación.

## Reviewed destinations

El destino exige revisar la propuesta y confirmar su alcance antes de guardar. Una nueva afirmación del expediente entra como hecho propuesto, pendiente de revisión, y queda visible según los permisos de la causa; si el hecho ya existía, conserva su estado anterior. Este destino admite pasajes documentales, jurídicos y de transcripciones publicadas. Un respaldo bibliográfico o una observación sin cita ofrece notas y escritos, con una explicación concreta de por qué no puede convertirse en hecho del expediente.

El hecho usa el contenido de la propuesta; no muestra un título que el destino no conservaría. La nota mantiene título, contenido, pasaje y procedencia dentro de la mesa privada. El borrador conserva título, contenido y la referencia de origen dentro de los escritos privados de la causa. Sus citas y notas al pie permiten volver al pasaje; no presentan toda la propuesta del profesional como comprobada por ese pasaje. El servidor vuelve a comprobar revisión de origen, permisos y citas al confirmar, también al recuperar una petición ya guardada.

## Constraints

Mesa privada por profesional. Fuente revocada implica ausencia de texto derivado, incluso en copia e historial. En 360px las herramientas se alternan por pestañas con etiquetas. Original, TXT retenido, transcripción automática y revisión humana se identifican con texto legible. Sin métricas de confianza ni tiempos inventados. Una inspección conjunta de escritorio y móvil y una confirmación dirigida tras corregir hallazgos.

La anotación de una objeción, resolución o compromiso es una observación del profesional, no un documento oficial. La pérdida de acceso oculta el punto y el pasaje, incluida la información almacenada en la vista del lector y en páginas antiguas del registro. Los cambios concurrentes conservan el texto local y ofrecen recuperación explícita. El movimiento de apertura dura 180 ms y desaparece con movimiento reducido.

Las citas de audio se cotejan contra el TXT publicado y su procedencia conservada. Ese cotejo no acredita fidelidad de las palabras al sonido, identidad de hablantes ni exactitud temporal. El lector puede abrir una fuente de tramo mediante una lectura autorizada directa, aunque no figure entre las fuentes manuales del dossier; no carga todos los tramos en ese catálogo.

La prueba de navegador completó captura nativa de micrófono con entrada ficticia y transcriptor local simulado, las tres conversiones, la apertura del respaldo y la privacidad por propietario. Esta evidencia comprueba el flujo de la aplicación; no demuestra calidad real de reconocimiento de voz ni captura del audio de pestaña o del sistema operativo. Esas condiciones requieren sus propios ensayos.

Fuentes de implementación: `src/components/hearings/HearingWorkbench.tsx`, `HearingLivePanel.tsx`, `HearingLiveAudioPanel.tsx`, `HearingLivePromotion.tsx`, `hearings.css`, `hearing-live.css` y `hearing-live-audio.css`.
