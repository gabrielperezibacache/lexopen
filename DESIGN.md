---
name: LexOpen
description: "Lector grabado en plata, índigo profundo y acciones iris en una interfaz editorial."
colors:
  brand-night: "#0d1022"
  brand-silver: "#f4f3f7"
  brand-iris: "#aab5ff"
  brand-panel: "#171b31"
  brand-rule: "#313958"
  action-bg: "#3d4da1"
  action-hover: "#303e8a"
  action-ink: "#ffffff"
  action-secondary: "#e8eaf8"
  action-secondary-ink: "#303d83"
  sidebar-muted: "#b6bdd8"
  sidebar-current: "rgba(170, 181, 255, 0.17)"
  header-bg: "#f9f9fd"
  danger-ink: "#ffffff"
  copper: "#394994"
  copper-deep: "#3d4da1"
  copper-soft: "rgba(72, 89, 169, 0.11)"
  sea: "#394994"
  sea-solid: "#3d4da1"
  sea-bright: "#495bc2"
  sea-soft: "rgba(72, 89, 169, 0.11)"
  ink: "#181c32"
  ink-soft: "#353d59"
  mist: "#eaedf8"
  paper: "#f6f6fb"
  sand: "#d6c4a8"
  surface-solid: "#ffffff"
  line: "rgba(12, 28, 36, 0.12)"
  line-strong: "rgba(12, 28, 36, 0.22)"
  danger: "#b42318"
  ok: "#1f7a4c"
  warn: "#8d5414"
  muted: "#545e79"
  dark-sand: "#424863"
  dark-copper: "#aab5ff"
  dark-copper-soft: "rgba(149, 164, 255, 0.16)"
  dark-sea-solid: "#343d70"
  dark-sea-soft: "rgba(149, 164, 255, 0.16)"
  dark-action-bg: "#aab5ff"
  dark-action-hover: "#c5ceff"
  dark-action-ink: "#12162c"
  dark-action-secondary: "#2d365e"
  dark-action-secondary-ink: "#f4f3f7"
  dark-header-bg: "#11152a"
  dark-danger: "#ff9299"
  dark-danger-ink: "#261319"
  dark-ok: "#85d6ac"
  dark-warn: "#f2bb73"
  dark-muted: "#aeb6d3"
  dark-sea: "#aab5ff"
  dark-sea-bright: "#c6ceff"
  dark-copper-deep: "#aab5ff"
  dark-ink: "#f4f3f7"
  dark-ink-soft: "#d1d5e8"
  dark-paper: "#0d1022"
  dark-mist: "#232945"
  dark-surface-solid: "#171b31"
  dark-line: "rgba(196, 204, 248, 0.16)"
  dark-line-strong: "rgba(196, 204, 248, 0.3)"
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
  brand:
    fontFamily: "var(--font-fraunces), Georgia, serif"
    fontSize: "1.65rem"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-0.03em"
  brand-caption:
    fontFamily: "var(--font-sora), sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    letterSpacing: "0"
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
    backgroundColor: "{colors.action-bg}"
    textColor: "{colors.action-ink}"
    rounded: "{rounded.md}"
    padding: "0.65rem 1.1rem"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
  button-primary-dark:
    backgroundColor: "{colors.dark-action-bg}"
    textColor: "{colors.dark-action-ink}"
    rounded: "{rounded.md}"
    padding: "0.65rem 1.1rem"
  button-primary-dark-hover:
    backgroundColor: "{colors.dark-action-hover}"
  button-secondary:
    backgroundColor: "{colors.action-secondary}"
    textColor: "{colors.action-secondary-ink}"
    rounded: "{rounded.md}"
    padding: "0.65rem 1.1rem"
  button-secondary-dark:
    backgroundColor: "{colors.dark-action-secondary}"
    textColor: "{colors.dark-action-secondary-ink}"
    rounded: "{rounded.md}"
    padding: "0.65rem 1.1rem"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.danger-ink}"
    rounded: "{rounded.md}"
    padding: "0.65rem 1.1rem"
  button-danger-dark:
    backgroundColor: "{colors.dark-danger}"
    textColor: "{colors.dark-danger-ink}"
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
  input-dark:
    backgroundColor: "{colors.dark-surface-solid}"
    textColor: "{colors.dark-ink}"
    rounded: "{rounded.md}"
    padding: "0.75rem 0.9rem"
  navigation:
    textColor: "rgba(243, 246, 244, 0.82)"
    rounded: "{rounded.md}"
    padding: "0.65rem 0.85rem"
  navigation-current:
    backgroundColor: "{colors.sidebar-current}"
    textColor: "{colors.brand-silver}"
    rounded: "{rounded.md}"
    padding: "0.65rem 0.85rem"
  header:
    backgroundColor: "{colors.header-bg}"
    textColor: "{colors.ink}"
  header-dark:
    backgroundColor: "{colors.dark-header-bg}"
    textColor: "{colors.dark-ink}"
  chip-sea:
    backgroundColor: "{colors.sea-soft}"
    textColor: "{colors.sea}"
    rounded: "{rounded.pill}"
    padding: "0.2rem 0.55rem"
  chip-sea-dark:
    backgroundColor: "{colors.dark-sea-soft}"
    textColor: "{colors.dark-sea-bright}"
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

