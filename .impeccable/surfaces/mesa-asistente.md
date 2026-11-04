# Mesa del asistente por causa

## Mode and direction

Operate y Read. Extensión del mundo actual de preparación y escritos: papel continuo, filetes, Sora en controles, Fraunces en títulos y borrador, cobre para la acción principal y verde mar para fuentes y selección. No cambia DESIGN.md, las fuentes globales, el cromo ni la biblioteca material. No incorpora imágenes decorativas ni otra dirección visual.

## Outcome and hierarchy

Preparar un trabajo privado sobre una causa autorizada: objetivo, método, destino y selección explícita preceden a Preparar trabajo. El panel de resultado contiene ejecución, cancelación, eventos, texto, fuentes y archivos; la incorporación al escrito es una acción expresa de revisión. Los trabajos guardados permiten recuperar la mesa sin rehacer los inputs.

La ausencia del ejecutor se explica junto al enlace a la guía; no aparece como resultado completado. «Cuaderno de fuentes · sin IA» identifica la recopilación local, y «Propuesta de borrador · con mi IA configurada» identifica el destino real y la autorización de envío remoto. La cobertura anuncia ventanas de veinte pasajes, máximo de ocho seleccionados y abreviación de 3.000 caracteres.

## Built surface

- `/causas/[id]/mesa`: encabezado y navegación de causa en servidor; `src/components/workbench/CaseWorkbench.tsx` y `CaseWorkbench.css` implementan la mesa.
- El acceso nace de Preparar la causa y del recorrido compartido `CaseWorkflowNav`.
- `/ayuda/mesa-asistente` explica la preparación opcional del ejecutor y sus límites.
- Dos columnas hasta 1.000 px; en pantallas menores preparación y resultado se apilan. A 600 px acciones e historial se reorganizan. Inputs, selectores, botones y desplegables tienen foco visible y área de acción mínima de 44 px; el texto largo puede partirse para evitar desbordamiento.
- No se añade movimiento a esta superficie. Los eventos actualizan el estado accesible sin desplazar la lectura. La vista previa usa texto escapado y referencias con enlace, sin interpretar HTML del modelo.

## Evidence and limits

El test `e2e/workbench.spec.ts` conserva capturas de escritorio y móvil en su salida y marca el recorrido con eventos simulados como prueba de interfaz. La ejecución real de Docker tiene su smoke separado en CI. El registro de esta superficie describe lo construido; no acredita despliegue, Windows real ni conformidad WCAG completa.
