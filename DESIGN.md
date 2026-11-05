---
name: LexOpen
description: "MIDNIGHT editorial: asistente personal, tinta grabada y biblioteca clásica; cobre y verde mar."
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
  overlay: "rgba(8, 16, 20, 0.48)"
  dark-overlay: "rgba(0, 0, 0, 0.62)"
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
  workspace:
    fontFamily: "var(--font-editorial), var(--font-sora), sans-serif"
    fontSize: "clamp(2.25rem, 3.2vw, 3rem)"
    fontWeight: 500
    lineHeight: 1.08
    letterSpacing: "-0.025em"
  companion:
    fontFamily: "var(--font-editorial), var(--font-sora), sans-serif"
    fontSize: "1.75rem"
    fontWeight: 500
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

**Creative North Star: "MIDNIGHT editorial; un acompañante, una tarea"**

LexOpen conserva cobre, verde mar, papel y tinta, con MIDNIGHT como dirección visual preferida. Barlow Condensed identifica los apartados de trabajo; Sora sostiene controles y prosa de interfaz; Fraunces conserva el carácter de libros y lectura prolongada. El chungungo grabado de ALTAZOR aporta una identidad propia y discreta. La referencia editorial de HERMES informa la relación entre títulos altos, filetes y figura grabada; sus ilustraciones y fuentes comerciales no forman parte de LexOpen.

La interfaz organiza una tarea principal y muestra las opciones secundarias cuando hacen falta. Inicio y el acompañante lateral comparten una conversación persistente; Académico dispone de su propio espacio. La biblioteca conserva sus seis composiciones de encuadernaciones clásicas en tres dimensiones. El cuero y la madera pertenecen a libros y estantes; lectura, escritura y formularios mantienen texto HTML y superficies legibles.

La autoridad de implementación está en `src/app/globals.css`, el layout raíz, `AppShell`, `AppSidebar`, `Sheet` y los estilos de cada superficie. La [dirección gráfica](docs/REFERENCIAS-GRAFICAS-2026-11-05.md) registra referencias y procedencia. Las capturas de `docs/midnight-2026-11-05/` muestran el código local a 1440 y 360 px, además del acompañante a 800 px; sus datos y configuración de conexión son ficticios y no acreditan cuentas externas, una release publicada ni conformidad completa de accesibilidad.

**Key Characteristics:**

- Títulos condensados, controles Sora y lectura Fraunces.
- Noche, papel y superficies opacas; cobre para acción y verde mar para orientación.
- Un único ALTAZOR persistente entre Inicio y el acompañante.
- Una tarea visible, opciones progresivas y estados expresados en texto.
- Materialidad de cuero y madera acotada a la biblioteca personal.
- Propiedad, permisos, procedencia, foco visible y adaptación móvil.

## Colors

El cobre organiza acciones y selección del marco; el verde mar orienta enlaces, fuentes, foco y herramientas. El frontmatter conserva los valores normativos extraídos del código, incluidos ambos temas y la paleta material de biblioteca.

### Primary

- **Cobre** (`copper`) aporta identidad y pequeños acentos. **Cobre profundo** (`copper-deep`) es la base clara del primario; el botón principal conserva ese valor claro en ambos temas para sostener su texto blanco. La sustitución `dark-copper-deep` se reserva a texto y acentos del tema oscuro. **Cobre suave** acompaña contadores y etiquetas.

### Secondary

- **Verde mar** identifica enlaces de fuente, selección y controles de lectura; sus sustituciones oscuras mantienen contraste sobre MIDNIGHT. **Mar luminoso** participa en el foco global y **mar suave** en selección, avisos y fragmentos enlazados.
- **Verde mar sólido** conserva su valor en ambos temas para controles con texto blanco; no se intercambia por el verde mar aclarado de los enlaces oscuros.
- **Error, correcto y aviso** conservan sus roles semánticos. El color de una encuadernación no representa un estado de verificación.

### Tertiary

