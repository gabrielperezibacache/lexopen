---
name: LexOpen
description: "Continuidad de cobre y verde mar; biblioteca jurídica personal de encuadernaciones clásicas."
colors:
  copper: "#c47a3a"
  copper-deep: "#9a5a28"
  copper-soft: "rgba(196, 122, 58, 0.14)"
  sea: "#1f6f78"
  sea-solid: "#1f6f78"
  sea-bright: "#2a8f99"
  sea-soft: "rgba(31, 111, 120, 0.12)"
  ink: "#0c1c24"
  ink-soft: "#1a3340"
  mist: "#e7eef1"
  paper: "#f3f6f4"
  sand: "#d6c4a8"
  surface-solid: "#ffffff"
  line: "rgba(12, 28, 36, 0.12)"
  line-strong: "rgba(12, 28, 36, 0.22)"
  danger: "#b42318"
  ok: "#1f7a4c"
  warn: "#8d5414"
  muted: "#52656d"
  dark-muted: "#a2b7bf"
  dark-sea: "#77c8cd"
  dark-sea-bright: "#8edce0"
  dark-copper-deep: "#d59a67"
  dark-ink: "#e8f0f2"
  dark-ink-soft: "#c5d4da"
  dark-paper: "#0e1a20"
  dark-mist: "#1a2c34"
  dark-surface-solid: "#14242c"
  dark-line: "rgba(232, 240, 242, 0.12)"
  dark-line-strong: "rgba(232, 240, 242, 0.22)"
  binding-oxblood: "#64292e"
  binding-forest: "#244d3c"
  binding-navy: "#263d55"
  binding-cognac: "#805034"
  binding-ivory: "#e2d1ad"
  binding-charcoal: "#343a3c"
  binding-ink: "#f0d59a"
  binding-ink-ivory: "#4e3924"
  wood-walnut: "#4e3022"
  wood-oak: "#9c7348"
  wood-night: "#202c2e"
typography:
  display:
    fontFamily: "var(--font-fraunces), Georgia, serif"
    fontSize: "clamp(2rem, 3vw, 3.35rem)"
    lineHeight: 1.08
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "var(--font-fraunces), Georgia, serif"
    fontSize: "clamp(1.6rem, 2.4vw, 2.3rem)"
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "var(--font-fraunces), Georgia, serif"
    fontSize: "1.25rem"
    fontWeight: 500
  body:
    fontFamily: 'var(--font-sora), "Segoe UI", sans-serif'
    fontSize: "16px"
  label:
    fontFamily: 'var(--font-sora), "Segoe UI", sans-serif'
    fontSize: "0.82rem"
    fontWeight: 600
  chrome-micro:
    fontFamily: 'var(--font-sora), "Segoe UI", sans-serif'
    fontSize: "10px"
  chrome-label:
    fontFamily: 'var(--font-sora), "Segoe UI", sans-serif'
    fontSize: "11px"
  reading:
    fontFamily: "var(--font-fraunces), Georgia, serif"
    fontSize: "1.07rem"
    lineHeight: 1.9
rounded:
  sm: "0.5rem"
  md: "0.85rem"
  lg: "1rem"
  xl: "1rem"
  indicator: "2px"
  pill: "999px"
  library-paper: "12px"
  library-control: "10px"
spacing:
  space-1: "0.25rem"
  space-2: "0.5rem"
  space-3: "0.75rem"
  space-4: "1rem"
  space-5: "1.25rem"
  space-6: "1.5rem"
  space-8: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.copper-deep}"
    textColor: "white"
    rounded: "{rounded.md}"
    padding: "0.65rem 1.1rem"
  button-secondary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
    padding: "0.65rem 1.1rem"
  button-secondary-dark:
    backgroundColor: "{colors.sea}"
    textColor: "white"
    rounded: "{rounded.md}"
    padding: "0.65rem 1.1rem"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.65rem 1.1rem"
  input:
    backgroundColor: "{colors.surface-solid}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0.75rem 0.9rem"
  navigation:
    textColor: "rgba(243, 246, 244, 0.82)"
    rounded: "{rounded.md}"
    padding: "0.65rem 0.85rem"
  chip-sea:
    backgroundColor: "{colors.sea-soft}"
    textColor: "{colors.sea}"
    rounded: "{rounded.pill}"
    padding: "0.2rem 0.55rem"
  library-paper:
    backgroundColor: "{colors.surface-solid}"
    textColor: "{colors.ink}"
    rounded: "{rounded.library-paper}"
    padding: "clamp(1.2rem, 3vw, 2.5rem)"
  library-layout-choice:
    rounded: "{rounded.library-control}"
    padding: "1rem"
  library-conversion-notice:
    backgroundColor: "{colors.sea-soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "1rem 1.1rem"
