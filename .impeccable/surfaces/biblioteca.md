# Biblioteca jurídica personal

## Mode

Operate, con exploración de libros como experiencia principal y lectura como tarea secundaria.

## Brief

El usuario eligió libros clásicos de cuero en 3D y biblioteca privada con colecciones compartibles. Hereda la identidad de LexOpen. Éxito: importar un libro, reconocerlo como propio, cambiar su encuadernación o estante, compartir una selección y producir un borrador con citas que abran sus pasajes.

## Hierarchy

Nombre personal de la biblioteca, importar libro y personalizar; búsqueda y selección de estante; estantes con libros reales o un estado vacío cuidado; libro abierto con ficha, pasajes y original; mesa de escritura con selección de libros, recuperación, borrador y referencias verificadas.

## Constraints

Sin libros falsos en la colección real, sin IA simulada presentada como resultado real, sin páginas inventadas para EPUB, sin hacer pasar una comprobación de literalidad por verdad jurídica. Escritorio y móvil de 360 píxeles, teclado y movimiento reducido. Una inspección conjunta y una confirmación dirigida como máximo.

## Aprobación y distribuciones

El usuario pidió conservar las tres composiciones mostradas como opciones de personalización y añadir más. Aprobó así la variedad y delegó las variantes adicionales. Composiciones: `.impeccable/mocks/library-mesa.png`, `library-estantes.png`, `library-gabinete.png`; se añaden galería, archivo y salón. Cada distribución cambia la composición y densidad del estante, manteniendo los libros y permisos.

## Inventario de implementación

| Ingrediente | Medio y compromiso |
| --- | --- |
| Cromo de LexOpen | AppShell y AppSidebar existentes; no reemplazar |
| Cubierta, lomo, canto y profundidad | Geometría CSS 3D interactiva con texto HTML y foco de teclado |
| Cuero y madera | Texturas raster propias; luces y geometría CSS |
| Nombre del propietario, títulos y ficha | Texto HTML con datos reales; tipografía existente |
| Importar y personalizar | Controles semánticos, visibles desde la cabecera |
| Estantes y selección | Seis distribuciones adaptables; sin añadir libros de ejemplo a los datos reales |
| Mesa y citas | Editor HTML y pasajes con localizador y comprobación de la fuente realmente conservada: original o TXT |
| Lámpara y plantas de la composición | No son funciones ni contenido de la colección; no se incluyen en la superficie operativa |

## Construido

La implementación conserva AppShell, AppSidebar, Sora, Fraunces y los tokens de cobre, verde mar y papel. `BookObject` construye cubierta, lomo y canto como planos CSS; el texto sigue siendo HTML. `Bookshelf` aplica las preferencias del propietario mediante atributos de distribución, madera y vista. Los mocks son referencias de composición aprobadas, nunca contenido de la colección. La única encuadernación del estado vacío está identificada como vista previa.

| Opción de interfaz | Resultado construido |
| --- | --- |
| La mesa de estudio (`mesa`) | Ex libris personal lateral y estantes próximos. |
| La gran biblioteca (`estantes`) | Estantes a todo el ancho, sin rail de ex libris. |
| El gabinete (`gabinete`) | Propiedad en un rail estrecho y libros de lomo. |
| La galería (`galeria`) | Cubiertas amplias sobre papel, sin fondo ni cantos de madera. |
| El archivo (`archivo`) | Madera profunda, lomos densos y una cubierta de dos columnas cada cinco volúmenes en la vista de cubiertas. |
| El salón de lectura (`salon`) | Ex libris horizontal y grupos de estantes sobre papel, con cantos de madera. |

Las seis distribuciones se pueden combinar con nogal clásico, roble claro o madera oscura, y con las vistas por cubiertas o por lomos, respetando las reglas de densidad de cada distribución. El libro permite burdeos, verde bosque, azul noche, coñac, marfil y grafito; los tres materiales son cuero clásico, tela editorial y cubierta sencilla. Cuero utiliza la textura producida con mezcla `soft-light`; tela elimina la textura; cubierta sencilla elimina además marcos y ornamento. El lector utiliza el entorno de nogal y la encuadernación guardada del libro.