**Creative North Star: "Índigo editorial"**

El lector grabado en plata sobre índigo identifica LexOpen. La interfaz recoge esos tonos en fondos y texto, y reserva el iris para las acciones y la orientación. Barlow Condensed identifica los apartados de trabajo, Sora sostiene controles y prosa de interfaz, y Fraunces da carácter a libros, lectura prolongada y a toda la firma «Altazor AI». El chungungo grabado conserva su papel como acompañante.

La interfaz organiza una tarea principal y muestra las opciones secundarias cuando hacen falta. Inicio y el acompañante lateral comparten una conversación persistente, con historial antes del campo de mensaje y Adjuntar y Enviar en su pie. Académico dispone de su propio espacio. La biblioteca conserva sus seis composiciones de encuadernaciones clásicas en tres dimensiones, con búsqueda antes de los estantes y filtros en un acceso secundario. El cuero y la madera pertenecen a libros y estantes; lectura, escritura y formularios mantienen texto HTML y superficies legibles.

Los valores de la interfaz se definen en `src/app/globals.css`. `AppShell`, `AppSidebar`, `Sheet`, `welcome.css` y `desktop/renderer/setup.css` muestran cómo se aplican a cada superficie. El recorrido de ALTAZOR se describe en su guía de conversación. [Conversación primero](docs/INTERFAZ-CONVERSACION-2026-11-05.md)

**Key Characteristics:**

- Títulos operativos condensados, firma Altazor AI y lectura Fraunces, controles Sora.
- Índigo profundo, texto plata y superficies opacas, con iris para acciones y orientación.
- Un único ALTAZOR persistente entre Inicio y el acompañante.
- Una tarea visible, opciones progresivas y estados expresados en texto.
- Materialidad de cuero y madera acotada a la biblioteca personal.
- Propiedad, permisos, procedencia, foco visible y adaptación móvil.

### Marca LexOpen

La firma completa reúne un lector clásico grabado en plata y la palabra «LexOpen» centrada debajo, en una sola línea de serif clara. El lector y su libro abierto se recortan sobre un campo índigo liso, libre de rayos, destellos y marcos. La portada, el acceso de escritorio y la configuración inicial de Desktop usan la firma completa. La marca compacta usa sólo el lector en la barra lateral, la cabecera pública, el acceso móvil y los iconos de menos de 128 px. En la interfaz, el nombre acompaña a la marca como texto visible o etiqueta accesible. El icono recortable de la PWA mantiene la figura dentro de su zona segura y extiende el fondo hasta los bordes. [Originales y procedencia](docs/assets/lexopen-icon-provenance.json)

## Colors

La paleta combina índigo casi negro, plata e iris. El frontmatter recoge los valores de ambos temas, los estados de la interfaz y los materiales de biblioteca.

### Primary

- **Acción principal.** `action-bg`, `action-ink` y `action-hover` funcionan en conjunto. El tema oscuro usa iris con texto índigo profundo. El claro usa índigo saturado con texto blanco. El foco tiene su propio color y debe seguir visible junto a ambos fondos.
- **Orientación.** El acento iris marca enlaces, fuentes y selección en oscuro. Sus versiones más profundas sostienen los mismos roles en claro. El fondo de énfasis suave acompaña filas activas, etiquetas y pasajes enlazados.