---

# Design System: LexOpen

## Overview

**Creative North Star: "Continuidad LexOpen; biblioteca clásica personal"**

LexOpen conserva su identidad de cobre, verde mar, papel claro y tinta oscura, con Sora para la interfaz y Fraunces para los títulos. La autoridad del sistema sigue en `src/app/globals.css`, `AppShell` y `AppSidebar`; esta ampliación no reemplaza el cromo ni la identidad de otras pantallas.

La biblioteca añade la dirección aprobada de encuadernaciones clásicas de cuero en tres dimensiones. El grano y la madera pertenecen a los libros y estantes; la lectura, la escritura y los formularios mantienen superficies de papel y texto HTML. Las seis distribuciones son variantes de interfaz sobre la misma colección privada, no seis colecciones de muestra. La composición específica y su evidencia se conservan en `.impeccable/surfaces/biblioteca.md`.

**Key Characteristics:**

- Continuidad con Sora, Fraunces, cobre y verde mar.
- Materialidad acotada a volúmenes y estantes; controles y pasajes legibles.
- Nombre personal, propiedad y compartición explícitos junto al contenido.
- Localizadores y estados que distinguen original conservado de texto conservado.
- Reorganización adaptable, foco visible y movimiento reducido.

## Colors

El cobre organiza las acciones; el verde mar orienta la navegación, el foco y las fuentes; la paleta material queda dentro de la biblioteca. El frontmatter contiene los valores normativos extraídos del código.

### Primary

- **Cobre** (`copper`) aporta identidad y pequeños acentos. **Cobre profundo** (`copper-deep`) sostiene los botones principales y la pestaña activa de la biblioteca; **cobre suave** (`copper-soft`) acompaña contadores y etiquetas.

### Secondary

- **Verde mar** (`sea`) identifica enlaces de fuente, opciones seleccionadas y controles de lectura. **Mar luminoso** (`sea-bright`) participa en el foco global y las etiquetas de modo oscuro; **mar suave** (`sea-soft`) da fondo a selección, avisos y fragmentos enlazados.
- **Error, correcto y aviso** (`danger`, `ok`, `warn`) conservan los roles semánticos existentes. No convertir la apariencia de una encuadernación en un estado de verificación.

### Tertiary

- **Burdeos, verde bosque, azul noche, coñac, marfil y grafito** (`binding-*`) son las seis opciones de cubierta del propietario. La tinta dorada de encuadernación cambia a tinta marrón en marfil.
- **Nogal clásico, roble claro y madera oscura** (`wood-*`) son tres tratamientos de color del estante. Los tres reutilizan la textura de nogal producida; no hay una imagen de roble independiente.

### Neutral

- **Tinta y tinta suave** separan texto principal de información auxiliar. **Papel, niebla y superficie sólida** separan fondo, apoyo y área de trabajo. **Arena** pertenece a la paleta existente.
- **Línea y línea fuerte** son divisores de baja opacidad, no contornos ornamentales del contenido.
- Los tokens `dark-*` documentan las sustituciones de tinta, papel, niebla, superficie y líneas de `html.dark`. En ejecución los componentes siguen usando los nombres semánticos sin prefijo; los restantes estados oscuros permanecen definidos en `globals.css`.

**The Material Scope Rule.** Las preferencias de madera y encuadernación modifican la biblioteca y sus libros; no cambian los colores semánticos de LexOpen.

