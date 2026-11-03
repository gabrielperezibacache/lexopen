# Catálogo y panel independiente de audiencias

## Mode

Operate. Extensión del mundo editorial de LexOpen: hereda Fraunces, Sora, tinta, papel, cobre y verde mar del marco existente. Este brief registra dos superficies del mismo recorrido; no amplía el sistema global.

## Outcome

Encontrar y retomar una mesa privada de audiencia desde una entrada propia. Cada mesa conserva su causa; el profesional puede preparar otra eligiendo un expediente autorizado y un nombre. Abrir el panel muestra el estado guardado y no inicia el tiempo de sesión ni activa el micrófono.

## Hierarchy

En `/audiencias`, «Audiencias en vivo» presenta el propósito y Preparar audiencia. La propiedad personal y Mi conexión Codex acompañan el contexto. Un registro editorial ofrece búsqueda por mesa, causa, RIT o tribunal; filtros por estado; y filas con título, causa, fecha en Chile, estado del tiempo y apertura directa. La preparación se despliega dentro del flujo, conserva los campos al cerrarse y remite a Agenda para fecha, hora y asuntos.

En `/audiencias/[workspaceId]`, la cabecera conserva causa, RIT, tribunal y regreso a Todas mis audiencias. El recorrido Expediente → Biblioteca → Audiencias → Escritos mantiene el contexto de causa y, cuando llega en la dirección, el escrito seleccionado. El organizador de mesas de esa causa y las grabaciones quedan en secciones plegables para dar prioridad a la intervención.

El panel independiente abre **En vivo**. Una única navegación adherida mantiene visibles sus siete herramientas —En vivo, Fuentes, Lectura, Notas, Conversación, Guion y Agenda— tanto en escritorio como en 360px. En móvil las etiquetas se reparten en varias filas; ninguna depende de descubrir un desplazamiento horizontal. En escritorio, el lector acompaña al cuaderno; en móvil, las herramientas alternan conservando los campos de trabajo.

Hora de Chile es un reloj civil identificado; Tiempo de sesión es el cronómetro manual de la audiencia. Sus etiquetas, ubicación y controles distinguen la hora actual de iniciar, pausar, reanudar o finalizar una sesión. La captura de audio conserva su selección y confirmación propias.

## States and continuity

La consulta presenta carga, catálogo, búsqueda sin resultados, colección vacía o error con reintento. Cambiar búsqueda o filtro no muestra filas anteriores como resultados actuales. Una creación sin respuesta confirmada exige revisar las mesas guardadas antes de habilitar otra; el éxito conserva un enlace de apertura además de la navegación al panel.

El panel reutiliza las reglas de guardado, recuperación, permisos y fuentes de `.impeccable/surfaces/hearing-workbench.md`. Seleccionar otra herramienta no descarta una nota o agenda en preparación. Los enlaces entre causa, biblioteca, audiencia y escritos preservan el escrito cuando existe ese contexto; el panel no crea un borrador al abrirse.

## Constraints

El catálogo sólo devuelve mesas del actor y causas accesibles por su permiso actual. Las mesas propias de una causa que perdió acceso no aparecen. La paginación se acota a cincuenta mesas por ventana; el selector muestra hasta cuarenta causas y explica cómo buscar otras. El estado de tiempo procede de la sesión guardada; no se inventan estadísticas de preparación ni de confianza.

Escritorio y móvil conservan controles de 44 píxeles, foco visible, ajuste de títulos y lectura sin desbordamiento. Las filas y divisores sostienen la lectura del catálogo; el formulario usa una superficie de papel acotada. Su apertura breve desaparece con movimiento reducido. Los estados de preparación, audiencia y cierre se nombran en texto; el verde mar orienta selección y enlaces sin sustituir esas etiquetas.

## Routes and sources

Rutas `/audiencias` y `/audiencias/[workspaceId]`; catálogo `/api/hearings`. Fuentes: `src/components/hearings/AudienceHub.tsx`, `audience-hub.css`, `HearingWorkbench.tsx`, `independent-hearing.css`, `src/components/causas/CaseWorkflowNav.tsx` y `src/lib/hearings/hub-types.ts`.

Evidencia visual: `audience-hub-desktop.png`, `audience-hub-mobile.png`, `live-desktop.png` y `live-mobile.png` en `docs/codex-audiencias-2026-11-02/`. Las capturas usan datos ficticios. La confirmación final muestra las siete herramientas completas en 360px tras corregir su ocultamiento móvil. Los ensayos de catálogo y audiencia comprueban el flujo de la aplicación; no acreditan una audiencia real ni la calidad de transcripción.
