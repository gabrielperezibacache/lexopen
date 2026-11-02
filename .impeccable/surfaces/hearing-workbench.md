# Mesa privada de audiencia

## Mode

Operate y Read. Continuación precisa del marco existente de LexOpen; hereda Sora, Fraunces, papel, tinta, cobre y verde mar. No lleva materiales de los estantes al panel de trabajo.

## Outcome

Preparar y acompañar una audiencia dentro de una causa autorizada: reunir lecturas, regresar a una página física o pasaje, seguir un guion guardado, registrar lo observado y continuar los escritos con notas elegidas. La transcripción permanece diferenciada de la grabación.

## Hierarchy

Causa y mesa actual; dossier; lectura; herramientas de notas, conversación y agenda. El gestor de audio acompaña debajo con carga, grabación seleccionada, transcripción y revisión. Un PDF físico permanece legible y los controles se adaptan antes de reducir la lectura.

En **En vivo**, el dossier deja espacio a dos zonas: lector persistente y cuaderno de intervención. En escritorio el lector tiene altura acotada, desplazamiento propio y foco de teclado; permanece disponible mientras se recorre el cuaderno. El cuaderno ordena control de sesión y tiempo, guion, punto activo, registro rápido y anotaciones de la sesión. En móvil se alterna En vivo y Lectura mediante navegación superior adherida; el lector recupera su desplazamiento normal y los campos del cuaderno siguen montados.

«Registrar lo ocurrido», junto al control de sesión, lleva al formulario y enfoca su encabezado. «Registrar en vivo», sobre un pasaje del lector, abre ese mismo formulario con un respaldo opcional. Los márgenes de llegada despejan la cabecera y las pestañas móviles. «Volver al control de sesión» devuelve al comienzo del cuaderno.

## Saved work and recovery

El guion guarda apertura, cierre, orden, punto activo y puntos tratados tras una pausa de escritura de 900 ms. Los puntos se vinculan a la revisión de cada nota: una nota modificada exige volver a revisarla antes de considerarla tratada. Las anotaciones rápidas se guardan sólo al confirmar; quedan como notas de audiencia disponibles para seleccionar en los escritos de la causa.

Cambiar de herramienta conserva los campos. Antes de cambiar de mesa se guarda el guion y se exige registrar o descartar una anotación pendiente. Ante navegación SPA, una copia temporal en RAM conserva únicamente texto propio y tipo de registro: hasta veinte mesas y durante ocho horas, dentro de la misma pestaña. Se recupera sólo después de una lectura nuevamente autorizada. No conserva el pasaje citado ni sustituye el guardado en el Host; se borra al guardar, descartar o perder acceso. Una petición cuyo resultado no se confirmó exige revisar el registro antes de volver a guardarla.

El tiempo parte de una lectura del servidor y avanza mediante un reloj monotónico del navegador. Se actualiza al consultar la sesión, cada quince segundos mientras En vivo está abierto y al recuperar el foco. Si falla la sincronización, el tiempo mostrado queda detenido, también durante reintentos fallidos; el aviso explica que la sesión del servidor puede seguir en marcha. Una lectura correcta vuelve a sincronizarlo. Iniciar, pausar, reanudar y finalizar son acciones explícitas; el reloj no calcula plazos ni inicia grabación.

## Constraints

Mesa privada por profesional. Fuente revocada implica ausencia de texto derivado, incluso en copia e historial. En 360px las herramientas se alternan por pestañas con etiquetas. Original, TXT retenido, transcripción automática y revisión humana se identifican con texto legible. Sin métricas de confianza ni tiempos inventados. Una inspección conjunta de escritorio y móvil y una confirmación dirigida tras corregir hallazgos.

La anotación de una objeción, resolución o compromiso es una observación del profesional, no un documento oficial. La pérdida de acceso oculta el punto y el pasaje, incluida la información almacenada en la vista del lector y en páginas antiguas del registro. Los cambios concurrentes conservan el texto local y ofrecen recuperación explícita. El movimiento de apertura dura 180 ms y desaparece con movimiento reducido.

Fuentes de implementación: `src/components/hearings/HearingWorkbench.tsx`, `HearingLivePanel.tsx`, `hearings.css` y `hearing-live.css`.