## Typography

**Display Font:** Fraunces, con Georgia y serif de respaldo.

**Body Font:** Sora, con Segoe UI y sans-serif de respaldo.

La serif distingue títulos, cubiertas y lectura prolongada; Sora mantiene precisas las acciones, etiquetas, permisos y datos auxiliares. Ambas familias ya se cargan en el layout raíz; esta entrega no incorpora otra fuente.

### Hierarchy

- **Display** es el título de biblioteca o lector. Su tamaño, interlineado y ajuste se registran en `typography.display`; en móvil baja a dos rem.
- **Headline** encabeza importación, personalización, pasajes y mesa de escritura.
- **Title** identifica un estante, con peso moderado; no compite con la cabecera.
- **Body** refleja la escala fluida del elemento raíz; las medidas rem del resto de la interfaz se apoyan en ella.
- **Label** diferencia etiquetas de campos con peso seminegrita. La información auxiliar mantiene contraste mediante tinta suave.
- **Chrome micro / label** documentan los pasos pequeños ya existentes del marco de aplicación: grupos, contadores y leyenda de marca. No definen el tamaño del texto funcional de lectura de libros.
- **Reading** corresponde a las citas: conserva saltos, interlineado amplio y una medida máxima de lectura de 72 caracteres. El editor usa la misma familia y ritmo, con un tamaño ligeramente mayor.

**The Complete Title Rule.** La cubierta puede abreviar un título largo para respetar palabras y proporción; el título completo permanece en la ficha, el pie de catálogo y el nombre accesible del enlace.

## Layout

El marco de aplicación conserva una barra lateral de escritorio expandida (240 píxeles) o contraída (72 píxeles), cabecera adherida y contenido flexible con ancho mínimo cero. Por debajo de 768 píxeles la navegación pasa a un panel móvil. La escala de espacios del frontmatter procede de los tokens raíz; la biblioteca utiliza además separaciones locales según densidad.

La biblioteca coloca nombre personal y acciones antes de sus apartados; búsqueda y filtros preceden a los estantes. Los paneles de importación y personalización se abren dentro del flujo. No sustituyen la colección con un panel superpuesto. La mesa de escritura separa selección de fuentes y papel de trabajo; el lector separa ficha, pasajes y, cuando corresponde, imagen de página física.

| Variante de biblioteca | Composición construida |
| --- | --- |
| La mesa de estudio (`mesa`) | Ex libris y propiedad a la izquierda; estantes a la derecha. |
| La gran biblioteca (`estantes`) | Estantes a todo el ancho; el ex libris lateral desaparece. |
| El gabinete (`gabinete`) | Rail de propiedad estrecho y volúmenes de lomo con mayor densidad. |
| La galería (`galeria`) | Cubiertas grandes sobre el fondo de papel, sin panel de madera ni canto de estante. |
| El archivo (`archivo`) | Fondo de madera profunda y filas densas de lomos; en vista de cubiertas, uno de cada cinco volúmenes ocupa dos columnas y muestra su frente. |
| El salón de lectura (`salon`) | Franja de ex libris y dos grupos de estantes sobre papel; conserva cantos de madera y pasa a una columna al reducir el ancho. |

Los cambios específicos de biblioteca se producen a 1120, 800 y 480 píxeles. A 800 píxeles se apilan composición, mesa y colecciones, y el selector muestra dos opciones por fila. A 480 píxeles la vista habitual de cubiertas tiene dos columnas; gabinete y vista de lomos tienen tres; galería muestra una cubierta grande por fila; archivo conserva su retícula compacta. La ficha del lector pasa a una columna y la barra de página se apila. Las variantes conservan búsqueda, selección, títulos completos y permisos.

## Elevation & Depth

El sistema combina capas de papel con sombras ambientales suaves. La biblioteca reserva una profundidad estructural más marcada a madera, cantos y encuadernaciones; no convierte cada control en un objeto tridimensional. Las sombras, transiciones y puntos de adaptación exactos están en `.impeccable/design.json` porque no pertenecen al esquema de tokens del frontmatter.