### Secondary

- **Acción secundaria.** `action-secondary` y `action-secondary-ink` combinan fondo índigo discreto con plata en oscuro, y fondo claro con texto índigo en claro. La variante de contorno conserva el fondo de la superficie.
- **Compatibilidad interna.** `--sea`, `--sea-bright`, `--sea-soft` y `--sea-solid` alimentan los estilos existentes de orientación, foco, énfasis y selección sólida. `--copper`, `--copper-deep` y `--copper-soft` apuntan a esos roles o al fondo primario. Son nombres históricos de CSS. Para nuevos botones, se usan los roles `--action-*` y su pareja de fondo y texto.
- **Estados.** Error, correcto y aviso usan `danger`, `ok` y `warn` con texto que explica el estado. Los botones destructivos usan `danger-ink` sobre el fondo de peligro.

### Tertiary

- **Burdeos, verde bosque, azul noche, coñac, marfil y grafito** son las seis opciones de cubierta. La tinta dorada de encuadernación cambia a tinta marrón en marfil.
- **Nogal clásico, roble claro y madera oscura** son tres tratamientos del estante. Reutilizan la textura de nogal producida; no hay una imagen independiente de roble.

### Neutral

- **Índigo de noche** y **plata** forman la base de marca y sirven como papel y tinta del tema oscuro. La superficie índigo del panel eleva formularios y diálogo. El tema claro combina papel lavanda pálido, superficies blancas y tinta índigo. Tinta suave y texto atenuado mantienen legibles los niveles auxiliares.
- **Línea y línea fuerte** son divisores discretos. El estado activo añade fondo, filete y semántica; el color no es su única señal.
- Los tokens `dark-*` documentan las sustituciones de `html.dark`; los componentes usan los nombres semánticos sin prefijo. Los fondos atenuados oscurecen el contenido que queda detrás del diálogo, mientras el panel mantiene una superficie sólida.

**The Material Scope Rule.** Las preferencias de madera y encuadernación se aplican a los estantes y libros personales. Los controles de la biblioteca usan la paleta común de LexOpen.

## Typography

**Workspace Font:** Barlow Condensed, con Sora y sans-serif de respaldo.

**Reading / Library Display Font:** Fraunces, con Georgia y serif de respaldo.

**Body Font:** Sora, con Segoe UI y sans-serif de respaldo.

La condensada identifica el apartado sin ocupar la página y la serif distingue cubiertas, pasajes y edición prolongada. Sora mantiene precisas las acciones, etiquetas, permisos y datos auxiliares. Las tres familias se cargan en el layout raíz. Barlow Condensed usa licencia SIL OFL.

### Hierarchy

- **Workspace** sigue `typography.workspace` en Académico y Archivos conectados. Los títulos operativos usan una escala condensada; ambos tienen una reducción local a dos rem en móvil. Inicio conserva su H1 ALTAZOR sólo para tecnologías de asistencia.
- **Companion** identifica el encabezado funcional ALTAZOR de la hoja con Barlow Condensed a 1.75 rem; la firma del acompañante tiene sus propios roles.
- **Brand** muestra todo «Altazor AI» en una línea de Fraunces a 1.65 rem y peso 500, con el mismo tamaño, peso, color y línea base y un espacio natural entre palabras. **Brand caption** sitúa «Tu asistente» debajo en Sora a 0.8125 rem. En móvil, la firma de Inicio baja a 1.4 rem; el lanzador usa 1.15 rem y una leyenda de 0.75 rem. El nombre permanece como un único texto HTML.
- **Display** encabeza biblioteca y lector; **Headline** identifica importación, personalización, pasajes y mesa de escritura; **Title** rotula estantes sin competir con la cabecera.
- **Body** usa la base de un rem y el tamaño raíz fijo del navegador. El contenido de ALTAZOR conserva medidas de 65–75 caracteres; las instrucciones académicas y los pasajes limitan su medida a 72 caracteres cuando corresponde.
- **Label** diferencia campos mediante peso seminegrita. Los pasos **Chrome micro / label** registran microtexto existente de marca y contadores; no constituyen una pauta para reducir instrucciones, permisos o lectura funcional.
- **Reading** conserva saltos, interlineado amplio y citas legibles. La hoja académica y el escrito de causa mantienen Fraunces para texto prolongado.

