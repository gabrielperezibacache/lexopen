# Editor de escritos por causa · 2 de noviembre de 2026

Esta entrega desarrolla el editor persistente del [plan maestro](PLAN-MAESTRO-LEXOPEN-2026-11-02.md). Se abre desde «Escribir con fuentes» en la preparación de la causa, desde hechos y fuentes o desde el guion de audiencia. La ruta es `/causas/[id]/escritos`; `?draft=` permite volver a un borrador concreto.

## Redactar y conservar versiones

Cada profesional conserva borradores privados vinculados a una causa autorizada. El título y el texto se guardan al dejar de escribir, con una espera de 900 ms y una sola solicitud activa. La escritura posterior a una solicitud en curso se conserva y se envía después. «Guardar ahora» permite confirmar el trabajo explícitamente.

Cada cambio confirmado conserva una instantánea completa del texto y de sus referencias. Los guardados sin cambios no añaden versiones. Una petición repetida conserva su identidad y no duplica la operación, incluso si el servidor guardó y el navegador perdió la respuesta. Si otra sesión ya modificó el escrito, el editor conserva el texto local y ofrece descargarlo o cargar la versión guardada; no sobrescribe automáticamente.

El historial presenta treinta versiones por página. La vista previa vuelve a comprobar las fuentes. Recuperar una versión crea una nueva y mantiene las intermedias; los identificadores de referencias no se reciclan. No se impone un límite artificial de versiones ni se eliminan silenciosamente versiones antiguas. El texto pendiente permanece en memoria de la pantalla, sin guardarse en almacenamiento persistente del navegador. El uso sin conexión requiere resolver el guardado pendiente antes de abandonar la sesión.

## Incorporar antecedentes con sus respaldos

- **Hechos de la causa:** la incorporación conserva la afirmación registrada, su revisión y todos los respaldos dentro del límite. Un hecho propuesto conserva el aviso de revisión pendiente. Los hechos ocultos o descartados no se incorporan.
- **Notas de audiencia:** se consultan las mesas privadas del profesional dentro de la causa. La observación y su respaldo permanecen distintos. Una nota sin cita se identifica como observación personal sin respaldo documental.
- **Biblioteca y sentencias:** se elige un volumen propio o de una colección compartida y se incorporan pasajes literales comprobados. La búsqueda es local y declara su alcance; las resoluciones mantienen el aviso sobre sus metadatos manuales.

Cada incorporación guarda el texto anterior y añade al final el material elegido con un marcador estable, como `[^R1]`. Las referencias se construyen en servidor; el guardado del texto no admite referencias inventadas por el navegador. Cambiar el texto propio no cambia el pasaje conservado como respaldo. Si el hecho o la nota se revisan después, se mantiene lo incorporado con un aviso de cambio; no se reemplaza silenciosamente la redacción.

La comprobación de fuentes distingue original conservado, texto conservado sin original, OCR, extracción parcial, revisión anterior y transcripción TXT. Corroborar una transcripción no acredita fidelidad al audio ni exactitud temporal. El cotejo no certifica el razonamiento, la autenticidad de metadatos manuales ni la vigencia jurídica.

## Acceso, recuperación y salida

La lectura, el guardado, la recuperación y la exportación consultan el propietario, el acceso actual a la causa y la integridad de las fuentes. Otro integrante o un administrador no recibe el borrador privado de otro profesional. Perder acceso a una fuente oculta el contenido derivado; el listado y el historial conservan sólo metadatos neutrales. Se puede recuperar una versión anterior limpia, si esa versión sigue autorizada, sin exponer la versión bloqueada.

Las salidas Markdown y TXT incluyen identidad/RIT de la causa, revisión, fecha de generación, referencias, pasajes, localizadores, huellas y advertencias. Las notas de pie corroboradas proceden del servidor. Los marcadores de referencia desconocidos impiden exportar hasta corregirse. Los enlaces requieren acceso a LexOpen. La salida sigue siendo un borrador de trabajo, no una presentación judicial.

La migración `20261102150000_case_writing_editor` añade borradores, instantáneas y recibos de peticiones; no transforma registros anteriores. Los borradores impiden eliminar la causa o su propietario por accidente; la causa puede archivarse. La eliminación explícita de datos demo incluye los nuevos borradores y sus relaciones.

