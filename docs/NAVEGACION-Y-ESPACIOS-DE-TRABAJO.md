# Navegación y espacios de trabajo

Esta guía describe la reorganización construida para `1.1.0-preview.2`. Las [descargas publicadas](https://github.com/gabrielperezibacache/lexopen/releases) y la [galería de demostración](interfaz-2026-11-04/README.md) tienen alcances distintos: las capturas muestran la aplicación real con datos ficticios.

## Encontrar el trabajo

**Mi jornada** reúne la entrada cotidiana. La barra principal mantiene siete áreas; debajo aparecen sólo los destinos del área activa. En escritorio puede contraer la barra; en móvil, ábrala desde el botón de menú.

| Área | Para qué abrirla |
| --- | --- |
| **Mi jornada** | Revisar el trabajo cotidiano y continuar con sus pendientes. |
| **Causas** | Entrar a expedientes, seguimiento judicial, documentos y minutas. |
| **Agenda** | Consultar calendario, panel de audiencias, plazos y pendientes. |
| **Biblioteca** | Abrir sus libros y documentos, o consultar las fuentes oficiales admitidas. |
| **Clientes** | Consultar fichas de clientes y acceder al portal. |
| **Comunicaciones** | Trabajar con correo y mensajes disponibles. |
| **Estudio** | Consultar la actividad del estudio, honorarios, equipo, espacios, flujos y administración. |

La búsqueda tiene acceso en la cabecera también en móvil. **Ir a un apartado** permite encontrar destinos rápidamente; la ruta de navegación indica dónde está. Menú, navegación rápida y ruta usan el mismo catálogo autorizado. Los destinos de administración y el asistente dependen del acceso de cada usuario; las páginas y sus operaciones mantienen la comprobación de permisos.

La cuenta de la barra corresponde al usuario de la sesión. Los perfiles de cliente y externo reciben su navegación de portal, separada de las herramientas internas.

## Continuar una causa

El recorrido aparece inmediatamente después del título y conserva cinco destinos:

1. **Resumen** vuelve a la ficha de la causa.
2. **Expediente** lleva a sus documentos y antecedentes.
3. **Preparación** reúne el material y los pasos para trabajar la causa.
4. **Audiencias** abre la mesa elegida o el listado de mesas de la causa.
5. **Escritos** abre los borradores privados y su respaldo.

**Biblioteca** y **Mesa del asistente** quedan como recursos de preparación junto a ese recorrido. Las acciones secundarias de la ficha se reúnen en **Más acciones**. En móvil, los cinco destinos se distribuyen en dos columnas antes de las acciones y el contenido de la causa.

Los enlaces conservan el contexto identificable del escrito o de la mesa cuando corresponde. Los títulos, las notas y el texto de trabajo no se incorporan a esos parámetros de navegación.

## Trabajar con un panel de apoyo

Lectura, escritos, audiencia y Mesa del asistente dan prioridad al documento o trabajo abierto. Sus herramientas comparten un único panel contextual: al cambiar de herramienta, se utiliza ese mismo espacio.

En pantallas amplias el panel acompaña al contenido. En pantallas compactas se abre como un diálogo con título y botón de cierre; puede cerrarlo con **Escape** y el foco vuelve al control que lo abrió. Cerrar el panel o cambiar el ancho conserva montados sus formularios y herramientas; cerrar un panel no equivale a guardar sus cambios.

### Leer y citar

Abra el libro o documento desde la biblioteca. Si conserva un PDF con páginas físicas disponibles, el original ocupa el espacio principal y el selector cambia de página. **Pasajes y citas** abre el texto preparado para contrastarlo; **Ficha y descargas** reúne procedencia y archivos disponibles. El propietario también puede abrir **Personalizar este libro**.

Cuando sólo se conserva texto, el lector lo identifica y utiliza sus localizadores reales. El OCR y las extracciones parciales conservan sus avisos. La forma de los libros y los estantes sigue perteneciendo a la biblioteca; el área de lectura mantiene papel y texto legible. [Guía de biblioteca](BIBLIOTECA-PERSONAL-2026-11-01.md).

### Escribir con fuentes

Abra **Escritos**, elija un borrador o cree uno. La hoja mantiene visible el estado del guardado automático y **Guardar ahora**. Use **Incorporar fuentes** para elegir hechos, notas de audiencia o pasajes de biblioteca; **Referencias** permite revisar los respaldos ya incorporados.

**Otras herramientas** reúne historial y exportación. El panel muestra el estado de guardado y las acciones de recuperación cuando una operación falla, también en móvil. Incorporar una fuente o descargar espera el guardado pendiente; las referencias y el acceso se comprueban de nuevo. El historial permite comparar una versión antes de recuperarla como un nuevo guardado.

### Acompañar una audiencia

Abra una mesa desde la causa o desde **Agenda → Panel de audiencias**. **En vivo** conserva reloj, registro y captura; **Fuentes**, **Lectura** y **Notas** abren el acompañante. **Preparar y analizar** reúne agenda, guion y conversación.

Puede guardar una nota, añadir una fuente, registrar un punto y cotejar o copiar un pasaje dentro de la misma mesa. La conversación utiliza los pasajes elegidos y distingue la selección de citas de una propuesta de IA. Consultar estas herramientas conserva el reloj y el capturador montados. El estado y el control para detener una captura en curso siguen disponibles al abrir el acompañante.

Abrir la mesa no inicia el reloj ni el micrófono. Cambiar de mesa, salir, perder acceso u ocultar la pestaña conserva las protecciones de la captura y de las ediciones pendientes. [Audiencias](ENTREGA-AUDIENCIAS-EN-VIVO-2026-11-02.md) · [Captura y transcripción](ENTREGA-TRANSCRIPCION-EN-VIVO-2026-11-02.md).

### Preparar un trabajo con el asistente

La **Mesa del asistente** separa tres momentos:

1. **Preparar:** escriba un objetivo, elija pasajes y revise el destino. El cuaderno de fuentes no llama a un modelo; una propuesta con IA usa el proveedor y la política configurados.
2. **Ejecutar:** compruebe el trabajo guardado e inicie su ejecución cuando esté preparado. El estado permite consultar la actividad y cancelar cuando corresponde.
3. **Revisar:** coteje el resultado y sus fuentes antes de descargar los archivos disponibles o usar **Revisado: incorporar al escrito**.

**Fuentes de trabajo** y **Trabajos guardados** abren el panel de apoyo. El enlace conserva el identificador `trabajo`, de modo que un trabajo guardado se puede volver a abrir. La ejecución requiere preparar el ejecutor local según la [guía de la Mesa](WORKBENCH.md). Las capturas de esta reorganización simulan proveedor, eventos y resultado; no demuestran una ejecución de Docker.

## Configurar sin perder el lugar

En **Estudio → Configuración**, cinco categorías agrupan las secciones existentes:

| Categoría | Secciones |
| --- | --- |
| **Estudio y equipo** | Estudio, Usuarios. |
| **Conexiones e IA** | IA, Google, PJUD, APIs. |
| **Audios y documentos** | Audios, Obsidian. |
| **Seguridad y avisos** | Notificaciones, Log PJUD. |
| **Aplicación y datos** | Idioma, Entorno, Host, Demo. |

En móvil, el selector **Categoría de configuración** deja visibles los enlaces de la categoría elegida. Los catorce enlaces de sección y sus formularios conservan sus identificadores: los enlaces guardados, los campos editados y el recorrido atrás/adelante siguen siendo útiles. La navegación agrupa los formularios; no los desmonta al cambiar de categoría.

## Alcance de esta entrega

La reorganización conserva rutas, datos, referencias y controles de acceso existentes. La [galería](interfaz-2026-11-04/README.md) contiene quince capturas de escritorio y móvil, con dimensiones, huellas de archivos y fuentes registradas en su manifiesto. Esta documentación describe la interfaz construida y la evidencia local; no acredita publicación de `1.1.0-preview.2`, precisión de un micrófono físico ni conformidad completa de accesibilidad.
