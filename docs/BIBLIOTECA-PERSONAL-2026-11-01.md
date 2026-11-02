# Biblioteca jurídica personal

Entrega del 1 de noviembre de 2026. Rama `codex/personal-law-library`, sobre `codex/case-knowledge-library` ([PR 210](https://github.com/gabrielperezibacache/lexopen/pull/210)). Amplía el [plan de capacidades propias](PLAN-DESARROLLO-TRIFOLIA.md) con una librería de archivos personales y una mesa de escritura con fuentes, sin dependencia de TRIFOLIA. Requiere las entregas anteriores; no incluye despliegue ni migración de datos de una instalación del estudio.

## Libros propios y personalización

El nuevo apartado **Biblioteca** tiene libros tridimensionales con cubierta, lomo, canto de páginas y encuadernación. La dirección clásica de cuero fue elegida por el usuario. Las texturas se combinan con geometría CSS y títulos HTML; no se utilizan imágenes con títulos ficticios para sustituir archivos reales. Los libros de una colección vacía no se inventan.

Cada profesional conserva su propia librería y puede cambiar título, autor, edición, editorial, año, identificador, color, material, texto del lomo, estante y favorito. El archivo original permanece separado de la ficha y de su apariencia. Cambiar una encuadernación no cambia sus bytes ni su hash. Una edición basada en una revisión antigua se rechaza en vez de sobrescribir otra más nueva.

**Personalizar** permite nombrar la librería, elegir nogal, roble o ambiente nocturno, cambiar entre cubiertas y lomos y guardar una de seis distribuciones: mesa, estantes, gabinete, galería, archivo y salón. Son preferencias por usuario, conservadas después de recargar. La interfaz mantiene la navegación y tipografía de LexOpen, foco de teclado y una presentación sin giro cuando se solicita movimiento reducido.

## Importar y leer archivos

**Importar libro** acepta un archivo de hasta 25 MiB y permite completar su ficha. La lista de formatos incluye PDF, EPUB, DOC, DOCX, ODT, RTF, TXT, Markdown, HTML, CSV, JSON, XML, XLSX, ODS, PPTX y ODP. La extracción local puede rechazar un archivo dañado, cifrado, vacío, no interpretable o que exceda sus límites. La aceptación de una extensión no demuestra que se hayan probado todas sus variantes. Las pruebas positivas de esta entrega cubren PDF nativo/OCR, EPUB, DOCX, texto UTF-8 y HTML seguro.

El archivo conservado queda identificado con SHA-256. Por defecto se mantiene el original; el profesional puede elegir la conversión a texto y omitirlo en una importación nueva, como se explica a continuación. El texto preparado se divide en fragmentos con posiciones Unicode y hashes. En PDF con original conservado se guardan páginas físicas y su vinculación al texto completo; la página se puede abrir como imagen del original. En EPUB se respeta el orden de lectura del libro y se muestran sección y fragmento: no se inventa una página equivalente a una edición impresa. Los otros formatos sin paginación conservan fragmentos de texto identificables.

La importación controla los bytes recibidos, también cuando no existe `Content-Length`. Los EPUB y documentos comprimidos se examinan en memoria, sin extraer rutas al disco ni buscar recursos remotos. Se limitan entradas, expansión, tamaño y texto; se rechazan rutas inseguras, enlaces simbólicos, cifrado y entidades XML externas. El texto plano requiere UTF-8 válido y no admite contenido binario.

## Conversión opcional y conservación del original

Al importar se puede activar **Convertir a texto** y decidir si también se conserva el archivo original. La conversión usa extracción local y OCR cuando el PDF lo requiere. El texto preparado se puede descargar como TXT. No se permite omitir el original sin activar la conversión ni conservar un TXT vacío como respaldo de una fuente ilegible.

Las preferencias personales incluyen si se propone convertir, si se conserva el original por defecto y un umbral para advertir de archivos pesados: 10 MiB inicialmente, configurable entre 1 y 25. La elección final se aplica a cada importación y no borra archivos incorporados anteriormente. El límite máximo de recepción sigue siendo 25 MiB, incluso al elegir una copia de texto más pequeña.

Si se conserva el original, las citas siguen contrastándolo; la conversión no elimina sus páginas físicas ni la posibilidad de descargarlo. Si se decide omitirlo, se guarda únicamente el texto UTF-8 preparado y su propio SHA-256. La huella del archivo recibido queda como procedencia, pero no se presenta como un original que pueda volver a cotejarse. La referencia pasa a **texto retenido y fragmento**, sin una página PDF ni imagen del original. Descargar ese original devuelve un estado explícito de no conservado y se ofrece el texto disponible.

La interfaz, los mensajes al modelo y las notas del escrito distinguen **contraste con original** de **contraste con texto retenido**. En el segundo caso se puede comprobar que la cita reproduce el TXT almacenado, no que el OCR o la conversión reprodujeron correctamente un archivo que el usuario eligió no conservar. Para volver a cotejarlo se debe disponer del archivo fuera de LexOpen o incorporarlo de nuevo conservando el original.

## Privacidad y colecciones compartibles

Los libros son privados por defecto, incluso frente a administradores que no sean sus propietarios. Una colección puede compartir lectura y consulta con profesionales elegidos del estudio. El propietario selecciona únicamente libros propios y destinatarios actualmente autorizados. Compartir no transfiere propiedad ni permite al lector editar la ficha, eliminar el libro o volver a compartirlo como propio.

Cada lectura comprueba de nuevo el usuario, sus capacidades, el propietario de la fuente y la relación de acceso actual. Retirar un libro, revocar el acceso a una colección o cambiar su selección invalida derivados incompatibles. Un historial que perdió respaldo no devuelve título ni texto: sólo una entrada opaca no disponible. El portal de clientes no recibe estos libros internos.

Esta librería es distinta de las colecciones de fuentes de **Jurisprudencia → Biblioteca** del incremento anterior. Aquellas fijan versiones de fuentes públicas, documentos de causa o archivos de espacios. Este nuevo apartado incorpora archivos personales con propiedad independiente y colecciones compartibles. No se vuelven documentos generales del estudio por importarlos.

## Recuperación y escritura fundamentada

En **Mesa de escritura**, el profesional elige libros o colecciones y formula una búsqueda. La recuperación es local mediante BM25 sobre fragmentos de texto: no usa un servicio de vectores ni supone equivalencia semántica. Se informa cuándo la selección excede la ventana de revisión. Sin pasajes corroborables se abstiene y no llama a un modelo.

El modo de pasajes reúne extractos con sus referencias y conserva el texto previo del profesional. El modo IA usa el proveedor ya configurado en LexOpen, con el permiso actual del usuario y la política del estudio. El modo `local_only` bloquea el envío a un proveedor remoto. Las pruebas ejercitaron esta frontera con un transporte de prueba; no se presenta como una evaluación de calidad de un modelo real.

Para generar, se suministran fragmentos como datos no confiables y se exige una respuesta estructurada con identificadores de fuentes existentes. Se rechazan referencias desconocidas, notas inventadas y citas textuales que no aparezcan en los pasajes elegidos. El servidor añade las notas, bibliografía, ubicación, enlace y pasaje literal comprobado. Los mensajes se empaquetan dentro del límite del proveedor común para que no se descarte silenciosamente la última fuente o parte del texto previo.

El borrador mantiene por separado la prosa editable y las referencias compiladas. El texto previo del profesional permanece como prefijo y la IA añade una ampliación; no sustituye el original. Las correcciones se guardan con control de revisión y auditoría. Al leer, copiar o exportar, se vuelven a comprobar fuentes y acceso; los datos bibliográficos de las notas se actualizan desde la ficha autorizada. La exportación TXT o Markdown conserva los pasajes, enlaces y base de verificación. Un respaldo conservado que fue retirado o alterado bloquea la recuperación del borrador que depende de él.

Corroborar significa comprobar literalidad, ubicación e integridad del respaldo disponible, identificado como original o texto retenido. No acredita la autoría declarada, exactitud jurídica, verdad del razonamiento ni vigencia normativa. La prosa generada y las ediciones humanas requieren revisión profesional; la validez de un identificador de cita no demuestra que toda inferencia del párrafo sea correcta.

## Límites de esta entrega

| Operación | Límite |
| --- | --- |
| Importación | 25 MiB por archivo; hasta 200 libros activos por propietario |
| Texto preparado | Hasta dos millones de caracteres por libro |
| Colecciones | Hasta 100 propias, 200 libros y 50 destinatarios por colección |
| Consulta | Selección explícita de hasta 20 libros y diez colecciones; máximo 20 libros en la selección conjunta |
| Recuperación | Ventana de 3.000 fragmentos; hasta 12 resultados, hasta ocho para generar |
| Pasaje enviado al modelo | Hasta 1.800 caracteres por resultado; mensajes acotados y sin truncado silencioso |
| Borradores | Hasta 200 por persona; historial muestra hasta 50 entradas por lectura |
| Lectura | Hasta 100 fragmentos por página; PDF de hasta 500 páginas dentro del presupuesto del extractor |

No incorpora embeddings, consulta ilimitada, sincronización con una tienda, DRM, préstamo comercial ni transferencia de licencias. La propiedad en la interfaz representa la copia incorporada y su control de acceso; no determina derechos de propiedad intelectual sobre el contenido.

## Migración, pruebas y continuación

Las migraciones aditivas `20261102010000_personal_book_library` y `20261102020000_book_library_layout` llevan el esquema de 35 a **37** migraciones. Añaden ocho tablas y el campo de distribución personal. Su ensayo conservó todos los campos anteriores. La restauración lógica de esa base reprodujo **97 tablas, 761 filas y 30 objetos**, con libros TXT/EPUB/PDF, propiedad, lectura compartida, preferencias, historial revocado, borrador, referencias y página física 2. Un proceso nuevo volvió a leerlos y comprobó tres conflictos de revisión sin cambiar la base ni los archivos.

La ampliación de conversión utiliza `20261102030000_book_text_retention` y lleva el esquema a **38** migraciones. Añade los datos de conservación y preferencias; los libros anteriores mantienen `originalRetained=true`, la conversión desactivada y sus originales intactos. Sus citas guardadas conservan los identificadores previos. El [registro](biblioteca-personal-2026-11-01/VALIDACION.md) separa el ensayo de base 37 del ensayo final 37→38 con libros ya existentes.

La restauración final 38 conservó **97 tablas, 783 filas y 32 objetos**, incluidos un PDF convertido a TXT sin original y un EPUB convertido con original, sus bases de contraste distintas, preferencias, lectura compartida y borradores. Un proceso nuevo verificó también los libros y citas heredados de la base 37, sin cambiar datos ni archivos y sin red o modelo.

El [registro de validación](biblioteca-personal-2026-11-01/VALIDACION.md) conserva resultados, incidencias del adaptador temporal, registros y hashes. Distingue compilación y pruebas locales de comprobaciones remotas y de cualquier despliegue del Host.

Antes de actualizar una instalación: detener Host y workers, guardar un respaldo verificable de base, archivos y configuración, instalar dependencias, aplicar `prisma migrate deploy`, generar Prisma y compilar. Mantener Poppler y Tesseract para PDF/OCR. Comprobar una cita PDF, una sección EPUB, un permiso compartido y un borrador. No sustituir las migraciones por `db push`.

Esta entrega amplía F3 con una librería personal utilizable y redacción asistida con citas. Siguen pendientes evaluación jurídica de inferencias, recuperación semántica medida, más variantes de formatos, mediciones sobre bibliotecas grandes, importación por lotes recuperable y conexión directa del borrador a otros editores de escritos. Las demás capacidades del plan mantienen su alcance pendiente.
