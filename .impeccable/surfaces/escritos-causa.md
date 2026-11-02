# Escritos de la causa

## Mode

Operate: redactar un borrador privado con sus antecedentes disponibles y conservar versiones revisables.

## Brief

Ampliación funcional de la identidad editorial existente de LexOpen. La hoja de escritura mantiene el contexto de la causa y un cuaderno de hechos, notas de audiencia y pasajes de biblioteca. El resultado es un borrador con referencias que permiten volver al origen; su texto y sus conclusiones requieren revisión profesional.

## Hierarchy

Volver a la carpeta y contexto de la causa; selección de escrito o creación por nombre; hoja con versión, estado de guardado y acciones de guardar o descargar antes del título y el cuerpo; cuaderno de fuentes, referencias e historial. El vacío explica cómo crear el primer borrador y conserva los controles de creación.

## Constraints

Conservar AppShell, AppSidebar, Fraunces, Sora, cobre, verde mar y papel. Los borradores se presentan como privados dentro de la causa. La superficie distingue cambios locales de guardados confirmados y no presenta referencias como certificación jurídica. Si falla el acceso a la causa o un respaldo, el contenido se oculta en el estado Escrito protegido; sólo se previsualizan o recuperan versiones cuyos respaldos superan la comprobación de acceso.

## Construido

- Hoja continua con título Fraunces, cuerpo editable Fraunces a 1,1 rem e interlineado 1,9; controles y avisos Sora. Fondo de superficie sólida, borde tenue y radio grande del sistema. Los campos conservan etiquetas visibles, ajuste de palabras y foco verde mar.
- Guardado automático tras 900 ms sin editar, con guardado manual y estados de pendiente, guardando, guardado, desconexión, error y conflicto. El conflicto ofrece conservar una copia local identificada sin nueva corroboración de respaldos o descartar cambios locales y cargar el guardado actual.
- Cuaderno con Hechos, Notas de audiencia y Biblioteca; búsqueda, procedencia, avisos y acción explícita de incorporar. La incorporación espera el guardado actual, añade la fuente al final y conserva sus marcadores de referencia. Las referencias permiten abrir el origen y consultar la base de cotejo: original o texto conservado.
- Historial con fecha, tipo de cambio y acción Ver versión. La selección usa fondo verde mar suave, `aria-pressed` y Versión abierta. La vista previa del texto, los avisos y el recuento de referencias precede a la lista, se desplaza a la vista sin animación y permite Recuperar como nueva versión cuando está autorizado; conserva el historial anterior.
- Guardar ahora y las descargas Markdown y TXT están sobre título y cuerpo. La descarga espera el guardado y vuelve a comprobar los respaldos. El estado de la hoja diferencia un borrador privado de una presentación o conclusión jurídica aprobada.
- Escritorio: hoja flexible y cuaderno lateral de 19 a 23 rem. A 1120 píxeles o menos: barra superior adherida con Escribir, Fuentes, Referencias e Historial y estado de guardado persistente; sólo se muestra el panel elegido. A 700 píxeles: selección y creación se apilan, las pestañas se ordenan en dos columnas y la hoja reduce su relleno. Acciones y campos principales mantienen 44 píxeles de altura mínima.
- Las pestañas principales admiten flechas, Inicio y Fin. La apertura del panel de cuaderno usa 180 ms con `cubic-bezier(.16, 1, .3, 1)` y recorte de hoja; `prefers-reduced-motion` elimina la animación.

## Fuentes

`src/components/writings/CaseWritingEditor.tsx`, `src/components/writings/CaseWritingEditor.css` y `src/app/(app)/causas/[id]/escritos/page.tsx`; tokens y controles compartidos de `src/app/globals.css`. Este brief documenta la implementación y no acredita publicación ni una revisión visual final.