El volumen se construye con planos CSS de cubierta, lomo y canto de páginas. La escena usa perspectiva (900 píxeles), una inclinación inicial pequeña y una cubierta desplazada en profundidad. El grano de cuero se mezcla con `soft-light` sobre el color elegido; la geometría, ornamentos, sombras y texto siguen siendo CSS y HTML. La textura de nogal se repite sobre paneles y cantos de madera. No se envían capturas de los mocks como interfaz.

**The Responsive Depth Rule.** Al pasar el puntero o enfocar el enlace, el libro se eleva y gira una sola vez mediante una transición corta; con movimiento reducido se conserva la pose estática y se elimina la transición. La legibilidad y la apertura del libro no dependen del giro.

## Shapes

Los botones generales son cápsulas; campos y navegación emplean el radio medio existente. Las superficies de lectura y edición usan esquinas suaves de papel (`library-paper`), y búsqueda, opciones de distribución y paneles auxiliares usan `library-control`. Los volúmenes conservan una silueta propia: cubierta apenas redondeada y asimétrica, lomo estrecho y canto claro. Esos radios materiales no reemplazan la escala del resto de la aplicación.

Las miniaturas de personalización son esquemas geométricos marcados como decorativos: representan distribución y densidad. Sus bordes de madera forman parte de esa miniatura, no de una tarjeta de contenido con acento lateral.

## Components

### Buttons

Acciones breves y consistentes con LexOpen. El primario usa cobre profundo; el secundario usa fondo de tinta y texto de papel, y cambia a verde mar en modo oscuro; el contorno conserva fondo transparente. Todos comparten forma de cápsula y una elevación mínima al pasar el puntero. El foco global es visible; la biblioteca añade un contorno de verde mar y los enlaces sobre madera usan un foco dorado. Las acciones de la cabecera y los controles móviles principales mantienen una altura mínima de 44 píxeles.

### Chips

Las etiquetas existentes son cápsulas pequeñas, seminegritas y en mayúsculas. Sus colores expresan estado o categoría; el contador de libros seleccionados es circular y usa cobre suave. Un color de cubierta nunca sustituye una etiqueta de propiedad o estado.

### Cards / Containers

Las superficies de lector, importación, personalización, colecciones y escritura usan papel, bordes discretos cuando corresponden y sombra ambiental. El estante es una estructura de madera continua con rótulo, fila de libros y canto; no es una serie de tarjetas decorativas. La galería y el salón redistribuyen esa estructura según la tabla de variantes.

### Inputs / Fields

Campos semánticos con etiqueta visible, fondo de superficie sólida y trazo tenue. El foco añade línea y halo de verde mar; el error conserva el estado inválido y el color de peligro. La búsqueda contiene un icono y un campo sin borde interno; su contenedor recibe el foco. Personalización usa radios reales para seis distribuciones, colores nombrados para seis encuadernaciones y selectores para tres materiales y dos vistas, por cubiertas o por lomos.

Las opciones de importación y sus preferencias por profesional separan conversión a TXT y conservación del original. La configuración inicial conserva el original y deja la conversión opcional desactivada; el aviso de archivo voluminoso parte en 10 MiB, con un umbral configurable entre 1 y 25 MiB. Si se decide conservar sólo texto, la conversión queda activada y aparece un aviso de las consecuencias antes de importar. La preferencia se aplica a futuras tandas; cada tanda puede cambiarla. El recibo distingue bytes conservados, reducción real y conversión que no reduce tamaño.

### Navigation

Se conservan `AppShell` y `AppSidebar`, sus grupos, estado activo, panel móvil y foco de teclado. Dentro de biblioteca, tres apartados en línea —Mis libros, Mesa de escritura y Colecciones— mantienen el estado mediante color, subrayado y semántica; la selección de fuentes aparece junto a la mesa.

### Volumen, lector y citas