- **Burdeos, verde bosque, azul noche, coñac, marfil y grafito** son las seis opciones de cubierta. La tinta dorada de encuadernación cambia a tinta marrón en marfil.
- **Nogal clásico, roble claro y madera oscura** son tres tratamientos del estante. Reutilizan la textura de nogal producida; no hay una imagen independiente de roble.

### Neutral

- **Tinta y tinta suave** separan contenido principal e información auxiliar. **Papel, niebla y superficie sólida** distinguen fondo, apoyo y área de trabajo. **Muted** conserva legibles las indicaciones secundarias. **Arena** pertenece a la paleta existente.
- **Línea y línea fuerte** son divisores discretos. El estado activo añade fondo, filete y semántica; el color no es su única señal.
- Los tokens `dark-*` documentan las sustituciones de `html.dark`; los componentes usan los nombres semánticos sin prefijo. Los fondos atenuados oscurecen el contenido que queda detrás del diálogo, mientras el panel mantiene una superficie sólida.

**The Material Scope Rule.** Las preferencias de madera y encuadernación modifican la biblioteca y sus libros; no cambian los colores semánticos de LexOpen.

## Typography

**Workspace Font:** Barlow Condensed, con Sora y sans-serif de respaldo.

**Reading / Library Display Font:** Fraunces, con Georgia y serif de respaldo.

**Body Font:** Sora, con Segoe UI y sans-serif de respaldo.

La condensada identifica el apartado sin ocupar la página; la serif distingue cubiertas, pasajes y edición prolongada. Sora mantiene precisas las acciones, etiquetas, permisos y datos auxiliares. Las tres familias se cargan en el layout raíz. Barlow Condensed usa licencia SIL OFL; no se incorporan las fuentes comerciales de la referencia externa.

### Hierarchy

- **Workspace** sigue `typography.workspace` en Inicio, Académico y Sincronización. Los títulos operativos usan una escala condensada; Académico y Sincronización tienen una reducción local a dos rem en móvil.
- **Companion** identifica ALTAZOR y el encabezado de su panel. La marca del encabezado de Inicio tiene una reducción local en móvil; el nombre permanece legible como texto.
- **Display** encabeza biblioteca y lector; **Headline** identifica importación, personalización, pasajes y mesa de escritura; **Title** rotula estantes sin competir con la cabecera.
- **Body** usa la base de un rem y el tamaño raíz fijo del navegador. El contenido de ALTAZOR conserva medidas de 65–75 caracteres; las instrucciones académicas y los pasajes limitan su medida a 72 caracteres cuando corresponde.
- **Label** diferencia campos mediante peso seminegrita. Los pasos **Chrome micro / label** registran microtexto existente de marca y contadores; no constituyen una pauta para reducir instrucciones, permisos o lectura funcional.
- **Reading** conserva saltos, interlineado amplio y citas legibles. La hoja académica y el escrito de causa mantienen Fraunces para texto prolongado.

**The Complete Title Rule.** La cubierta puede abreviar un título largo para respetar palabras y proporción; el título completo permanece en la ficha, el pie de catálogo y el nombre accesible del enlace.

## Layout

El marco usa una barra lateral de escritorio expandida (252 px) o contraída (76 px), cabecera adherida y contenido flexible con ancho mínimo cero. Por debajo de 768 px la navegación pasa a un panel móvil; la búsqueda conserva su acceso en la cabecera. El catálogo autorizado presenta hasta ocho áreas: Mi jornada, Causas, Agenda, Biblioteca, Académico, Clientes, Comunicaciones y Estudio. Sólo aparecen los destinos secundarios del área abierta. El portal del cliente conserva su recorrido propio.

Inicio limita su contenido a 1120 px y pone el encargo antes del historial. «Mi asistente» reúne Memoria, Conexiones, Computadora y preferencias. Académico ocupa una superficie propia de hasta 1160 px: elección de propósito, trabajo guardado y pasos Objetivo, Fuentes y Preparar. Bibliografía, matriz, docencia y perfil se abren dentro de ese espacio. Sincronización reúne la cuenta judicial, consulta por RIT/ROL y documentos; «Mi Google Drive» aparece antes de las herramientas judiciales y se distingue de «Google Drive del estudio».

