# Preparación de causa y continuidad al escrito

## Mode

Operate y Read. Continuación de la dirección clásica y editorial de LexOpen: Fraunces, Sora, cobre, verde mar, papel y tinta. El índice, los filetes y `FolioSymbol` amplían el lenguaje existente. No se incorporan fotografías en esta etapa ni se cambia la marca. Las seis distribuciones de biblioteca conservan su ámbito de cuero y madera.

## Outcome

Continuar el trabajo propio del profesional dentro de una causa autorizada: reunir el expediente, ordenar hechos, contrastar grabaciones, preparar una audiencia y conservar seguimiento. La integración construida prioriza causas, audiencias y la preparación de escritos mediante fuentes accesibles y archivos descargables. Una descarga es material de trabajo; no equivale a presentar un escrito.

## Hierarchy

El índice del expediente precede a «Preparar la causa». La introducción explica el recorrido y su alcance; las filas presentan tarea, instrucción, estado guardado y una acción hacia documentos, hechos y fuentes, grabaciones, mesa de audiencia o minutas. «Escribir con fuentes» enlaza al editor privado de la causa cuando existe el permiso correspondiente. El recorrido compartido reúne Expediente, Biblioteca, Audiencias y Escritos, con causa y destino visibles; en móvil se organiza en dos columnas con controles de al menos 44 píxeles.

En hechos y fuentes, «Llevar los hechos al escrito» abre una hoja de trabajo con descarga Markdown y cronología CSV. En la mesa de audiencia, «Guion de intervención» separa apertura, selección de notas, orden y petición de cierre. El respaldo enlazado y la observación del profesional permanecen identificados por texto.

## Built routes and sources

| Superficie o comportamiento | Ruta o fuente construida |
| --- | --- |
| Preparación e índice de expediente | `/causas/[id]`; `src/components/causas/CasePreparation.tsx` y `src/components/causas/CasePreparation.css`. |
| Lectura autorizada y recuentos | `src/app/(app)/causas/[id]/page.tsx`. |
| Destinos dentro del expediente | `#preparacion`, `#ficha`, `#conocimiento`, `#documentos`, `#audios`, `#minutas`, `#plazos`, `#tramites` y `#actividad`; conocimiento y grabaciones dependen del permiso de uso. |
| Continuación hacia audiencia y borrador | `/biblioteca?causa=[id]`, `/causas/[id]/audiencias` y `/causas/[id]/escritos`. El contexto de biblioteca se autoriza en servidor. |
| Desplegable de hoja y CSV | `src/components/knowledge/CasePreparationExport.tsx`; sus estilos están en `src/components/knowledge/knowledge.css`. |
| Descarga de hechos y cronología | `GET /api/causas/[id]/knowledge/export`; `src/app/api/causas/[id]/knowledge/export/route.ts`, `src/lib/knowledge/export.ts` y `src/lib/knowledge/export-render.ts`. |
| Composición del guion | `src/components/hearings/HearingBrief.tsx` y `src/components/hearings/hearings.css`. |
| Comprobación y generación del guion | `POST /api/causas/[id]/hearings/[workspaceId]/brief`; `src/lib/hearings/service.ts` y `src/lib/hearings/brief.ts`. |
| Gráfica propia compartida | `src/components/ui/FolioSymbol.tsx`, variante `evidence`. |

## Constraints

Los recuentos proceden de los datos accesibles del usuario: documentos y texto extraído, minutas y acciones abiertas, mesas privadas de su propiedad y grabaciones autorizadas. Las grabaciones se acotan a una selección de hasta doscientas y se indica «Selección de» cuando la consulta detecta más. «Con transcripción registrada» describe el registro guardado; no confirma su fidelidad a la grabación. Estos estados nunca sustituyen abrir la fuente, revisar su contenido y valorar su alcance jurídico.

Markdown y CSV usan una lectura nueva de conocimiento con los filtros actuales de búsqueda, estado y cursor. Se exportan sólo hechos activos de esa página; descartados y ocultos quedan fuera. Markdown conserva hechos, respaldo y contradicciones activas entre los hechos incluidos; CSV dedica una fila a cada cita de apoyo y mantiene fechas inciertas, estado de revisión y alcance. Los archivos declaran los límites de página y verificación, y que no son un inventario completo ni una conclusión judicial. Los enlaces relativos requieren acceso vigente a LexOpen. La comprobación ocurre al generar la descarga; acceso y fuentes pueden cambiar después.

El guion acepta hasta veinte notas disponibles, ordenables y retirables. Apertura y cierre son texto propio; las notas con pasaje mantienen referencias numeradas y las personales declaran ausencia de respaldo de fuente. Antes de descargar se comprueban acceso, disponibilidad y revisión de las notas: una nota ajena, cambiada, eliminada o revocada detiene la exportación. El archivo `guion-intervencion.txt` se genera sin llamar a IA. Apertura, cierre y orden permanecen sólo en esta pantalla hasta cambiar de mesa o recargar; la descarga permite conservarlos.

## Layout and motion

Preparación usa dos columnas con introducción y pasos. A 1120 píxeles cada acción pasa debajo del paso; a 800 píxeles la composición se apila y el índice conserva sus enlaces en varias líneas. La prosa de preparación y los párrafos de instrucciones de hoja y guion usan un rem. Estados y metadatos mantienen una escala auxiliar. Las acciones de preparación y los controles de orden del guion ofrecen un mínimo de 44 píxeles; los controles móviles de audiencia se reorganizan a 760 píxeles.

La flecha responde al puntero o foco mediante un desplazamiento mínimo (180 ms); la hoja y el guion se abren con movimiento de folio (180 ms). Los destinos enlazados reciben una señal de llegada (650 ms), con margen superior para la cabecera. Son respuestas a interacción del usuario. `prefers-reduced-motion` elimina estos movimientos y conserva el acceso al contenido.

## Evidence and limits

Capturas de la implementación registradas en `docs/preparacion-2026-11-02/`:

- `preparation-desktop.png` y `preparation-mobile.png`.
- `preparation-export-desktop.png` y `preparation-export-mobile.png`.
- `hearing-brief-desktop.png` y `hearing-brief-mobile.png`.

El registro recoge lo construido y sus fuentes concretas. Las capturas no acreditan publicación en producción ni una evaluación completa de conformidad WCAG.