Cada libro real tiene un enlace con nombre accesible, volumen visual decorativo y título completo debajo; la selección para fundamentar es un control separado. El estado vacío muestra una única **vista previa de una encuadernación**, etiquetada como tal, y la acción de añadir el primer libro. Las miniaturas y mocks aprobados no se incorporan como libros a los datos.

La lectura mantiene portada y ficha junto a acciones de descarga y escritura. Sólo un PDF cuyo original está conservado presenta selector e imagen de página física; EPUB y otros formatos usan su localizador real. Cuando se conserva sólo TXT, el aviso «Original no conservado» aparece en la ficha, se ofrece descargar el texto y las citas declaran su cotejo con ese texto. No aparece una imagen de página ni una descarga de original inexistente. Las referencias llevan al pasaje, y la comprobación de correspondencia no se presenta como certificación de autoría o vigencia.

La mesa de escritura mantiene selección de fuentes, recuperación de pasajes, editor y referencias en superficies de papel. El texto literal, una propuesta de IA y los avisos de comprobación tienen funciones distintas y permanecen identificables.

## Do's and Don'ts

### Do:

- **Do** conservar Sora, Fraunces, cobre, verde mar y el marco de aplicación existente.
- **Do** tratar las seis distribuciones como variantes de la misma biblioteca autorizada.
- **Do** mantener títulos completos, propiedad, estados y localizadores en texto HTML legible.
- **Do** usar las texturas propias para el grano y CSS para volumen, iluminación y respuesta al foco.
- **Do** distinguir visualmente original conservado, texto conservado y extracción parcial u OCR.
- **Do** preservar la reorganización móvil y la respuesta estática con movimiento reducido.

### Don't:

- **Don't** aplicar madera, cuero o las preferencias de biblioteca al cromo de las otras pantallas.
- **Don't** usar mocks, libros de ejemplo o miniaturas como contenido real de la colección.
- **Don't** atribuir páginas físicas a EPUB, TXT o un original que no está conservado.
- **Don't** presentar una comprobación de literalidad como verdad jurídica o autoría certificada.
- **Don't** rasterizar títulos, controles, pasajes o avisos de la interfaz.
- **Don't** añadir lámparas, plantas u objetos del mock a la superficie operativa de biblioteca.

## Refinamiento general · noviembre 2026

El marco conserva Sora, Fraunces, cobre y verde mar. El símbolo propio usa folios geométricos: marca, colección y documento cotejado. Los paneles de trabajo usan una superficie opaca, una línea y radios de 16 px; los controles, 14 px y 44 px de altura mínima. El texto base es 16 px también en móvil. Las tablas operativas se convierten en registros de dos columnas en móvil sin duplicar los datos, preservando sus encabezados para lectores de pantalla.