Lectura, escritos y audiencia mantienen el trabajo principal y un acompañante contextual. Por encima de 1120 px, `ContextPanel` puede situarse en una columna lateral de 19–23 rem; en compacto usa el mismo árbol de `Sheet` como diálogo. Cambiar de ancho conserva editores y capturadores montados. El acompañante de ALTAZOR usa una hoja superpuesta de hasta 800 px con desplazamiento interno y acceso a la conversación completa.

La preparación de causa usa índice, pasos y filas separadas por filetes; en compacto apila las acciones y el índice. Resumen, Expediente, Preparación, Audiencias y Escritos preceden a las operaciones secundarias de cada causa. La hoja de escrito conserva el guardado visible y reúne fuentes, referencias, versiones y descarga en su acompañante. Este patrón vigente reemplaza la anterior barra móvil de cuatro pestañas del escrito.

### Biblioteca personal

Nombre personal, propiedad y acciones preceden a Mis libros, Mesa de escritura y Colecciones. Búsqueda y filtros preceden a los estantes. Importación y personalización se abren dentro del flujo; la mesa separa fuentes y papel de trabajo. Las seis distribuciones usan la misma colección privada y sus permisos.

| Variante | Composición construida |
| --- | --- |
| La mesa de estudio (`mesa`) | Ex libris a la izquierda; estantes a la derecha. |
| La gran biblioteca (`estantes`) | Estantes a todo el ancho sin ex libris lateral. |
| El gabinete (`gabinete`) | Rail de propiedad estrecho y lomos de mayor densidad. |
| La galería (`galeria`) | Cubiertas grandes sobre papel, sin panel de madera ni canto de estante. |
| El archivo (`archivo`) | Madera profunda y filas densas; en cubiertas, uno de cada cinco volúmenes ocupa dos columnas y muestra su frente. |
| El salón de lectura (`salon`) | Franja de ex libris y dos grupos de estantes sobre papel, con cantos de madera. |

La biblioteca se adapta a 1120, 800 y 480 px. A 800 px apila composición, mesa y colecciones; el selector ofrece dos opciones por fila. A 480 px muestra dos cubiertas por fila en la vista habitual, tres lomos en gabinete y vista de lomos, y una cubierta grande en galería; archivo conserva su retícula compacta. La ficha del lector y su barra de página se apilan. Las variantes preservan títulos completos, búsqueda, selección y permisos. Su composición se registra en `.impeccable/surfaces/biblioteca.md`.

### Adaptación y densidad

Académico apila sus recorridos a 700 px; Sincronización, conexiones y formularios de OAuth reorganizan sus acciones a 600 px. Las tablas operativas comunes pasan a registros de dos columnas por debajo de 640 px preservando encabezados accesibles. La matriz de literatura conserva desplazamiento dentro de su propio contenedor. La audiencia mantiene densidad operativa, reloj y capturador visibles mientras se consultan fuentes. Los puntos de adaptación del sidecar describen estos patrones, no una retícula única obligatoria para toda pantalla.

## Elevation & Depth

MIDNIGHT combina superficies opacas y capas tonales con sombras ambientales suaves. Los paneles de trabajo usan una superficie sólida, una línea y esquinas moderadas; el fondo visible detrás de un diálogo no atraviesa su contenido. La cabecera conserva desenfoque y el lateral su degradado contextual. La biblioteca reserva una profundidad estructural más marcada para madera, cantos y encuadernaciones. Los valores de sombra y movimiento están en `.impeccable/design.json`.

El volumen del libro se construye con planos CSS de cubierta, lomo y canto sobre perspectiva (900 px). El grano de cuero se mezcla con `soft-light`; geometría, ornamentos y texto siguen siendo CSS y HTML. La textura de nogal se repite en paneles y cantos de madera. Los mocks no se envían como interfaz.

