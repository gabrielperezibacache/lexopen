# LexOpen

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Abogados independientes, profesionales jurídicos y estudios que trabajan con expedientes, documentos, plazos y escritos; investigadores y docentes que desarrollan trabajos académicos privados con esas fuentes. El portal del cliente es una superficie separada de las herramientas internas.

## Product Purpose

Reunir el trabajo jurídico y académico en un espacio claro, con ALTAZOR como asistente personal y continuidad entre conversación, fuentes y herramientas. Una afirmación incorporada al trabajo debe poder volver a su fuente conservada y autorizada; las propuestas de IA mantienen revisión humana.

## Operating Context

Aplicación Next.js con PostgreSQL y almacenamiento de originales en un Host del estudio. Se utiliza desde navegador o Desktop en modo Host/Cliente. El catálogo distingue Mi jornada, Causas, Agenda, Biblioteca, Académico, Clientes, Comunicaciones y Estudio según los permisos del profesional. ALTAZOR abre en Inicio y comparte conversación y borrador con el acompañante disponible en otras rutas. Académico tiene su propia entrada; las herramientas personales se reúnen en «Mi asistente».

La IA utiliza el destino configurado y la política del estudio. El envío de un mensaje y su selección a una IA conectada requiere autorización visible. Los permisos se vuelven a resolver al leer, modificar, recuperar fuentes y exportar; una ruta o un acceso de navegación no concede permisos por sí mismo.

## Capabilities and Constraints

**Trabajo jurídico.** Causas reúne expediente, preparación, audiencias y escritos, junto a documentos, hechos, fuentes, tareas y plazos. La preparación ofrece un índice del trabajo conservado. La hoja privada de escrito conserva guardado, referencias e historial y permite descargar el texto. Audiencias dispone de notas, grabación, transcripción y guion de preparación según la configuración disponible. Una propuesta, una descarga o un estado de guardado no acreditan presentación judicial ni veracidad jurídica.

**Biblioteca personal.** Cada profesional conserva sus libros y puede compartir colecciones bajo permisos. Admite PDF, EPUB y otros documentos, incluidos textos planos, con recuperación de pasajes y referencias. La conservación del original es una elección de importación: si se guarda sólo el texto convertido, con OCR cuando hace falta, la ficha y las citas declaran esa base y la ausencia de original. Las páginas físicas corresponden al PDF original disponible; otros formatos mantienen sus localizadores. Las seis distribuciones, materiales y colores personalizan la misma colección privada.

**ALTAZOR.** Conserva conversaciones personales o por causa, adjuntos originales y resultados. Inicio y el acompañante usan un estado por usuario que permanece al cambiar de ruta; cerrar el panel no crea otra conversación. Los adjuntos se pueden seleccionar y guardar en la biblioteca mediante su importador. Las respuestas utilizan ventanas explícitas de texto extraído y fuentes seleccionadas, sin atribuir lectura íntegra de una obra extensa. Las acciones que cambian herramientas presentan un plan y requieren confirmación. Las solicitudes enviadas pueden continuar mientras LexOpen está disponible según la preferencia del profesional; esto no acredita un agente autónomo permanente.

El historial y la memoria cumplen funciones distintas. Grafo y lista accesible separan recuerdos propuestos y confirmados. Sólo lo confirmado participa cuando el profesional decide usarlo; sus respaldos y permisos se comprueban de nuevo. La memoria personal permanece separada de cada causa. Las conversaciones anteriores de Copiloto conservan su archivo propio.

**Académico.** Investigar, Escribir y Enseñar ofrecen entradas a trabajos privados con objetivo, fuentes, preparación y propuestas editables. Se conservan pregunta, destinatarios, matriz de literatura, docencia y perfil. Los resultados se descargan en Word o Markdown y, después de revisión, pueden incorporarse como un escrito privado a una causa accesible. El perfil contiene información aportada por su titular; no acredita títulos. Buscar bibliografía consulta Crossref, OpenAlex, relaciones bibliográficas y ORCID público con autorización explícita. Devuelve metadatos, no textos completos cotejados; las alertas se actualizan manualmente y el RSS privado utiliza el último resultado guardado. Véanse [ALTAZOR](docs/ALTAZOR.md) y [Descubrimiento académico](docs/altazor-discovery.md).

**Sincronización judicial y documentos.** Una entrada reúne ClaveÚnica y Mis Causas, consulta por RIT/ROL y acceso a carpetas por causa. El profesional ingresa personalmente en la página oficial y revisa las causas antes de importar o sincronizar. La revisión automática depende del Host disponible, la sesión y los permisos; cuando la OJV termina la sesión, los documentos pendientes permanecen hasta el siguiente ingreso. El sistema distingue seguimiento, descarga, pendientes y errores en lugar de presentar toda causa como completa.