**The Complete Title Rule.** La cubierta puede abreviar un título largo para respetar palabras y proporción; el título completo permanece en la ficha, el pie de catálogo y el nombre accesible del enlace.

## Layout

El marco usa una barra lateral de escritorio expandida (252 px) o contraída (76 px), cabecera adherida y contenido flexible con ancho mínimo cero. Por debajo de 768 px la navegación pasa a un panel móvil; la búsqueda conserva su acceso en la cabecera. El catálogo autorizado presenta hasta ocho áreas: Mi jornada, Causas, Agenda, Biblioteca, Académico, Clientes, Comunicaciones y Estudio. Causas abre `/causas` en Gestión manual o `/pjud` en Poder Judicial de Chile; los destinos judiciales aparecen sólo en esta segunda modalidad. Sólo aparecen los destinos secundarios del área abierta. El portal del cliente conserva su recorrido propio.

Inicio limita su contenido a 880 px y pone el historial antes del campo de mensaje, con desplazamiento contenido y seguimiento del último intercambio mientras el usuario permanece al final. El vacío presenta una única pregunta, «¿En qué trabajamos hoy?», junto al campo; el pie reúne Adjuntar y Enviar. Conversaciones abre el historial guardado; «Mi asistente» reúne Memoria, Conexiones, Computadora y las preferencias por usuario de memoria y segundo plano. Los avisos de plazos fatales próximos se muestran cuando existen; agenda y trabajo reciente mantienen sus rutas propias. Académico ocupa una superficie propia de hasta 1160 px: elección de propósito, trabajo guardado y pasos Objetivo, Fuentes y Preparar. Bibliografía, matriz, docencia y perfil se abren dentro de ese espacio. Archivos conectados (`/sincronizacion`) reúne sólo Drive personal, Drive del estudio y carpetas de causas, con conexiones y administración separadas.

Configuración → Gestión de causas (`#case-management-settings`) presenta dos opciones de radio y Guardar modalidad. Gestión manual admite expedientes de cualquier país, referencias y tribunal u órgano libres; PJUD añade consulta por RIT/ROL, ClaveÚnica y seguimiento de Chile sobre los mismos expedientes autorizados. El cambio conserva datos y conexiones y pausa las colas judiciales al elegir manual. Las instalaciones nuevas comienzan en manual; la migración mantiene PJUD cuando había ClaveÚnica habilitada o causas con seguimiento activo.

Lectura, escritos y audiencia mantienen el trabajo principal y un acompañante contextual. Por encima de 1120 px, `ContextPanel` puede situarse en una columna lateral de 19–23 rem; en compacto usa el mismo árbol de `Sheet` como diálogo. Cambiar de ancho conserva editores y capturadores montados. El acompañante de ALTAZOR usa una hoja superpuesta de hasta 800 px con desplazamiento interno y acceso a la conversación completa.

La preparación de causa usa índice, pasos y filas separadas por filetes; en compacto apila las acciones y el índice. Resumen, Expediente, Preparación, Audiencias y Escritos preceden a las operaciones secundarias de cada causa. La hoja de escrito conserva el guardado visible y reúne fuentes, referencias, versiones y descarga en su acompañante. Este patrón vigente reemplaza la anterior barra móvil de cuatro pestañas del escrito.

### Portada, acceso y configuración inicial

La portada pública mantiene el fondo índigo en toda la página. La cabecera reúne el lector compacto, el nombre y las acciones de acceso. La apertura combina título editorial y llamadas a la acción con la firma completa. El primario de portada usa iris con texto índigo y pasa a plata al recibir el puntero. Debajo, un índice de módulos y un expediente de ejemplo se separan con filetes. En móvil los bloques se apilan y el grabado conserva su relación con la apertura.