El movimiento acompaña acciones: aperturas breves de folios y pestañas, llegada del grabado y desplazamiento lateral del acompañante. La hoja de ALTAZOR entra en 180 ms mediante traslación y conserva opacidad completa durante toda la entrada. `prefers-reduced-motion` elimina estas entradas y las transiciones de controles. Los estados de espera se expresan también en texto.

**The Opaque Workspace Rule.** Un diálogo o acompañante mantiene su superficie sólida durante la apertura, el uso y el cierre; el fondo atenuado pertenece a la página que queda detrás.

**The Responsive Depth Rule.** Al pasar el puntero o enfocar el enlace, el libro se eleva y gira una sola vez mediante una transición corta; con movimiento reducido se conserva la pose estática y se elimina la transición. La legibilidad y la apertura del libro no dependen del giro.

## Shapes

Botones, campos y navegación usan el radio medio existente; los paneles comunes usan el radio grande. Las cápsulas corresponden a etiquetas y sugerencias de conversación. La hoja académica, el lector y el papel de biblioteca mantienen esquinas suaves; el acompañante se presenta como una hoja continua. Los volúmenes tienen una silueta propia: cubierta apenas redondeada y asimétrica, lomo estrecho y canto claro. Estos radios materiales no reemplazan la escala general.

Las miniaturas de personalización son esquemas decorativos de distribución y densidad. Sus bordes de madera pertenecen a la miniatura y no se convierten en un patrón de tarjeta general.

## Components

### Buttons

Acciones breves con un verbo visible. El primario conserva cobre profundo y texto blanco; el secundario usa tinta y papel, con verde mar sólido en oscuro; el contorno usa fondo transparente y línea discreta. Comparten radio medio, una elevación mínima al pasar el puntero y un foco visible. Las acciones principales y los cierres mantienen un área mínima de 44 px. El estado desactivado reduce la opacidad y comunica disponibilidad sin simular ejecución.

### Chips

Etiquetas seminegritas pequeñas para estado o categoría, con cápsula y color semántico. El contador de libros seleccionados usa cobre suave. Las sugerencias de conversación son botones de cápsula con texto legible. Ni el color de cubierta ni una ilustración sustituyen una etiqueta de estado.

### Cards / Containers

Conversación, importación, lector y escritura utilizan superficies sólidas y jerarquía interior. Las listas académicas y de sincronización se separan por filetes; las opciones secundarias se agrupan en detalles. El estante forma una estructura de madera continua con rótulo, libros y canto. Galería y salón redistribuyen esa estructura según la tabla de variantes.

### Inputs / Fields

Campos con etiquetas visibles, fondo sólido, trazo tenue y foco de verde mar. El error mantiene el estado inválido y peligro. En móvil los campos funcionales usan al menos 16 px. Las casillas conservan su indicador pequeño dentro de una etiqueta pulsable de al menos 44 px, incluidos los permisos de envío y memoria de ALTAZOR. La selección permanece explícita antes de enviar contenido o conectar una cuenta.

Biblioteca distingue conversión a TXT y conservación del original. La configuración inicial conserva el original y deja la conversión opcional desactivada. El aviso de archivo voluminoso comienza en 10 MiB, configurable entre 1 y 25 MiB. Conservar sólo texto activa la conversión y muestra sus consecuencias antes de importar. El recibo distingue bytes conservados, reducción efectiva y conversión sin reducción.

### Navigation

El catálogo común sostiene lateral, móvil, acceso rápido y rutas de navegación. El destino activo combina fondo, filete de cobre y `aria-current`; los apartados locales usan verde mar y subrayado. Académico tiene un acceso propio. Sincronización concentra los accesos de ClaveÚnica, RIT/ROL y carpetas; el panel separa la conexión personal de la conexión del estudio. Búsqueda y operaciones secundarias conservan etiquetas y foco de teclado.

### ALTAZOR persistente y acompañante

Un único proveedor por usuario conserva conversación, borrador, fuentes elegidas y solicitudes entre Inicio y otras rutas. Fuera de Inicio, el botón «ALTAZOR» abre una hoja con la misma conversación y un acceso a su versión completa; al volver a Inicio desaparece ese lanzador. La hoja conserva cabecera, cierre visible, foco, Escape y desplazamiento contenido. Cerrar el acompañante no se presenta como una confirmación de guardado.