«Mi Google Drive» conecta una cuenta personal con permiso de lectura y renovación; después el profesional elige carpetas. La conexión no concede modificación ni borrado de archivos de Drive. La cuenta personal y la cuenta de Google del estudio tienen recorridos y administración separados. Las copias elegidas se conservan en LexOpen; sólo se envían a la IA al seleccionarlas y autorizar su envío. Desconectar pausa las carpetas personales y conserva lo ya importado. La aplicación OAuth debe estar preparada por el operador antes de que cada persona autorice su cuenta; la presencia del botón no acredita una conexión real. Los límites de lectura, importación, actualización y administración se conservan en las guías de integración.

**Conexiones y secretos.** «Mi asistente» reúne Aplicaciones, Secretos y Compartir en LinkedIn. El catálogo de 48 adaptadores permite explorar categorías y configurar cuentas en un gateway dedicado; cada escritorio recibe sólo las aplicaciones elegidas y las operaciones requieren aprobación. Secretos conserva valores cifrados que no vuelven a mostrarse y permite escribirlos una vez bajo control manual, con destino declarado y confirmación; no comprueba el DOM remoto ni envía el formulario. Codex personal, correo e integraciones del estudio conservan su administración existente.

Los borradores de LinkedIn permanecen privados hasta revisar la previsualización y confirmar su publicación con permisos. Su autorización web requiere una aplicación registrada y retorno HTTPS; la autorización nativa PKCE no está implementada para ese conector. Feed, contactos y conversaciones se realizan en LinkedIn. No se añade una red social propia.

**Computadora opcional.** Está desactivada por defecto. El adaptador Kitties requiere preparación desde el Host local en loopback y un gateway con datos separados por profesional y ámbito; no recibe automáticamente las credenciales de las conexiones de LexOpen. El escritorio utiliza un contenedor. Abrir Inicio no lo instala ni lo inicia. Las pruebas simuladas del adaptador no acreditan Docker real: su ejecución requiere evidencia propia. La [guía de operación](src/lib/altazor/computer/README.md) fija preparación, política de IA local, caducidad y cierre.

## Brand Commitments

Nombre LexOpen, interfaz en español y continuidad con cobre, verde mar, papel y tinta. MIDNIGHT es la dirección visual preferida: Barlow Condensed identifica apartados, Sora sostiene controles y Fraunces conserva libros, lectura y escritura prolongada. La referencia editorial HERMES informa la composición sin distribuir sus ilustraciones, marca o fuentes comerciales.

ALTAZOR mantiene al chungungo original como acompañante de cuatro estados en un grabado propio, con [registro de procedencia](public/altazor/engraving-provenance.json). Nombres, controles y estados permanecen accesibles como texto. La biblioteca clásica conserva encuadernaciones de cuero, libros en 3D y personalización por propietario, acotados a esa superficie. Una tarea clara y opciones progresivas simplifican el trabajo sin ocultar permisos, alcance o confirmaciones.

## Evidence on Hand

El repositorio contiene lectores de PDF con páginas físicas y OCR, verificadores de originales y citas, investigación, persistencia y límites de permisos con pruebas y materiales ficticios. La guía de descubrimiento registra por separado las consultas públicas de Crossref, OpenAlex y ORCID. Las identidades y proveedores simulados no prueban una cuenta externa real ni el desempeño autónomo de un modelo.

El código corresponde al trabajo de `1.1.0-preview.5`. Las capturas de `docs/midnight-2026-11-05/` documentan Inicio, Académico, Sincronización, consentimiento de Google y acompañante en escritorio, móvil y tablet; emplean datos y preparación OAuth ficticios. No se han validado cuentas reales de Google u OJV en esta entrega. Tampoco acreditan LinkedIn publicado, Docker operativo, instaladores firmados o una release publicada. No se ha suministrado una colección real de libros para la demostración.

La disponibilidad de una release y sus instaladores se verifica separadamente en [Releases](https://github.com/gabrielperezibacache/lexopen/releases) y [la guía de instaladores](docs/INSTALADORES.md). Una implementación, una prueba local o una captura no acreditan publicación.

## Product Principles

- Mantener una tarea principal y una continuidad personal de ALTAZOR entre conversación y herramientas.
- Dar a Académico un espacio propio y a Sincronización un recorrido reconocible.
- Conservar el material elegido al importar y una localización comprobable para cada cita.
- Dar a cada profesional control sobre libros, apariencia, compartición y conexiones personales.
- Mantener separadas una propuesta de IA, un pasaje literal, metadatos bibliográficos y revisión humana.
- Respetar los permisos actuales en lecturas, recuperación, borradores y exportación.
- Mostrar destino y contenido elegido antes del envío remoto y revisar las acciones antes de ejecutarlas.
- Conservar revisión humana antes de incorporar un trabajo a una causa o compartirlo en LinkedIn.
- Distinguir configuración, conexión, sincronización parcial y ejecución comprobada mediante estados legibles.
- Presentar Computadora y sus resultados según la evidencia de configuración y ejecución disponible.