La adaptación conserva composición y navegación a 360 píxeles: los formularios, el lector y la mesa se apilan; la galería pasa a una columna, las cubiertas habituales a dos, gabinete y lomos a tres, y archivo mantiene su retícula compacta. El título completo sigue bajo el volumen aunque su cubierta abrevie palabras. El enlace y la selección para fundamentar son acciones separadas. El foco es visible y el movimiento reducido mantiene la pose estática del libro.

La importación ofrece conversión a TXT con OCR cuando sea necesario y conservación del original, con preferencias por profesional y ajustes por tanda. Por defecto se conserva el original y la conversión opcional está desactivada; el aviso de archivo voluminoso empieza en 10 MiB y admite de 1 a 25 MiB. Al elegir sólo texto, la conversión queda activada y el aviso explica la pérdida de cotejo visual en LexOpen. El recibo informa tamaño retenido y sólo declara ahorro cuando lo hubo. Las preferencias se aplican a nuevas importaciones.

`BookReader` muestra imagen y página física sólo cuando conserva el PDF original. EPUB y los demás formatos usan su localizador real. Si se conserva sólo TXT, ficha, descarga y citas identifican el texto como base de cotejo; no ofrecen un original ni páginas inexistentes. La mesa de escritura presenta fuentes seleccionadas, recuperación de pasajes y propuesta de IA con referencias diferenciadas del texto literal. La literalidad no certifica autoría ni vigencia jurídica.

## Materiales entregados

- Texturas independientes de cuero y nogal: `public/library/textures/leather.webp` y `public/library/textures/walnut.webp`. Dimensiones, prompts, procedencia y aceptación: `.impeccable/assets/manifest.json` y sus metadatos acompañantes. La geometría, las luces y los textos pertenecen al código.
- Referencias aprobadas: `.impeccable/mocks/library-{mesa,estantes,gabinete,galeria,archivo,salon}.{png,webp,json}`. Los seis metadatos registran aprobación; son composiciones ilustrativas.
- Sistema construido: `DESIGN.md` con frontmatter normativo y las ocho secciones canónicas; extensiones, estados y muestras independientes en `.impeccable/design.json`.

## Cierre visual recibido

La revisión independiente final se cerró con PASS y sin P1 o P2 abiertos, tras un único lote acumulado de correcciones de los tres P2 iniciales. Se documenta ese cierre; no se abre otra ronda de inspección.

- Dieciocho capturas finales de las seis distribuciones en escritorio y móvil, vacío, lector y mesa: `/private/tmp/lexopen-books-design-final/personal-library-bibliotec-b0fbe-ito-y-revocación-compartida-chromium/`.
- Seis capturas de conversión, preferencias y lector sin original en escritorio y móvil: `/private/tmp/lexopen-books38-conversion-ui/library-conversion-convers-5dcda--citas-sin-afirmar-original-chromium/`.
- Detector mecánico ya ejecutado: `/private/tmp/lexopen-books-design-scan.json`. Sus tres advertencias corresponden a los bordes de las miniaturas geométricas de distribución, no a acentos en tarjetas de contenido; quedaron reconocidas en la revisión. No se repite el detector.

Estos archivos temporales registran la evidencia local del cierre visual; no prueban publicación ni ejecución en producción.

## Continuidad de la sesión

La consulta desde una causa conserva un recorrido autorizado hacia expediente, audiencia y escritos. El lector permite elegir ese volumen en el escrito de origen sin compartir la colección ni insertar citas automáticamente. La mesa personal mantiene sus campos entre apartados, diferencia pendiente/guardando/guardado y protege reemplazos y salidas. Al regresar comprueba sus fuentes; un error de recarga oculta el material y ofrece recuperación sin desmontar la edición en memoria. Durante el guardado se bloquean los campos para conservar la correspondencia entre lo enviado y lo confirmado.