`AltazorMark` usa `public/altazor/companion-engraving-v2.png`: chungungo atento, leyendo, pensando o presentando un manuscrito. Su [registro de procedencia](public/altazor/engraving-provenance.json) conserva el recurso de origen y la generación. El nombre y los estados siguen siendo HTML; la marca tiene nombre accesible cuando corresponde y las repeticiones decorativas se ocultan a las tecnologías de asistencia.

El encargo precede al historial. Adjuntos, fuentes, destino de IA, permiso de envío y memoria confirmada se expresan junto al trabajo. Plan, confirmación, ejecución, interrupción y resultado mantienen estados distintos. Memoria conserva grafo y lista accesible sobre los mismos recuerdos, con Propuesto y Confirmado legibles.

### Académico

Investigar, Escribir y Enseñar son recorridos de entrada con una acción para comenzar. Objetivo, Fuentes y Preparar ordenan el trabajo sin mostrar simultáneamente todas las herramientas. La hoja editable reúne estado de revisión, guardado, respaldos, descargas e incorporación a una causa accesible. Matriz, perfil y descubrimiento tienen accesos secundarios. Las relaciones bibliográficas se identifican como metadatos del índice; la apariencia del grafo no atribuye lectura del texto completo.

### Volumen, lector y escritura de causa

Cada libro real tiene enlace accesible, volumen decorativo, título completo y selección separada para fundamentar. El vacío muestra una única «vista previa de una encuadernación» y permite añadir el primer libro. Sólo un PDF cuyo original se conserva presenta selector e imagen de página física. EPUB y otros formatos usan sus localizadores reales. Cuando se conserva sólo TXT, la ficha declara «Original no conservado», ofrece el texto disponible y las citas identifican esa base de cotejo.

La mesa de escritura mantiene selección de fuentes, pasajes, editor y referencias. El escrito de causa conserva una hoja privada, guardado automático después de 900 ms sin edición y estados de pendiente, guardando, desconexión, error y conflicto. La revisión de versiones distingue el texto abierto antes de recuperarlo como un nuevo guardado. Exportaciones y guion de audiencia mantienen el alcance de los datos actuales; una descarga no se presenta como escrito presentado ni conclusión jurídica corroborada.

## Do's and Don'ts

### Do:

- **Do** conservar Sora, Barlow Condensed, Fraunces, cobre, verde mar y los roles de ambos temas.
- **Do** mantener una conversación de ALTAZOR entre Inicio y el acompañante, con el trabajo principal visible.
- **Do** dar a Académico un espacio propio y revelar las herramientas secundarias dentro de cada tarea.
- **Do** mantener superficies opacas, foco visible y áreas pulsables principales de al menos 44 px.
- **Do** tratar las seis distribuciones como variantes de la misma biblioteca autorizada.
- **Do** conservar títulos completos, propiedad, permisos, estados y localizadores en texto HTML.
- **Do** distinguir original conservado, texto convertido, extracción parcial y metadatos bibliográficos.
- **Do** preservar la reorganización móvil y la respuesta estática con movimiento reducido.

### Don't:

- **Don't** aplicar madera, cuero o las preferencias de biblioteca al marco de las otras pantallas.
- **Don't** incorporar ilustraciones, logotipos o fuentes comerciales de la referencia HERMES.
- **Don't** multiplicar asistentes o conversaciones independientes al abrir el acompañante.
- **Don't** usar mocks, miniaturas o capturas como contenido real de una colección o conexión.
- **Don't** atribuir páginas físicas a EPUB, TXT o un original no conservado.
- **Don't** presentar una comprobación de literalidad como verdad jurídica o autoría certificada.
- **Don't** rasterizar títulos, controles, pasajes, permisos o avisos de la interfaz.
- **Don't** añadir objetos ambientales de los mocks al espacio operativo de biblioteca.
