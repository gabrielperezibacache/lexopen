# Encargos persistentes de Altazor por causa

Función de preview 11 en preparación. Integrar código no publica ni actualiza instaladores por sí solo.

## Recorrido

1. Abre una conversación de la causa y pide «Revisa esta causa, organiza los pendientes y prepara un borrador». Sin una causa seleccionada, Altazor solicita elegirla.
2. Revisa el alcance, el modelo coordinador y los especialistas. **Confirmar equipo e iniciar encargo** autoriza ese plan. Se eligen hasta dos perfiles propios habilitados del ámbito de la causa, priorizando coincidencias de sus instrucciones con el objetivo. Sin perfiles permitidos, Altazor trabaja solo. Los perfiles y modelos no se crean ni cambian automáticamente.
3. Consulta la tarjeta del encargo. Muestra estado y acciones; los detalles se despliegan a petición y se pueden recorrer por páginas. La cantidad de acciones puede ampliarse al identificar los bloques documentales. La lectura textual conserva pruebas de origen y evita capturas para documentos que ya disponen de texto.
4. Revisa informe, esperas, necesidades, citas y cobertura. Los archivos no preparados, las extracciones parciales y las acciones fallidas se identifican. Preparar un documento no equivale a completar su análisis. Una cita cotejada acredita un pasaje literal, no la corrección de una conclusión jurídica.
5. Edita y selecciona las tareas y el borrador. **Confirmar registros seleccionados** autoriza guardarlos. Las tareas quedan asignadas al solicitante y ligadas al expediente y su cliente, con la visibilidad que corresponda a la causa; el escrito es un borrador privado con referencias, sujeto al circuito habitual de revisión antes de exportar.

El alcance incluye los registros accesibles de causa, tareas, plazos y movimientos, y sus documentos incorporados. Las fechas se leen de los registros, con fecha civil de Chile explícita; no se activa un perfil nuevo de cómputo. El encargo no consulta OJV, abre otras causas, comparte audiencias privadas ni incorpora automáticamente historial, adjuntos o memorias. Una copia o instrucción dentro de un documento se procesa como contenido, sin ampliar permisos.

## Continuidad y recuperación

El objetivo, plan aprobado, etapas, preguntas, resultados y recibos permanecen en PostgreSQL. Cada etapa tiene una reserva temporal de ejecución; esa reserva limita una llamada, no la conservación del encargo ni el escritorio virtual. Los encargos confirmados no heredan la caducidad de 24 horas de los mensajes ordinarios.

El navegador puede avanzar el encargo mientras está visible. Para continuar con la ventana cerrada, mantén el Host encendido y el worker de jornada activo: `LEXOPEN_JORNADA_INTERVAL_MINUTES=1` y `CRON_SECRET`; Desktop ya prepara ese worker. Se respeta la preferencia personal de trabajo en segundo plano. No se inicia trabajo nuevo sin un encargo confirmado.

Si el Host se interrumpe después de aceptar una delegación, la siguiente ejecución recupera su recibo mediante la misma clave. Las etapas terminadas no se repiten al reanudar. Las lecturas fallidas admiten un reintento automático; después necesitan revisión explícita. La concurrencia permanece acotada y los Ícaros mantienen sus límites existentes.

Un cambio de fuentes, permisos, sesión o destino puede bloquear el encargo. **Revisar y reanudar** prepara el plan actualizado cuando corresponde; requiere confirmación antes de usar ese nuevo alcance. Se conservan los análisis no afectados y se vuelve a consolidar el resultado. Si ya hubo registros confirmados y cambió el expediente, se conserva su historial y debe prepararse otro encargo para el nuevo alcance.

El guardado usa recibos por propuesta. Si una operación falla, se muestran resultados parciales y se pueden reintentar los pendientes sin recrear los anteriores. Perder la respuesta tras un guardado no habilita otro guardado distinto: se conserva la misma selección hasta comprobar el resultado. Cancelar no elimina tareas ni escritos ya creados.

## Ayuda, privacidad y mensajes posteriores

Una pregunta concreta conserva una identidad de un solo uso vinculada al encargo. Se puede responder en el chat o mediante ntfy/WhatsApp configurados, conforme a la política vigente. Los avisos remotos son mínimos; no contienen el expediente. Una respuesta no confirma propuestas ni concede permisos. Si vence la pregunta, el encargo permanece y puede solicitarse una nueva respuesta.

Los modelos, sus destinos y las fuentes se comprueban durante la ejecución y al reutilizar resultados. En este primer flujo, los Ícaros no reciben memoria propia ni personal: el plan lo indica expresamente. La memoria de sus encargos manuales mantiene su funcionamiento independiente.

Un mensaje posterior puede utilizar el informe y sus recibos como datos de contexto verificados. Conserva la huella de ese resultado; si cambia o pierde acceso a sus fuentes, la respuesta derivada queda no disponible. Estos mensajes usan contexto v2 para que un lector antiguo rechace dependencias que no sabe verificar; las conversaciones anteriores siguen admitiendo contexto v1. Para guardar una respuesta posterior como escrito, se requieren pasajes documentales seleccionados; el borrador del propio encargo conserva sus referencias desde su panel.

## Actualización y comprobación

La migración `20261117000000_altazor_case_jobs` añade dos tablas y un vínculo opcional de ayuda. En un Host existente se utiliza `prisma migrate deploy`, con el respaldo habitual; no un reinicio de base de datos. Las rutas nuevas permiten consultar el encargo, avanzar sus etapas, responder, revisar/reanudar, cancelar y confirmar propuestas. Las mutaciones conservan CSRF, titularidad y comprobación de revisión; los resultados no conceden permisos adicionales.

- Las pruebas unitarias comprueban intención afirmativa, rechazo de órdenes citadas o negadas y citas literales frente a marcadores desconocidos.
- La integración PostgreSQL usa una base desechable: reservas concurrentes, auditoría atómica, recuperación de delegaciones, guardado parcial, actualización del alcance, respuestas únicas, cancelación, revocación y dependencia de mensajes posteriores.
- La prueba de navegador confirma el equipo, cierra la ventana, reconstruye el worker en otro proceso, revisa propuestas y pierde intencionalmente la primera respuesta del guardado ya confirmado para comprobar su recuperación.

Las pruebas de modelos y canales utilizan proveedores ficticios. Acreditan el contrato y la recuperación del flujo, no la calidad jurídica o autonomía de un modelo real ni la entrega a un teléfono real. Los pilotos y las mediciones de modelos del equipo del estudio conservan su validación independiente.

Se mantienen la cuenta Google compartida, el escritorio persistente y las consultas judiciales automáticas de las 08:00 y 22:00 de Chile, con actualización manual libre.
