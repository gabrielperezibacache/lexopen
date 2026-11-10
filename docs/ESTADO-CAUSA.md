# Estado automático de la causa

Al abrir el expediente manual o PJUD aparece **Estado de la causa**, sin pedir un resumen en el chat. El panel presenta inmediatamente registros accesibles y solicita una lectura de Altazor con el proveedor y la política de IA del estudio, si el usuario puede usar el asistente.

- **Plazos próximos y vencidos:** plazos pendientes o marcados vencidos, fecha guardada y carácter fatal. Prioriza una selección de vencidos y próximos vencimientos. Los históricos no desplazan la consulta de los próximos. La distancia usa días calendario y la fecha civil de Chile, incluso al cambiar el día UTC; no vuelve a calcular términos procesales.
- **Qué se espera:** movimientos marcados pendientes de resolución y tareas abiertas con espera registrada de cliente, tribunal, contraparte o equipo, o bloqueadas. Una etapa procesal por sí sola no prueba una espera. Las marcas pueden requerir actualización.
- **Qué se necesita ahora:** preparar los plazos cercanos, revisar vencimientos, atender trámites y tareas, asignar responsables y completar los datos que faltan.
- **Información por comprobar:** ausencia de fecha de notificación, plazos o movimientos, monitoreo judicial no activo, sincronización incompleta y selección limitada de pendientes.

Altazor recibe solo este contexto, generado por el servidor, y debe citar identificadores de plazos, trámites, movimientos o tareas. No recibe documentos completos ni se presupone que los haya leído. La lectura es orientativa: no crea, completa ni presenta actuaciones y no confirma que se haya consultado el expediente judicial en tiempo real.

El panel comprueba los cambios cada minuto mientras la pestaña está visible y al volver a ella. También se actualiza al refrescar el expediente. Durante la visita, las peticiones iguales al modelo se comparten en memoria y una huella por usuario, permisos, datos visibles y día chileno evita repetir el análisis en cada comprobación. No se guarda texto de causas en localStorage o sessionStorage. Una recarga completa puede generar otro análisis. **Actualizar análisis** permite solicitarlo de nuevo y comprobar los datos inmediatamente.

El endpoint de lectura aplica el muro ético de la causa, los permisos de plazos y las restricciones de espacios y fuentes de tareas. Los registros cerrados se excluyen. Se comprueban los permisos en cada petición; si se pierde acceso, el panel oculta sus datos en la próxima comprobación. No se reutilizan respuestas entre usuarios. La IA mantiene su comprobación de permisos y la política de destino local del estudio.

Si la IA falla o solo ofrece demostración, el panel conserva los hechos registrados e informa el motivo; nunca presenta una narración de demostración como estado real. Si falla la actualización de datos, advierte que el estado mostrado puede haber cambiado. La selección y los conteos delimitan la cobertura de expedientes grandes.
