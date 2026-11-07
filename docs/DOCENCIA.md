# Mapa de funciones de Docencia

Abre **Académico → Docencia** y elige el tipo de trabajo. Cada trabajo conserva su ficha, documentos, fuentes e historial. Cuando el programa está en preparación, puedes trabajar en él y revisar sus citas antes de compartir el archivo.

| Flujo | Disponible en LexOpen | Siguiente paso |
| --- | --- | --- |
| Cursos | Ficha de curso, syllabus editable, bibliografía base y sugerencias por solicitud. Sesiones semanales o quincenales en Agenda. | Añadir unidades, resultados y evaluaciones reutilizables. Permitir escoger las sesiones que se incorporan al syllabus. |
| Seminarios | Trabajo privado y plantilla de programa, ponentes, lecturas y discusión. | Vincular ponentes, moderación, lecturas y materiales a cada sesión. |
| Congresos | Trabajo y plantilla de ejes, comité, programa, convocatoria e hitos. | Estructurar mesas, responsables, sedes, revisiones y avisos de programa por versión. |
| Talleres | Trabajo y plantilla de actividades, tiempos, materiales y evaluación. | Ordenar los bloques de trabajo y generar una hoja para participantes a partir de los bloques elegidos. |
| Convocatorias | Ficha con país, organismo, bases, fecha límite y estado. Las fichas guardadas desde un aviso conservan su procedencia y la fecha de consulta. | Vincular responsables, anexos y un curso o proyecto de investigación. |
| Búsqueda y fuentes por país | Catálogo oficial por país. Busca por tema entre los avisos que ya consultaste y filtra tu cartera por país. | Ampliar las fuentes y los filtros por área, elegibilidad y modalidad. |
| Suscripciones | Sigue los feeds compatibles y elige si consultarlos a demanda o automáticamente. Las novedades de las consultas programadas aparecen en la campana de LexOpen. | Añadir consultas temáticas guardadas e historial de avisos por fuente. |
| Agenda | Programa series semanales o quincenales, ajusta cada sesión y configura avisos en la campana. Puedes descargar un archivo ICS o suscribir otro calendario mediante un enlace revocable. | Preparar un programa con las sesiones seleccionadas y añadir opciones para planificar varios días de la semana. |

Las sesiones se registran en hora de Santiago de Chile, la zona que usa la Agenda interna. Sólo tú puedes ver las actividades de tus trabajos privados. Puedes revisarlas en las vistas de mes, semana y lista.

## Programar sesiones y recordatorios

1. En **Actividades en mi Agenda**, escribe el nombre, el inicio y el término si corresponde. Abre **Repetición y recordatorio** para programar entre 2 y 24 sesiones semanales o quincenales. La hora local de Santiago se conserva a través de los cambios de horario.
2. Usa **Editar** en una sesión para moverla o cambiar su nombre. Para retirar actividades, elige **Sólo esta sesión** o **Esta sesión y las siguientes** dentro del orden de la serie.
3. Configura un aviso de 15 minutos, 1 hora, 24 horas o 1 semana antes. Puedes aplicarlo al crear la serie o cambiarlo en una sesión. El Host muestra el aviso en la campana cuando está disponible antes del inicio. Si mueves o retiras una actividad, los avisos anteriores se ocultan.
4. Si suscribiste otro calendario, éste recoge los cambios cuando vuelve a consultar el enlace. La programación y los avisos de LexOpen se administran desde el trabajo docente.

## Consultar y guardar convocatorias

1. Abre **Académico → Docencia → Convocatorias oficiales** y filtra por país. Desde cada fuente puedes abrir el portal oficial. [ANID](https://post.anid.gob.cl/frontend.php/es/postulacion/concurso) · [Agencia Estatal de Investigación](https://www.aei.gob.es/convocatorias/buscador-convocatorias)
2. Selecciona **Seguir fuente** y luego **Consultar feed**. Puedes buscar por tema entre los avisos de la última consulta. Si falla una actualización, LexOpen conserva los resultados anteriores e indica su fecha. [UK Research and Innovation](https://www.ukri.org/opportunity/) · [National Science Foundation](https://www.nsf.gov/rss)
3. Guarda un aviso en **Mis convocatorias**. LexOpen recupera la ficha existente si vuelves a guardar ese aviso. Si la fuente cambia, podrás revisar la novedad y actualizar tu ficha.
4. Revisa la fecha y hora de cierre en las bases. Cuando la ficha tenga fecha de cierre, elige el día y la hora que quieres registrar en tu Agenda de Santiago. **Descargar agenda (.ics)** permite importar una copia de las actividades de ese trabajo en otro calendario.

## Activar consultas automáticas

Selecciona **Activar consultas automáticas** junto a una fuente que sigues. Después de una consulta exitosa, la siguiente queda programada para unas 12 horas después. El Host realiza la consulta cuando está disponible. La primera lectura establece el punto de partida. Las siguientes muestran en la campana los avisos nuevos y los que cambiaron. Puedes pausar las consultas sin dejar de seguir la fuente.

Si falla la fuente, LexOpen conserva la última lectura exitosa y vuelve a intentar la consulta más tarde. La información que guardaste en una ficha se mantiene hasta que la edites.

LexOpen Desktop inicia el procesador en el Host. En una instalación de servidor, usa el programador del Host con `LEXOPEN_JORNADA_INTERVAL_MINUTES` habilitado o llama periódicamente a `POST /api/jornada/worker` con el encabezado `x-cron-secret` configurado.

## Suscribir otro calendario

En un trabajo docente, abre **Actividades en mi Agenda → Suscribir otro calendario**, confirma la generación y copia el enlace. En tu calendario, elige agregar una suscripción desde una URL. El calendario externo actualiza su vista según su propia frecuencia y el enlace le permite leer los títulos y horarios. Por ejemplo, Calendario de Mac permite elegir la frecuencia de actualización de una suscripción. [Ayuda de Calendario de Apple](https://support.apple.com/guide/calendar/subscribe-to-calendars-icl1022/mac)

Usa una dirección HTTPS de LexOpen que el otro calendario pueda alcanzar. Una dirección local permite comprobar el enlace desde el equipo donde se ejecuta el Host. Trata el enlace como una credencial. Puedes generar otro o revocarlo en cualquier momento. Los calendarios que ya consultaron el enlace pueden conservar copias.

Si administras un servidor publicado por un proxy, excluye `/api/altazor/academic/calendar-subscriptions/` de los registros de acceso del proxy. LexOpen excluye esta ruta de su registro de solicitudes de desarrollo.

## Orden de desarrollo

1. **Organización por actividad.** Convertir secciones de las plantillas en campos y listas editables. Permitir imprimir o descargar el programa sin incluir las notas privadas del equipo.
2. **Cartera de convocatorias.** Conservar país, organismo, enlace, bases, zona horaria, fecha límite, estado y versión. Reutilizar la misma ficha en la búsqueda, la revisión y la agenda.
3. **Descubrimiento por país.** Ampliar el catálogo con fuentes oficiales verificadas y presentar filtros por área, elegibilidad y cierre según los datos de cada organismo.
4. **Feeds.** Añadir consultas guardadas e historial de cambios por convocatoria, conservando el origen y la fecha de consulta.
5. **Programa docente.** Vincular lecturas, materiales y resultados de aprendizaje a sesiones seleccionadas y generar el programa desde la Agenda.
