# Navegación y espacios de trabajo del estudio

## Modo y tarea

Operate. Profesionales y equipos jurídicos deben encontrar su siguiente tarea y continuar una causa sin recorrer listas de herramientas inconexas. La entrada cotidiana es Mi jornada; la navegación principal reúne Causas, Agenda, Biblioteca, Clientes, Comunicaciones y Estudio. El portal de clientes conserva una navegación propia.

## Dirección

Conservar Sora, Fraunces, cobre, verde mar y papel del sistema vigente. La materialidad de cuero y estantes permanece dentro de la biblioteca. Dar prioridad al documento, escrito o audiencia abierto, con un único acompañante contextual opcional. Su apertura es el único gesto de movimiento propio de esta reorganización; respetar movimiento reducido.

## Jerarquía

Siete áreas estables, secundario exclusivo del área activa y controles globales de búsqueda, avisos y cuenta. Un catálogo autorizado alimenta escritorio, móvil y navegación rápida. En la causa: Resumen, Expediente, Preparación, Audiencias y Escritos; Biblioteca y Mesa del asistente son acciones de preparación. Ajustes agrupa sus destinos en cinco categorías. El lector privilegia el original o texto conservado; el editor mantiene el guardado visible y separa añadir respaldos, referencias incorporadas e historial.

## Restricciones y prueba

Mantener rutas, enlaces guardados, controles de servidor y permisos. Los identificadores viajan en la URL; textos privados no. Cerrar un acompañante o cambiar de tamaño no desmonta formularios, notas ni el capturador. Consultar una fuente dentro de una audiencia no detiene la captura; la salida de la mesa, los cambios de permisos y ocultar la pestaña conservan sus protecciones.

Comprobar con datos ficticios: ocho perfiles, navegación equivalente, teclado/Escape/retorno de foco, anclas y atrás/adelante, guardado y recuperación, continuidad de la captura, lectura y citas. Revisar escritorio y móvil en una ronda conjunta, aplicar un lote de correcciones y confirmar. No ampliar esta etapa a una nueva marca, cambios de permisos o servicios de producción.

## Estado

Construido para `1.1.0-preview.2`, con evidencia local registrada el 4 de noviembre de 2026. Se conserva el mundo Sora/Fraunces, cobre, verde mar y papel. El cuero y los estantes 3D siguen acotados a Biblioteca.

El catálogo de navegación autorizado en servidor alimenta las siete áreas, los secundarios del área activa, escritorio, menú móvil, navegación rápida y rutas de navegación. Cliente y externo conservan el portal separado; la cabecera móvil incluye búsqueda y la cuenta inicial corresponde a la sesión. La causa coloca sus cinco destinos inmediatamente después del título, con Biblioteca y Mesa del asistente en la línea de recursos y Más acciones para las operaciones secundarias. En móvil, los destinos pasan a dos columnas.

`ContextPanel` reutiliza un único árbol montado en `Sheet`: acompañante lateral en ancho amplio y diálogo nativo en compacto, con Escape, foco visible y retorno de foco al cerrar. Lector, escritos, audiencia y Mesa muestran un trabajo principal y un acompañante opcional. El original PDF conservado ocupa el lienzo del lector; pasajes, ficha, descargas y personalización son herramientas secundarias. En escritos permanecen autosave, referencias, historial y recuperación de errores dentro del panel activo. La Mesa distingue Preparar, Ejecutar y Revisar y conserva el trabajo guardado mediante su identificador en la URL.

La audiencia mantiene cargados reloj y capturador al consultar Notas, Fuentes o Lectura. Guardar una nota, añadir una fuente, registrar un punto, cotejar y copiar, o conversar con pasajes elegidos ocurre dentro de la misma mesa. Cambio de mesa, salida, pérdida de acceso y pestaña oculta mantienen sus guardas. Configuración agrupa catorce identificadores y formularios en cinco categorías sin desmontarlos; la carga inicial de IA ya no sustituye una edición iniciada antes de terminar la consulta.

## Evidencia del resultado

- Quince PNG de aplicación real y datos ficticios en `docs/interfaz-2026-11-04/`; el manifiesto conserva dimensiones, SHA-256 y huellas de fuentes. Mesa de escritorio y móvil utiliza proveedor, eventos y resultado simulados expresamente identificados, sin atribuirles prueba de Docker.
- Revisión visual independiente apta para entrega tras corregir la jerarquía de causa móvil y la audiencia cargada junto a Notas. Recorridos capturados sin desbordamiento horizontal a 1440 y 360 píxeles.
- La validación local cubre navegación de perfiles, ajustes y conservación de campos, atrás/adelante, escritos y recuperación móvil, Mesa, lectura/citas y continuidad del capturador. El registro de capturas no sustituye resultados de pruebas ni acredita publicación o conformidad completa de accesibilidad.

Fuentes: `src/lib/navigation/catalog.ts`, `AppShell`/`AppSidebar`, `CaseWorkflowNav`/`CasePreparation`, `HearingWorkbench`/`HearingLivePanel`/`HearingLiveAudioPanel`, `BookReader`, `CaseWritingEditor`, `CaseWorkbench`, `ConfigSectionNav`/`config-sections`, `LlmSettingsForm` y `ui/ContextPanel`/`ui/Sheet`. Guía de uso: `docs/NAVEGACION-Y-ESPACIOS-DE-TRABAJO.md`. Galería y alcance: `docs/interfaz-2026-11-04/README.md`.
