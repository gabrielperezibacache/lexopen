# Transcripción en vivo y continuidad con la causa · 2 de noviembre de 2026

La mesa de audiencia incorpora captura de audio y transcripción durante la sesión, con resultados por tramos. Un pasaje puede incorporarse al registro personal y convertirse, tras revisión, en un hecho propuesto, una nota o un borrador de escrito con referencias. El flujo utiliza los servicios de LexOpen y el transcriptor configurado por el estudio.

## Uso

1. Abra una causa, su mesa privada y **En vivo**. El administrador debe haber activado el transcriptor en la configuración de audios. La política del estudio puede exigir un servicio local.
2. En **Transcribir la audiencia**, elija micrófono o audio de una pestaña compartida, nombre la captura y confirme que puede captar y enviar ese audio. El navegador solicita su propio permiso. En la opción de pestaña se conserva únicamente el audio, aunque el navegador exija seleccionar una superficie para compartir; no se guarda vídeo.
3. Inicie la captura. El navegador finaliza archivos independientes de aproximadamente quince segundos y los envía en orden. El texto aparece después del procesamiento de cada archivo; no es reconocimiento instantáneo palabra por palabra. El servicio configurado puede introducir latencia.
4. Escuche el original, revise el texto automático y elija **Usar pasaje en el registro**. Edite la observación antes de guardarla. El registro conserva una cita del texto publicado y la advertencia de revisión pendiente.
5. Desde el registro, elija **Crear hecho, nota o escrito**, seleccione el destino, edite el contenido, revise sus fuentes y confirme la conversión. El servidor vuelve a comprobar el origen y los permisos antes de guardar.

## Qué se conserva

Cada tramo guarda su original privado, su huella, el texto obtenido y una publicación TXT independiente, con proveedor y revisión registrada. Los archivos quedan vinculados a la causa en las carpetas de audiencias y transcripciones de la captura. La descarga TXT identifica la publicación exacta utilizada por las citas, aunque el audio tenga después otra versión de trabajo.

Los originales y las publicaciones de una mesa siguen siendo privados de su propietario, incluso si otro profesional puede abrir la causa. Las consultas directas de audio, documentos y evidencia aplican esa misma restricción. Los clips no ocupan el límite de doscientas importaciones manuales ni desplazan los PDF del dossier. El lector puede abrir directamente una fuente de clip autorizada sin cargar todo el historial de capturas.

Una sesión admite hasta 360 tramos y 256 MiB, con un máximo de veinte sesiones por mesa. Cada tramo admite hasta 4 MiB; las consultas de tramos muestran treinta por página. Son límites de almacenamiento y consulta, no una certificación de duración. El contador de la audiencia es independiente del audio. El orden de los tramos no acredita continuidad ni marcas temporales exactas; puede haber pausas entre archivos.

## Destinos y citas

- **Hecho:** se crea como propuesta del expediente, con cita documental y revisión posterior. No se deduce una fecha de acontecimiento a partir del reloj de la audiencia. Si coincide con un hecho ya existente, se conserva su estado y se informa la reutilización. Una observación sin pasaje documental o un respaldo de biblioteca puede conservarse como nota o escrito; la interfaz explica por qué no habilita ese destino de hecho.
- **Nota:** conserva el texto revisado, la cita y la procedencia de la anotación original. Permanece en la mesa privada.
- **Escrito:** crea un borrador privado con el texto revisado, una referencia `[^R1]` y su primera versión de historial. Requiere permiso para redactar escritos. Los libros y las observaciones personales conservan sus advertencias específicas.

El cotejo verifica texto conservado, localización, huellas y permisos. Una cita de transcripción no acredita que el texto represente fielmente cada palabra del audio ni que lo declarado haya ocurrido. La revisión de una propuesta no marca automáticamente la transcripción como revisada escuchando el original.

Las conversiones son atómicas e identificadas: repetir la misma petición recupera su destino sin duplicarlo. Un destino eliminado o un origen que perdió acceso no se recrean mediante un reintento. Una modificación del registro exige revisar su nueva versión antes de una nueva conversión.

## Interrupciones y recuperación

