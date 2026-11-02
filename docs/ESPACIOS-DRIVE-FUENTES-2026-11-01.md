# Espacios, Drive y fuentes oficiales

Entrega del 1 de noviembre de 2026. Rama `codex/spaces-drive-official-sources`, sobre `codex/pdf-legal-research` f931738 ([PR 208](https://github.com/gabrielperezibacache/lexopen/pull/208)). Requiere esa base y las correcciones del PR 207; no incluye despliegue de un Host. Continúa el [plan de capacidades propias](PLAN-DESARROLLO-TRIFOLIA.md), sin servicios de TRIFOLIA.

## Archivos de espacios

En **Espacios → Archivos → Ver fuentes**, el mismo lector del expediente prepara una captura del archivo, conserva su original y permite buscar, abrir y comprobar citas. Un PDF conserva páginas físicas, imagen del original, OCR local y estados explícitos de páginas vacías o pendientes. Otros formatos admitidos se convierten localmente; las posiciones de texto no se presentan como páginas.

La captura se identifica por recurso, revisión de origen, hashes del original/texto y versión del extractor. Preparar A, sustituirlo por B y volver a A crea tres capturas diferentes: el lector y la investigación seleccionan el último A, conservando el primer A y B para los enlaces históricos. Las versiones antiguas del esquema reciben `sourceRevision=legacy`; no se reescriben sus textos ni hashes. Solo las revisiones capturadas conservan evidencia: no se reconstruyen retrospectivamente originales que nunca se guardaron.

Originales, páginas, fragmentos y verificación de citas comprueban el acceso actual del equipo, causa vinculada, muro ético, confidencialidad y privilegio. El portal no recibe este lector interno. Eliminar o retirar acceso al archivo impide recuperar su evidencia; los enlaces no conceden autorización permanente.

## Drive: elegir y conservar una copia

En el detalle de una causa, **Google Drive → Elegir archivos de Drive** lista páginas de hasta 50 archivos de su carpeta vinculada. Elegir uno muestra revisión, fecha, formato y si se descargará el original o una exportación. **Guardar copia elegida en LexOpen** incorpora solo esa revisión al expediente y devuelve el enlace a su lector de fuentes; el procesamiento de texto continúa localmente en la cola durable existente.

Los documentos y presentaciones de Google se exportan a PDF; las planillas, a XLSX. Los binarios admitidos conservan sus bytes originales. `DriveDocumentImport` registra carpeta, archivo, revisión, formato de exportación, hash, fecha y metadatos de procedencia. Cada revisión nueva crea un documento local distinto. Reintentos y altas concurrentes de la misma revisión recuperan una única copia. El registro no usa el campo del upload como destino remoto: importar no configura una re-subida al archivo de origen.

Antes de leer o guardar se comprueban rol y permisos actuales. Se verifica carpeta, pertenencia directa, estado de eliminación, permiso de descarga, revisión antes/después, tamaño y checksums disponibles. Un cambio durante la descarga exige volver a revisar; no reemplaza silenciosamente la copia. Documento, procedencia, actividad y auditoría se confirman juntos. El servidor no sigue accesos directos ni URLs de descarga arbitrarias. Los límites son 25 MiB para binarios, 10 MiB para exportaciones de Google y 30 segundos por operación remota.

Se utiliza la cuenta OAuth configurada en **Integraciones de LexOpen**, con el alcance `drive.file` existente. Solo aparecen archivos que Google permite ver a esta aplicación en esa carpeta; vincular una URL no amplía ese permiso. No hay búsqueda global, Google Picker ni nuevos permisos OAuth en esta entrega. Google puede requerir reconectar o conceder acceso al archivo. La disponibilidad real de una cuenta debe comprobarse en la instalación autorizada: las pruebas de Google de esta entrega usan respuestas controladas, no credenciales reales.

## Investigación conjunta

En **Jurisprudencia → Consultar**, el alcance permite combinar fuentes jurídicas incorporadas, un expediente y un espacio autorizado. Puede elegir archivos concretos del espacio y filtrarlos por nombre antes de seleccionarlos. Se revisa la última captura preparada de cada archivo, hasta 200 archivos de espacio y 200 documentos del expediente por consulta; los que no tienen evidencia o tienen páginas pendientes se informan por separado.

Las citas distinguen «Archivos del espacio» y «Documentos del expediente». Cambiar espacio o selección retira los resultados anteriores. El historial restaura los IDs elegidos y comprueba de nuevo todos sus permisos, incluso cuando la cita no estaba entre los resultados finales. Revocar el acceso al espacio o a un archivo impide recuperar la consulta que lo contenía. La búsqueda sigue siendo local y extractiva, sin llamadas a un modelo o a fuentes externas durante la pregunta.

## BCN y SII

El bloqueo BCN de la entrega anterior se resolvió usando sus servicios públicos oficiales: XML para la norma consolidada actual y JSON del cliente LeyChile para una versión histórica identificada. El XML no se usa para simular una versión histórica: se comprobó que ignora `idVersion`. El conector histórico exige que la respuesta identifique exactamente la norma y la fecha de versión pedidas. No acepta una fecha arbitraria como si fuera una versión comprobada.

Se añaden oficios individuales HTML de Renta e IVA del SII, incluidos sus alias antiguos y modernos. Se mantiene Dirección del Trabajo. URLs y rutas están cerradas; DNS se comprueba al conectar, sin redirecciones, cookies o credenciales. Una copia manual conserva su procedencia manual y el organismo correcto.

La [ampliación de fuentes oficiales](FUENTES-OFICIALES-AMPLIACION.md) conserva URLs, formatos, fechas, cobertura y hashes de cinco descargas nativas. Además, el ensayo HTTP contra la aplicación compilada importó realmente BCN actual, BCN histórica de 2005-09-22 y un oficio del SII, y recuperó sus originales. Que una versión esté identificada no acredita su vigencia ni la cobertura completa de un organismo. PDFs jurídicos, resoluciones SII en otros formatos, CGR, corpus judicial y búsqueda federada siguen pendientes.

## Esquema, validación y actualización

Esta entrega añade tres migraciones, de 31 a **34**: procedencia Drive, revisión de origen e identidad de captura que incluye esa revisión. Son aditivas; no se editaron las migraciones anteriores ya ensayadas. Se probaron conservación de campos históricos, valores `legacy`, procedencia y originales, actualización y respaldo/restauración lógica con archivos locales.

El [registro de validación](espacios-drive-fuentes-2026-11-01/VALIDACION.md) contiene estados de ejecución, logs, capturas y límites. Incluye procesamiento local, permisos y carreras, regresión A → B → A y ensayo de producción con CSRF normal. Las pruebas usan PostgreSQL y archivos ficticios separados del estudio. No acreditan OAuth real, dispositivos físicos, S3, vault ni recuperación física del Host.

Antes de actualizar una instalación: detener el Host y sus workers, conservar respaldo verificable de base/archivos/configuración, instalar dependencias, aplicar `prisma migrate deploy`, generar Prisma y compilar. Mantener Poppler y Tesseract con los idiomas configurados. Comprobar una cita histórica y una captura nueva; después verificar una importación elegida de Drive con la cuenta autorizada. No sustituir las migraciones por `db push`.

## Continuación del plan

Quedan habilitados los flujos de evidencia de `Documento`, `SiteFile` y copias identificadas de Drive. Continúan pendientes sincronización elegida de revisiones, lotes recuperables de espacios, Google Picker si se necesita ampliar la elección con `drive.file`, evaluación de extracción en el Host objetivo y mediciones de calidad/escala. En investigación, siguen los conectores oficiales pendientes, evaluación jurídica revisada, comparación entre versiones y precedentes y recuperación semántica medida. No se atribuye paridad completa con las 58 capacidades.