Los nuevos tonos muted (#52656d claro, #a2b7bf oscuro), sea oscuro (#77c8cd / #8edce0) y cobre oscuro (#d59a67) aportan contraste sobre papel o tinta. El botón principal mantiene #9a5a28 con texto blanco en ambos temas. Las cabeceras de tabla usan mist/ink; la consola conserva fondo tinta fijo. Los degradados de barra lateral ya existentes y la oscuridad de los fondos de diálogo son tratamientos contextuales, no una nueva paleta ornamental.

El movimiento describe apertura de folios: diálogos 180 ms, paneles de pestañas 160 ms, y una respuesta breve del símbolo al pasar sobre la marca. Se limita a cambios iniciados por el usuario y desaparece con prefers-reduced-motion. No hay vídeo de fondo ni contenido oculto esperando una animación. La navegación activa se reconoce por línea de cobre, fondo y aria-current.

`sea-solid` conserva #1f6f78 en ambos temas para controles con texto blanco; `sea` se aclara en oscuro para enlaces y texto. No intercambiar esos usos.

## Preparación de causa · 2 de noviembre de 2026

La preparación amplía la dirección clásica y editorial existente mediante un índice de expediente, filas separadas por filetes y el símbolo geométrico propio de folio. Conserva Fraunces en títulos, Sora en interfaz y prosa, cobre en acentos y verde mar en enlaces, sobre papel y tinta. No incorpora fotografías ni otra marca; las seis distribuciones de biblioteca y su materialidad de cuero permanecen acotadas a esa superficie. El brief de esta ampliación está en `.impeccable/surfaces/preparacion-causa.md`.

`CasePreparation` organiza documentos, hechos y fuentes, grabaciones, mesa privada de audiencia y continuidad mediante minutas. Sus estados describen trabajo guardado y accesible, no una certificación del contenido ni de su alcance jurídico. La composición pasa de introducción e índice de pasos en dos columnas a una columna a 800 píxeles; a 1120 píxeles las acciones se sitúan debajo de cada paso. La prosa de introducción, instrucciones y aviso de alcance usa un rem; los estados conservan su jerarquía auxiliar. Los enlaces mantienen una altura mínima de 44 píxeles. Las fuentes del patrón son `src/components/causas/CasePreparation.tsx` y `CasePreparation.css`, con los recuentos resueltos en `src/app/(app)/causas/[id]/page.tsx`.

La hoja editable Markdown y la cronología CSV se abren desde un desplegable con folio y filetes, dentro de hechos y fuentes. Exportan los hechos activos de la página y los filtros actuales; los descartados y ocultos quedan fuera. Los archivos declaran su alcance y vuelven a resolver acceso y referencias al descargarse. El guion de audiencia permite ordenar hasta veinte notas disponibles y añadir apertura y cierre propios; conserva diferenciadas las observaciones personales y las citas numeradas. Apertura, cierre y orden son temporales en la pantalla y se conservan mediante descarga. Estos patrones están en `src/components/knowledge/CasePreparationExport.tsx`, `knowledge.css`, `src/components/hearings/HearingBrief.tsx` y `hearings.css`; no se presenta el archivo como escrito presentado o conclusión jurídica corroborada.

El movimiento responde a acciones del usuario: desplazamiento mínimo de la flecha y apertura de hoja o guion (180 ms), y señal de llegada a una sección enlazada (650 ms). Con `prefers-reduced-motion` se eliminan esas animaciones y transiciones. La evidencia visual de esta ampliación consta de seis PNG en `docs/preparacion-2026-11-02/`, para preparación, exportación y guion en escritorio y móvil; este registro documenta la implementación y no acredita despliegue en producción ni conformidad WCAG completa.

## Escritos de la causa · 2 de noviembre de 2026

`CaseWritingEditor` extiende la dirección clásica y editorial con una hoja continua de borrador privado y un cuaderno lateral de fuentes, referencias e historial. Conserva Fraunces en título y texto del escrito, Sora en controles y avisos, superficie sólida, filetes discretos y verde mar para selección y procedencia. El estado de guardado y las acciones Guardar ahora, Descargar Markdown y Descargar TXT preceden al cuerpo; los controles mantienen una altura mínima de 44 píxeles. La composición de esta superficie se registra en `.impeccable/surfaces/escritos-causa.md`.

El guardado automático se programa tras 900 ms sin editar, con estados visibles para cambios pendientes, guardado en curso, desconexión, error y conflicto. Incorporar una fuente o descargar espera primero el guardado; el historial permite revisar el texto y el recuento de referencias antes de recuperar una versión como un nuevo guardado. La versión seleccionada se distingue mediante fondo y texto de verde mar, `aria-pressed` y «Versión abierta»; su vista previa aparece antes de la lista y se lleva a la vista sin desplazamiento animado.

A 1120 píxeles o menos, la hoja y el cuaderno se alternan mediante Escribir, Fuentes, Referencias e Historial en una barra superior adherida que conserva el estado de guardado. A 700 píxeles se apilan creación y selección, y las cuatro opciones pasan a dos columnas. La apertura del panel del cuaderno usa un recorte breve de hoja (180 ms) y desaparece con `prefers-reduced-motion`. Las fuentes de este patrón son `src/components/writings/CaseWritingEditor.tsx`, `CaseWritingEditor.css` y `src/app/(app)/causas/[id]/escritos/page.tsx`; este registro describe el código construido.

## Navegación y espacios de trabajo · 4 de noviembre de 2026

Este apéndice registra la reorganización construida para `1.1.0-preview.2`. Conserva los tokens, Sora para interfaz, Fraunces para títulos y lectura, cobre para acción y selección del marco, verde mar para enlaces y herramientas, papel y tinta para el trabajo. La materialidad de cuero y estantes permanece en Biblioteca. No se regeneran el frontmatter ni el sidecar de diseño en este alcance documental.

**Regla de área activa.** El marco presenta siete áreas estables —Mi jornada, Causas, Agenda, Biblioteca, Clientes, Comunicaciones y Estudio— y sólo los destinos secundarios del área abierta. Un catálogo autorizado común sostiene navegación lateral, móvil, rápida y rutas de navegación; el portal mantiene su recorrido propio. La búsqueda tiene un acceso dedicado en la cabecera móvil. La selección combina color, señal de cobre y semántica de estado; no depende sólo de un icono.

**Regla de trabajo y acompañante.** Lectura, escritos, audiencia y Mesa del asistente reservan el espacio principal al trabajo activo y comparten un único acompañante contextual opcional. `ContextPanel` usa el mismo árbol de `Sheet`: por encima de 1120 px se presenta en línea y, en compacto, como diálogo nativo. El acompañante lateral usa filete de separación y una columna de 19 a 23 rem; el diálogo llega hasta 28 rem o al ancho de la pantalla, con fondo atenuado, cabecera y cierre de al menos 44 px. El foco visible emplea verde mar. Escape y cierre devuelven el foco, y cambiar de ancho no recrea editores ni capturadores. El cierre no se presenta como confirmación de guardado.

**Regla de recorrido visible.** En la causa, Resumen, Expediente, Preparación, Audiencias y Escritos preceden a las acciones operativas; Biblioteca y Mesa del asistente ocupan la línea de recursos. En móvil el recorrido tiene dos columnas, enlaces de al menos 44 px y estado activo con filete verde mar. Más acciones concentra operaciones secundarias. En Configuración, cinco categorías agrupan catorce secciones conservando sus anclas y formularios montados.

El lector da prioridad al original PDF conservado y reúne pasajes, ficha y personalización en el acompañante. El editor conserva la hoja y el estado de guardado; fuentes, respaldos, versiones y descarga comparten el panel, incluidos los errores y su recuperación. Esta composición sustituye el patrón móvil de cuatro pestañas descrito en el registro del 2 de noviembre. La Mesa separa Preparar, Ejecutar y Revisar sin presentar varias columnas de herramientas simultáneas. La audiencia conserva reloj y capturador en su mesa mientras se consultan notas o fuentes; los cambios de mesa y las salidas mantienen sus guardas.

La evidencia se registra en `.impeccable/surfaces/navegacion-estudio.md` y en `docs/interfaz-2026-11-04/README.md`: quince capturas con datos ficticios y manifiesto de dimensiones y huellas, revisión visual independiente y comprobación local a 1440 y 360 px. La Mesa capturada simula proveedor, eventos y resultado; esas imágenes no prueban Docker. No se canonizan valores de una captura ni se atribuye a esta revisión una conformidad completa de accesibilidad o una publicación.

## ALTAZOR AI · 4 de noviembre de 2026

Este apéndice registra la entrada de ALTAZOR construida para el trabajo de `1.1.0-preview.3`. Conserva el frontmatter, el sidecar y los patrones anteriores. Sora sostiene controles y prosa de interfaz; Fraunces, el nombre, los títulos y la edición prolongada. Cobre, verde mar, papel y tinta mantienen los roles existentes. El cuero y los estantes siguen acotados a Biblioteca.

**Regla de entrada y continuidad.** Mi jornada abre Conversación y reúne Memoria, Conexiones, Academia y Computadora en una navegación interna identificada. La barra lateral conserva sus siete áreas estables. Agenda y trabajo reciente continúan en un apartado desplegable de la misma pantalla. El espacio personal o la causa, su carácter privado, el destino de IA y los estados de cada solicitud se expresan en texto junto al trabajo. Las herramientas visitadas permanecen montadas al cambiar de apartado; los estados de guardado y los avisos de salida describen qué se conserva.

**Regla de conversación y fuentes.** El editor del encargo precede al historial, con acciones visibles de Adjuntar y Enviar. Elegir fuentes y consultar conversaciones son acciones progresivas. Los adjuntos muestran nombre, selección, descarga, incorporación a biblioteca y retirada; los pasajes de respaldo vuelven a su origen. El envío remoto exige su autorización junto al destino. Un plan, su confirmación, una ejecución en curso y un resultado interrumpido permanecen diferenciados; el estado del acompañante no sustituye estos mensajes.

**Regla de memoria revisable.** El grafo y la lista accesible representan los mismos recuerdos y relaciones autorizados. Propuesto y Confirmado se expresan mediante etiquetas y acciones; la incorporación de memoria a una consulta requiere marcar su uso. Editar, confirmar y olvidar están ligados al recuerdo y a sus respaldos. Una relación visual no convierte por sí sola una afirmación en un hecho corroborado ni vincula personas de expedientes distintos.

**Regla de Academia.** Trabajo, Matriz de literatura, Docencia, Mi perfil y Descubrir separan tareas dentro del mismo espacio privado. La pregunta, destinatarios y fuentes preceden a la propuesta. La matriz mantiene encabezados, tipos y respaldos por celda; su ancho se desplaza dentro de su propio contenedor. La hoja editable conserva texto, estado de revisión, descargas Word/Markdown e incorporación a una causa. Descubrir identifica la fuente de los metadatos y la fecha de consulta; el grafo bibliográfico representa relaciones recibidas del índice. Ninguno de esos estados atribuye lectura del texto completo.

**Regla de conexiones y acciones externas.** Codex personal enlaza a Mi cuenta; correo e integraciones conservan sus recorridos actuales. LinkedIn distingue configuración pendiente, autorización y permisos de publicación. El borrador privado, la previsualización, la confirmación y el recibo son pasos visibles; un resultado remoto desconocido no se presenta como publicado. Feed, contactos y conversaciones permanecen en LinkedIn. La interfaz de Computadora refleja configuración, sesión, control y cierre de un entorno opcional; no presenta como preparado un escritorio por el hecho de mostrar su acceso.

**Acompañante original.** `AltazorMark` usa el chungungo de `public/altazor/companion-states.png`: atento, leyendo, pensando y con un documento terminado. El [registro de generación y huella](public/altazor/provenance.json) fija su procedencia. El nombre ALTAZOR AI y todos los controles siguen siendo texto HTML. La marca principal tiene nombre accesible y sus repeticiones decorativas se ocultan a las tecnologías de asistencia. El movimiento de llegada desaparece con `prefers-reduced-motion`; ningún estado funcional depende de la animación o de la ilustración.

**Adaptación.** La superficie principal se limita a 1120 px y conserva ancho mínimo cero en contenidos. A 800 px se reorganizan cabecera y herramientas; a 480 px la navegación interna pasa a dos columnas, Computadora ocupa una fila y las acciones de adjuntos se apilan. Los controles principales mantienen 44 px de altura mínima, la tipografía funcional usa un rem y el historial puede desplazarse mediante teclado con foco visible. Estas reglas describen el código; la evidencia visual de escritorio y móvil y su alcance deben leerse con la entrega.

Las referencias de implementación son `src/components/altazor/AltazorHome.tsx`, `AltazorHome.css`, `AltazorMemory.tsx`, `AltazorAcademic.tsx`, `AltazorDiscovery.tsx`, `AltazorConnectors.tsx` y `AltazorComputer.tsx`. La [guía de ALTAZOR](docs/ALTAZOR.md), la [guía de descubrimiento](docs/altazor-discovery.md) y la [operación de Computadora](src/lib/altazor/computer/README.md) conservan los límites funcionales. Las capturas de `docs/altazor-2026-11-04/` usan datos ficticios y no acreditan una cuenta real de LinkedIn, publicación social, Docker operativo, release publicada ni instaladores firmados.