El acceso en escritorio coloca el grabado junto al formulario. En móvil concentra el acceso en una columna encabezada por la marca compacta. El asistente de configuración inicial de Desktop reúne la firma completa, un título serif y las opciones de instalación en una columna. Sus controles usan superficies índigo, bordes visibles y acción primaria iris con texto índigo. El icono de instalación y la configuración inicial provienen de los mismos originales de marca.

### Biblioteca personal

Nombre personal, propiedad y acciones preceden a Mis libros, Sentencias y resoluciones, Mesa de escritura y Colecciones. La búsqueda precede a los estantes; Filtrar revela estante y propiedad. Importación y personalización se abren dentro del flujo; la mesa separa fuentes y papel de trabajo. Las seis distribuciones usan la misma colección privada y sus permisos, sin un panel lateral decorativo de propiedad.

| Variante | Composición construida |
| --- | --- |
| La mesa de estudio (`mesa`) | Estantes en una composición continua a todo el ancho. |
| La gran biblioteca (`estantes`) | Estantes a todo el ancho con separación amplia entre volúmenes. |
| El gabinete (`gabinete`) | Lomos de mayor densidad a todo el ancho. |
| La galería (`galeria`) | Cubiertas grandes sobre papel, sin panel de madera ni canto de estante. |
| El archivo (`archivo`) | Madera profunda y filas densas; en cubiertas, uno de cada cinco volúmenes ocupa dos columnas y muestra su frente. |
| El salón de lectura (`salon`) | Dos grupos de estantes sobre papel, con cantos de madera. |

La biblioteca se adapta a 1120, 800 y 480 px. A 800 px apila composición, mesa y colecciones; el selector ofrece dos opciones por fila. A 480 px muestra dos cubiertas por fila en la vista habitual, tres lomos en gabinete y vista de lomos, y una cubierta grande en galería; archivo conserva su retícula compacta. La ficha del lector y su barra de página se apilan. Las variantes preservan títulos completos, búsqueda, selección y permisos. Su composición se registra en `.impeccable/surfaces/biblioteca.md`.

### Adaptación y densidad

Académico apila sus recorridos a 700 px; Archivos conectados, conexiones y formularios de OAuth reorganizan sus acciones a 600 px. Las tablas operativas comunes pasan a registros de dos columnas por debajo de 640 px preservando encabezados accesibles. La matriz de literatura conserva desplazamiento dentro de su propio contenedor. La audiencia mantiene densidad operativa, reloj y capturador visibles mientras se consultan fuentes. Los puntos de adaptación del sidecar describen estos patrones, no una retícula única obligatoria para toda pantalla.

## Elevation & Depth

Las capas tonales opacas y las sombras ambientales suaves dan profundidad. Los paneles de trabajo usan una superficie sólida, una línea y esquinas moderadas. La cabecera adherida usa una superficie propia y un divisor. El lateral pasa del índigo de noche al del panel. La biblioteca reserva una profundidad estructural más marcada para madera, cantos y encuadernaciones. Los valores de sombra y movimiento están en `.impeccable/design.json`.

El volumen del libro se construye con planos CSS de cubierta, lomo y canto sobre perspectiva (900 px). El grano de cuero se mezcla con `soft-light`; geometría, ornamentos y texto siguen siendo CSS y HTML. La textura de nogal se repite en paneles y cantos de madera. Los mocks no se envían como interfaz.

El movimiento acompaña acciones: aperturas breves de folios y pestañas, llegada del grabado y desplazamiento lateral del acompañante. La hoja de ALTAZOR entra en 180 ms mediante traslación y conserva opacidad completa durante toda la entrada. `prefers-reduced-motion` elimina estas entradas y las transiciones de controles. Los estados de espera se expresan también en texto.

**The Opaque Workspace Rule.** Un diálogo o acompañante mantiene su superficie sólida durante la apertura, el uso y el cierre; el fondo atenuado pertenece a la página que queda detrás.

**The Responsive Depth Rule.** Al pasar el puntero o enfocar el enlace, el libro se eleva y gira una sola vez mediante una transición corta; con movimiento reducido se conserva la pose estática y se elimina la transición. La legibilidad y la apertura del libro no dependen del giro.

## Shapes

