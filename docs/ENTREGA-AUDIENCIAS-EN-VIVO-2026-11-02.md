# Panel de audiencias en vivo · 2 de noviembre de 2026

La mesa de cada causa incorpora **En vivo**, accesible desde la cabecera y las herramientas de audiencia. Conserva el lector al lado en escritorio y presenta las herramientas por separado en móvil. El dossier completo y la preparación anterior siguen disponibles desde sus apartados.

## Sesión y guion

El control de tiempo utiliza el reloj del servidor y guarda inicio, pausas, reanudación y cierre. Recargar o abrir la misma mesa desde otra sesión conserva el estado. Marcar manualmente «En audiencia» en la agenda no inicia el contador: hace falta la acción explícita de inicio. Cambiar manualmente a preparación o cerrada pausa o finaliza el contador dentro de la misma operación. Reabrir conserva el tiempo acumulado.

El tiempo identifica el control de trabajo iniciado por el profesional. No es una marca de tiempo de una grabación ni un cálculo de plazos procesales. El contador tiene un máximo explícito de siete días. Cuando no puede actualizarse, la cifra mostrada se congela; los reintentos fallidos no la hacen avanzar. Una respuesta válida vuelve a sincronizarla con la sesión conservada en el servidor.

El guion guarda apertura, petición de cierre, hasta veinte notas ordenadas y el punto activo. Los cambios se envían de forma serializada, tras una pausa breve al escribir. La apertura y la petición son texto propio. Las notas conservan sus citas y avisos; marcar un punto como tratado expresa una decisión del profesional. Si la nota cambia, se invalida esa marca hasta revisarla de nuevo.

Los cambios concurrentes conservan el texto local y ofrecen recuperación explícita. Los reintentos reutilizan la misma petición y no repiten una acción ya confirmada. El guion anterior de descarga permanece disponible; el guion guardado del panel en vivo tiene su propia selección persistente.

## Registro rápido y continuidad

«Registrar lo ocurrido», junto al control de sesión, abre y enfoca el formulario. «Registrar en vivo», desde un pasaje del lector, incorpora ese respaldo al formulario. Se pueden registrar observaciones, objeciones, resoluciones anotadas y compromisos. Son anotaciones personales; una resolución anotada no sustituye el documento oficial.

Cada registro confirmado se guarda como una nota normal de la mesa, con categoría, hora de creación y tiempo de sesión calculado en el servidor. Puede incorporarse desde las notas de audiencia al editor de escritos de la causa. Sus referencias conservan el pasaje comprobado y distinguen el tiempo del control de sesión de una marca de audio.

Repetir una solicitud tras perder la respuesta no duplica el registro. Eliminar o editar esa nota desde el cuaderno sigue siendo posible: el registro no se presenta como un acta inmutable, y un reintento no resucita una nota eliminada. La consulta muestra treinta registros por página; la descarga incluye hasta cien, dentro del límite total de notas de una mesa, con su alcance declarado.

## Conservar trabajo y respetar acceso

Cambiar de herramienta mantiene el panel montado y conserva el trabajo pendiente. Cambiar de mesa exige guardar o descartar la anotación rápida. Al volver mediante navegación dentro de la misma pestaña, el texto propio sin confirmar puede recuperarse desde una copia temporal en memoria: hasta veinte mesas y ocho horas. Se recupera sólo tras comprobar de nuevo el acceso. La cita elegida no se conserva en esa copia y debe seleccionarse otra vez.

La copia no utiliza almacenamiento persistente del navegador, no registra la anotación automáticamente y no ofrece recuperación después de cerrar o recargar la aplicación. Guardar, descartar o perder autorización elimina esa copia. El cierre de pestaña avisa cuando hay trabajo pendiente.

La mesa sigue siendo privada por profesional, dentro de una causa autorizada. Se vuelven a comprobar capacidades, propiedad y fuentes. Una referencia retirada oculta el título, el texto y el pasaje derivados, incluidos el lector y las páginas antiguas del registro. La descarga conserva avisos de OCR, extracción parcial, texto sin original y transcripciones; no acredita autenticidad, vigencia ni lo que efectivamente resolvió el tribunal.

## Implementación y verificación

La migración aditiva `20261102180000_hearing_live_session` añade estado de sesión, recibos de operaciones y metadatos opcionales a las notas existentes. No transforma su contenido anterior. La exportación es TXT, con identidad de causa, guion, registros y respaldos actualmente autorizados. No llama a IA ni inicia una grabación.

La revisión funcional independiente detectó tres puntos, corregidos en esta entrega:

| Hallazgo | Resultado |
| --- | --- |
| Lector con metadatos o pasaje en caché tras una denegación | Resuelto: anonimización y retirada de la cita pendiente. |
| Contador que avanzaba después de fallar la actualización | Resuelto: congelación única hasta una respuesta válida. |
| Anotación sin confirmar perdida al volver dentro de la aplicación | Resuelto: copia temporal de texto propio, sin citas, recuperada después de autorizar. |

La revisión visual dirigida confirmó resueltos los dos ajustes solicitados: acceso inmediato al formulario con foco correcto y lector visible al recorrer el registro de escritorio. Se inspeccionaron capturas reales de escritorio, móvil de 360px y modo oscuro, con movimiento reducido.

Las pruebas usan usuarios, causas, libros y registros ficticios. Cubren duración con reloj controlado, pausas, concurrencia, reintentos, cambios de revisión, permisos retirados, originales alterados, recuperación de borradores y continuidad con escritos.

| Comprobación local | Resultado |
| --- | --- |
| Pruebas unitarias completas | Aprobadas. |
| Integración completa con PostgreSQL temporal | Aprobada, incluidos audiencias, escritos y fuentes. |
| Navegador, 50 escenarios | 49 aprobados en la ejecución completa y el restante aprobado en repetición dirigida. Se corrigió el selector de la prueba, que buscaba un aviso de conexión como alerta en vez de estado; se conserva el registro original. |
| Compilación de producción, tipos y lint | Aprobados. La compilación conserva cuatro avisos anteriores de trazado de dependencias. |
| Migraciones frente al esquema Prisma | Sin diferencias. |

Las siete capturas, los registros y sus sumas SHA-256 están en `docs/audiencias-en-vivo-2026-11-02/`. La publicación en el Host del estudio requiere su propio ensayo y no se acredita con estas pruebas locales.
