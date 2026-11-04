# LexOpen

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Profesionales jurídicos y estudios que trabajan con expedientes, fuentes y escritos; investigadores y docentes que desarrollan trabajos académicos privados con esas fuentes. El portal del cliente es una superficie separada de las herramientas internas.

## Product Purpose

Reunir el trabajo jurídico y académico en LexOpen mediante ALTAZOR AI, una entrada de conversación y herramientas personales, y permitir que cada afirmación utilizada pueda volver a su fuente conservada y autorizada.

## Operating Context

Aplicación Next.js con PostgreSQL y almacenamiento de originales en un Host del estudio. Documentos y páginas PDF, espacios, investigación local, hechos y revisión humana ya forman parte del repositorio. Se usa desde el navegador o Desktop en modo Host/Cliente. ALTAZOR abre Mi jornada sin alterar las siete áreas de navegación. La IA utiliza el destino configurado y la política del estudio; cada envío remoto requiere autorización para el contenido elegido.

## Capabilities and Constraints

La biblioteca solicitada es privada por profesional, con colecciones compartibles. Admite incorporación de libros y documentos en PDF, EPUB y otros formatos, incluidos textos planos, para recuperar pasajes y ayudar a fundamentar escritos mediante IA y citas corroborables. La conservación del original es opcional al importar: se puede elegir sólo texto convertido con OCR cuando haga falta, conservando su procedencia y los permisos actuales. En ese caso se identifica que el cotejo corresponde al texto guardado y que el original no está disponible. La IA utiliza el proveedor configurado y la política existente del estudio.

ALTAZOR conserva conversaciones privadas personales o por causa, adjuntos originales y resultados. Permite seleccionar pasajes y guardar adjuntos en la biblioteca mediante su importador existente. Las respuestas usan ventanas explícitas de texto extraído, sin atribuir lectura íntegra de una obra extensa. Las acciones que cambian las herramientas presentan un plan antes de ejecutarse. El historial y la memoria tienen funciones distintas: el grafo y su lista accesible separan recuerdos propuestos y confirmados, y sólo lo confirmado participa cuando el profesional decide usarlo. Los respaldos y permisos se comprueban de nuevo; la memoria personal permanece separada de cada causa.

Academia conserva trabajos de investigación, escritura, docencia y carrera académica con pregunta, destinatarios, fuentes, matriz de literatura y propuestas editables. Los resultados se descargan en Word o Markdown y pueden incorporarse, después de revisión, como un escrito privado de una causa accesible. El perfil contiene información aportada por su titular; no acredita títulos. Descubrir consulta Crossref y OpenAlex, relaciones bibliográficas y ORCID público con autorización explícita. Son metadatos, no textos completos cotejados; las alertas se actualizan manualmente y el RSS privado usa el último resultado guardado. Véanse [ALTAZOR](docs/ALTAZOR.md) y [Descubrimiento académico](docs/altazor-discovery.md).

Conexiones ofrece acceso a la configuración existente de Codex personal en Mi cuenta, al correo y a las integraciones autorizadas. Los borradores para LinkedIn permanecen privados hasta revisar la previsualización y confirmar su publicación con los permisos correspondientes. La autorización web necesita una aplicación registrada y retorno HTTPS; la autorización nativa PKCE no está implementada. No se ha conectado una cuenta real ni publicado en LinkedIn durante esta entrega. El feed, los contactos y las conversaciones sociales se realizan en LinkedIn; no se añade una red social propia.

Computadora es opcional y está desactivada por defecto. El adaptador Kitties requiere configuración desde el Host local en loopback y un gateway con datos separados por profesional y ámbito; no recibe las credenciales de las conexiones de LexOpen. El escritorio usa un contenedor, no una máquina virtual con kernel propio. Abrir Mi jornada no lo instala ni lo inicia. Las pruebas simuladas del adaptador no acreditan Docker real: se requiere comprobar el trabajo de CI específico. Su [guía de operación](src/lib/altazor/computer/README.md) fija preparación, política de IA local, caducidad y cierre.

## Brand Commitments

Nombre LexOpen, interfaz en español y continuidad con la aplicación existente: Sora, Fraunces, cobre, verde mar, papel y tinta. ALTAZOR AI añade un chungungo original como acompañante de cuatro estados, con [registro de procedencia](public/altazor/provenance.json); los textos, controles, estados y grafos permanecen accesibles. El usuario eligió una biblioteca clásica con encuadernaciones de cuero, libros en 3D y personalización por propietario, acotada a esa superficie.

## Evidence on Hand

El repositorio contiene lectores de PDF con páginas físicas y OCR, verificadores de originales y citas, investigación y pruebas con materiales ficticios. ALTAZOR incluye comprobaciones de persistencia, permisos y protocolos; las identidades y los proveedores ficticios no prueban una cuenta externa real ni el desempeño autónomo de un modelo. La guía de descubrimiento registra por separado las lecturas públicas de Crossref, OpenAlex y ORCID. No hay una colección real de libros suministrada para esta entrega; las capturas y demostraciones deben identificarse como ficticias.

La implementación de ALTAZOR corresponde al trabajo de `1.1.0-preview.3`. La disponibilidad de una release y sus instaladores se comprueba en [Releases](https://github.com/gabrielperezibacache/lexopen/releases) y [la guía de instaladores](docs/INSTALADORES.md); la implementación o una captura no acreditan publicación ni firma.

## Product Principles

- Conservar el material elegido al importar y una localización comprobable para cada cita, distinguiendo el original del texto convertido.
- Dar a cada profesional control sobre sus libros, apariencia y compartición.
- Mantener separadas una propuesta de IA, un pasaje literal y una revisión humana.
- Respetar los permisos actuales en lecturas, recuperación, borradores y exportación.
- Mantener separados el historial, la memoria confirmada y los metadatos bibliográficos.
- Mostrar el destino y el contenido elegido antes de autorizar un envío remoto, y revisar las acciones antes de ejecutarlas.
- Conservar la revisión humana antes de incorporar un trabajo a una causa o compartirlo en LinkedIn.
- Presentar la computadora opcional según su estado comprobado de configuración y ejecución.