Botones, campos y navegación usan el radio medio existente; los paneles comunes usan el radio grande. Las cápsulas corresponden a etiquetas y sugerencias de conversación. La hoja académica, el lector y el papel de biblioteca mantienen esquinas suaves; el acompañante se presenta como una hoja continua. Los volúmenes tienen una silueta propia: cubierta apenas redondeada y asimétrica, lomo estrecho y canto claro. Estos radios materiales no reemplazan la escala general.

Las miniaturas de personalización son esquemas decorativos de distribución y densidad. Sus bordes de madera pertenecen a la miniatura y no se convierten en un patrón de tarjeta general.

## Components

### Buttons

Acciones breves con un verbo visible. El primario y el secundario usan sus parejas de fondo y texto en cada tema. El contorno usa fondo transparente y línea discreta. Comparten radio medio, una elevación mínima al pasar el puntero y un foco visible. Las acciones principales y los cierres mantienen un área mínima de 44 px. El estado desactivado reduce la opacidad.

### Chips

Etiquetas seminegritas pequeñas para estado o categoría, con cápsula y color semántico. El contador de libros seleccionados usa el fondo iris suave. Las sugerencias de conversación son botones de cápsula con texto legible. Los estados incluyen su etiqueta en texto.

### Cards / Containers

Conversación, importación, lector y escritura utilizan superficies sólidas y jerarquía interior. Las listas académicas y de sincronización se separan por filetes; las opciones secundarias se agrupan en detalles. El estante forma una estructura de madera continua con rótulo, libros y canto. Galería y salón redistribuyen esa estructura según la tabla de variantes.

### Inputs / Fields

Campos con etiquetas visibles, fondo sólido, trazo tenue y foco iris. El error mantiene el estado inválido y peligro. En móvil los campos funcionales usan al menos 16 px. Las casillas de configuración e importación conservan su indicador pequeño dentro de una etiqueta pulsable de al menos 44 px. El compositor de ALTAZOR usa una superficie sólida y realza el borde al recibir foco. El área de texto tiene etiqueta accesible. Adjuntar aparece a la izquierda y Enviar usa el primario a la derecha. La conexión de una cuenta conserva su autorización explícita.

Biblioteca distingue conversión a TXT y conservación del original. La configuración inicial conserva el original y deja la conversión opcional desactivada. El aviso de archivo voluminoso comienza en 10 MiB, configurable entre 1 y 25 MiB. Conservar sólo texto activa la conversión y muestra sus consecuencias antes de importar. El recibo distingue bytes conservados, reducción efectiva y conversión sin reducción.

### Navigation

El catálogo común sostiene lateral, móvil, acceso rápido y rutas de navegación. El destino activo combina fondo tintado, un indicador iris y `aria-current`. Las pestañas y enlaces locales usan el acento del tema. La cabecera global reúne las rutas de navegación, la búsqueda y las notificaciones. En móvil muestra el acceso al menú y el nombre del apartado. Apariencia e idioma se encuentran en el menú de cuenta junto a «Mi cuenta». Académico tiene un acceso propio. Causas resuelve su destino principal según la modalidad. PJUD concentra ClaveÚnica, RIT/ROL y seguimiento de Chile, mientras Archivos conectados reúne Drive personal y del estudio. Búsqueda y operaciones secundarias conservan etiquetas y foco de teclado.

### ALTAZOR persistente y acompañante

Un único proveedor por usuario conserva conversación, borrador y solicitudes entre Inicio y otras rutas. Fuera de Inicio, el lanzador «Altazor AI» abre una hoja con la misma conversación y un acceso a su versión completa; al volver a Inicio desaparece ese lanzador. La hoja conserva cabecera funcional ALTAZOR, cierre visible, foco, Escape y desplazamiento contenido. Cerrar el acompañante no se presenta como una confirmación de guardado.

`AltazorMark` usa `public/altazor/companion-engraving-v2.png`: chungungo atento, leyendo, pensando o presentando un manuscrito. La mascota mide 48 px en Inicio y 44 px en el lanzador; ambos colocan la firma «Altazor AI» en una línea a su lado y «Tu asistente» debajo. Su [registro de procedencia](public/altazor/engraving-provenance.json) conserva el recurso de origen y la generación. El nombre y los estados siguen siendo HTML; la marca tiene nombre accesible cuando corresponde y las repeticiones decorativas se ocultan a las tecnologías de asistencia.