## Alcance operativo

Se admiten 100.000 caracteres por escrito, veinte incorporaciones, cien pasajes de respaldo y doscientos escritos por profesional y causa. Un hecho con más de veinte respaldos no se incorpora parcialmente. El catálogo consulta ventanas de cincuenta registros y presenta veinte resultados, con continuación; el selector muestra hasta cien libros autorizados. La búsqueda de pasajes en un volumen revisa hasta tres mil fragmentos y declara sus límites. No equivale a buscar en todo el expediente o toda la biblioteca a la vez.

Esta entrega no migra automáticamente los borradores de biblioteca, las minutas o las conversaciones previas. No incorpora todavía edición enriquecida de Word, DOCX, comparación por bloques o una propuesta nueva de IA. El editor utiliza PostgreSQL, almacenamiento y verificadores de LexOpen; permite redactar, guardar e incorporar fuentes sin un proveedor de IA.

## Diseño y verificación

Se conserva la dirección editorial de LexOpen: hoja continua en serif, controles en Sora, papel y tinta, cobre y verde mar. El cuaderno reúne fuentes, referencias e historial. En móvil, las vistas Escribir, Fuentes, Referencias e Historial se eligen antes de la hoja, sin desmontar sus campos ni su cola de guardado. Guardar y descargar están antes del texto largo. El movimiento de apertura dura 180 ms y respeta movimiento reducido.

La revisión independiente pidió dos correcciones y su veredicto final fue **ship**, sin hallazgos materiales abiertos en el alcance revisado:

| Hallazgo | Resultado | Evidencia visible |
| --- | --- | --- |
| Acceso móvil a fuentes e historial | Resuelto | Navegación compacta antes del editor; las herramientas abren debajo, con estado de guardado visible. |
| Descubrimiento y vista previa del historial | Resuelto | Acción «Ver versión», selección «Versión abierta» y vista previa con recuperación antes de la lista. |

Las capturas usan datos ficticios: [escritorio](escritos-2026-11-02/writing-desktop.png), [móvil con historial](escritos-2026-11-02/writing-mobile.png), [móvil al escribir](escritos-2026-11-02/writing-mobile-editor.png), [móvil con fuentes](escritos-2026-11-02/writing-mobile-sources.png), [referencias](escritos-2026-11-02/writing-references-desktop.png) y [modo oscuro](escritos-2026-11-02/writing-dark.png). Los registros y sus huellas están en [verification.json](escritos-2026-11-02/verification.json). La revisión no equivale a una certificación de toda la aplicación.

Las pruebas cubren guardados concurrentes, respuestas perdidas, historial, recuperación, fuentes alteradas o retiradas, libros compartidos, texto retenido, privacidad y rollback de auditoría. La compilación y las pruebas locales no sustituyen un despliegue en el Host del estudio; ese despliegue no forma parte de esta entrega.

Resultados locales: suite unitaria aprobada; componentes existentes de integración aprobados y suite final del dominio de escritos aprobada; esquema sin divergencias; ESLint, TypeScript y compilación de producción aprobados. La compilación conserva cuatro advertencias previas de trazado de acceso dinámico a archivos. Chromium recorrió 47 escenarios: 46 pasaron en la ejecución completa y el restante pasó tras corregir un selector de la nueva prueba. Se confirmó además la recuperación limpia desde la interfaz con el acceso a la fuente retirado. La ejecución de GitHub comprueba el conjunto sobre el commit propuesto.

Los ensayos iniciales también detectaron un nombre de archivo reservado por Next.js para el ayudante de errores y un escape excesivo de puntuación en el RIT de Markdown. Ambos quedaron corregidos. Las pruebas de permisos, concurrencia y corroboración se conservaron completas. El hook de diseño quedó sin hallazgos nuevos en el editor; los tamaños menores señalados en el CSS preexistente de audiencias corresponden a metadatos y controles fuera del nuevo editor y se mantuvieron, sin supresiones añadidas. El registro auxiliar de diseño se sincronizó con sus fuentes actuales.