Detener, salir de En vivo, ocultar la pestaña o navegar fuera detiene la captura y libera todos los dispositivos de origen. Los tramos confirmados permanecen en el Host. Si el servicio tarda más que la captura, la cola se limita a dos archivos y se detiene la captación; el panel informa la interrupción.

Los tramos pendientes pueden descargarse o reenviarse con los mismos identificadores. Al navegar dentro de la misma pestaña, una copia temporal en memoria permite recuperar la cola y el último archivo finalizado después de consultar nuevamente la mesa y la sesión autorizadas. Se limita a veinte mesas y ocho horas, sin almacenamiento persistente del navegador y sin envío automático al regresar. No ofrece recuperación tras cerrar o recargar la aplicación. Perder el acceso elimina la copia local correspondiente.

Un fallo del transcriptor conserva el original que ya llegó al Host. Se puede reintentar ese procesamiento sin reenviar otro audio pendiente. Una operación interrumpida se muestra como recuperable cuando caduca su bloqueo; si el original no llegó, hace falta reenviar la copia pendiente o incorporar un archivo descargado. Una respuesta perdida no proporciona garantía de facturación única por parte de un proveedor externo, aunque LexOpen impide duplicar sus registros y publicaciones.

La configuración del transcriptor y la política de envío se comprueban de nuevo antes de transmitir bytes. Desactivar o cambiar el servicio durante las comprobaciones impide utilizar la configuración anterior. Las publicaciones compensan su almacenamiento temporal si falla la transacción.

## Implementación y verificación

La migración aditiva `20261102220000_hearing_live_audio_promotions` incorpora sesiones, tramos y recibos de conversión, con relaciones que preservan el propietario de los audios. No transforma el contenido anterior. La política del navegador permite micrófono y captura de pantalla sólo para el propio origen; el permiso explícito del navegador y la confirmación de la aplicación siguen siendo necesarios.

El paquete Desktop de macOS declara el uso del micrófono y conserva los permisos del entorno endurecido, añadiendo la entrada de audio. Su control de micrófono se limita a la ventana principal y al origen seguro de LexOpen. La captura necesita HTTPS o loopback; no se habilitan excepciones para orígenes HTTP de red. Se comprobaron la configuración y los controles mediante pruebas de contrato; no se construyó ni instaló un paquete firmado en esta entrega.

Las pruebas utilizan datos ficticios, un proveedor simulado y bases PostgreSQL desechables. El navegador prueba su `MediaRecorder` nativo con un dispositivo de audio sintético, conservación y lectura de originales, texto publicado, los tres destinos, referencias, acceso privado y recuperación. Esto verifica la integración, no la precisión de un modelo de voz real. La captura del audio de una pestaña o del sistema depende del navegador y del sistema operativo y requiere su propio ensayo en el equipo del estudio.

La revisión funcional independiente detectó y confirmó corregidos la conservación del último archivo al navegar, la apertura del clip en el lector, la recuperación de operaciones caducadas, la compensación del TXT y la configuración anterior al envío. El ensayo nativo encontró además una carrera de limpieza de React StrictMode: una instancia vacía retiraba la copia suspendida de otra instancia. Se corrigió y el mismo escenario pasó, sin retirar sus comprobaciones de micrófono detenido, confirmación manual y ausencia de envío automático.

| Comprobación local | Resultado |
| --- | --- |
| Unitarias y pruebas adicionales de permisos Desktop | Aprobadas. |
| Integración completa con PostgreSQL desechable | Aprobada: documentos, investigación, biblioteca, audios, audiencias, conversiones y escritos. |
| Navegador, 53 escenarios | 52 aprobados en la ejecución completa; el restante aprobado en repetición dirigida después de corregir la recuperación con Atrás. Se conservan ambos registros. |
| Lint, tipos y compilación de producción | Aprobados. La compilación conserva cuatro avisos anteriores de trazado de dependencias. |
| Migraciones frente al esquema Prisma | Sin diferencias. |
| Confirmación visual de escritorio, móvil de 360 px y oscuro | `ship`: controles de captura cercanos al encabezado y editor de conversión antes de información ampliada. |

Los nueve ejemplos visuales, los registros y sus sumas SHA-256 se conservan en `docs/transcripcion-en-vivo-2026-11-02/`. El despliegue en el Host del estudio no forma parte de esta comprobación local.