El historial precede al campo de mensaje. El ámbito se reconoce mediante RIT/ROL, enlaces, documentos o la causa abierta; las ambigüedades piden aclaración y los permisos se comprueban de nuevo. Enviar utiliza la conexión configurada y autorizada. Los pasajes pertinentes se recuperan automáticamente de fuentes accesibles y se verifican antes de usarlos; las referencias aparecen junto a la respuesta. Los archivos de la conversación y sus operaciones se agrupan bajo el campo. Plan, confirmación, ejecución, interrupción y resultado mantienen estados distintos. Memoria conserva grafo y lista accesible sobre los mismos recuerdos, con Propuesto y Confirmado legibles. Su preferencia por usuario en «Mi asistente» habilita recuerdos confirmados y recuperación de intercambios del mismo propietario y ámbito, con respaldos y permisos vigentes.

### Académico

Investigar, Escribir y Enseñar son recorridos de entrada con una acción para comenzar. Objetivo, Fuentes y Preparar ordenan el trabajo sin mostrar simultáneamente todas las herramientas. La hoja editable reúne estado de revisión, guardado, respaldos, descargas e incorporación a una causa accesible. Matriz, perfil y descubrimiento tienen accesos secundarios. Las relaciones bibliográficas se identifican como metadatos del índice; la apariencia del grafo no atribuye lectura del texto completo.

### Volumen, lector y escritura de causa

Cada libro real tiene enlace accesible, volumen decorativo, título completo y selección separada para fundamentar. El vacío muestra una única «vista previa de una encuadernación» y permite añadir el primer libro. Sólo un PDF cuyo original se conserva presenta selector e imagen de página física. EPUB y otros formatos usan sus localizadores reales. Cuando se conserva sólo TXT, la ficha declara «Original no conservado», ofrece el texto disponible y las citas identifican esa base de cotejo.

La mesa de escritura mantiene selección de fuentes, pasajes, editor y referencias. El escrito de causa conserva una hoja privada, guardado automático después de 900 ms sin edición y estados de pendiente, guardando, desconexión, error y conflicto. La revisión de versiones distingue el texto abierto antes de recuperarlo como un nuevo guardado. Exportaciones y guion de audiencia mantienen el alcance de los datos actuales; una descarga no se presenta como escrito presentado ni conclusión jurídica corroborada.

## Do's and Don'ts

### Do:

- **Do** conservar Sora, Barlow Condensed, Fraunces y las parejas de fondo y texto de ambos temas.
- **Do** usar la firma completa donde la palabra «LexOpen» se lea con claridad y el lector compacto donde el espacio sea reducido.
- **Do** mantener una conversación de ALTAZOR entre Inicio y el acompañante, con el trabajo principal visible.
- **Do** dar a Académico un espacio propio y revelar las herramientas secundarias dentro de cada tarea.
- **Do** mantener superficies opacas, foco visible y áreas pulsables principales de al menos 44 px.
- **Do** tratar las seis distribuciones como variantes de la misma biblioteca autorizada.
- **Do** conservar títulos completos, propiedad, permisos, estados y localizadores en texto HTML.
- **Do** distinguir original conservado, texto convertido, extracción parcial y metadatos bibliográficos.
- **Do** preservar la reorganización móvil y la respuesta estática con movimiento reducido.

### Don't:

- **Don't** aplicar madera, cuero o las preferencias de biblioteca al marco de las otras pantallas.
- **Don't** incorporar ilustraciones, logotipos o fuentes comerciales sin autorización de uso.
- **Don't** multiplicar asistentes o conversaciones independientes al abrir el acompañante.
- **Don't** usar mocks, miniaturas o capturas como contenido real de una colección o conexión.
- **Don't** atribuir páginas físicas a EPUB, TXT o un original no conservado.
- **Don't** presentar una comprobación de literalidad como verdad jurídica o autoría certificada.
- **Don't** rasterizar títulos, controles, pasajes, permisos o avisos de la interfaz.
- **Don't** añadir objetos ambientales de los mocks al espacio operativo de biblioteca.
