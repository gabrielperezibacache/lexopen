# Evidencia ficticia de la Mesa del asistente · 4 de noviembre de 2026

Las capturas muestran la interfaz real de LexOpen con una causa y un profesional ficticios. El segundo caso de navegador simula los eventos de ejecución y la promoción para comprobar los controles; esas capturas no prueban que Docker haya ejecutado un trabajo. El primer caso comprueba el preflight real con el ejecutor desactivado.

- `workbench-desktop.png`: viewport 1440×1000, captura de página completa con el cromo en su posición correcta.
- `workbench-mobile.png`: viewport 360×800, página completa; se comprobó ausencia de desbordamiento horizontal y acceso a descargas e incorporación.
- `docx-ficticio-preview.png`: render A4 en LibreOffice de un DOCX producido por la receta real sobre material ficticio, inspeccionado visualmente. No se ejecutó Docker para esa prueba local.

La pasada final de `e2e/workbench.spec.ts` terminó con 2 casos aprobados. También verificó que cambiar objetivo o pasajes retira el consentimiento remoto y que el trabajo preparado muestra su propio destino y versiones. Las pruebas de servicio sobre PostgreSQL nuevo comprobaron privacidad por propietario, alcance por causa, versiones y hashes, cancelación, interrupción y deduplicación de importaciones. El validador DOCX pasó diez pruebas unitarias entre ZIP/XML y límites del ejecutor, y la relación externa reproducida en revisión fue rechazada.

El smoke de Docker real y el render en CI tienen un flujo separado. Debe verificarse su resultado antes de afirmar ejecución de contenedores en la entrega. Estas capturas no acreditan producción, Windows real, un escritorio remoto ni una cuenta real de modelos.
