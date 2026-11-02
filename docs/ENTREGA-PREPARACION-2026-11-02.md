# Preparación integrada de causas · 2 de noviembre de 2026

Esta entrega desarrolla el primer tramo del [plan maestro de los 20 apartados](PLAN-MAESTRO-LEXOPEN-2026-11-02.md). La prioridad elegida es preparar causas, audiencias y escritos con fuentes dentro de LexOpen.

## Comportamiento disponible

- La ficha incorpora un índice de destinos reales y «Preparar la causa»: documentos, hechos, grabaciones, mesa privada y continuidad mediante minutas. Los próximos plazos conservan prioridad sobre este módulo. Los estados cuentan registros autorizados; no califican la suficiencia jurídica del expediente.
- El conteo de acciones abiertas aplica ahora la misma restricción de confidencialidad que las minutas. Las mesas de otros profesionales no entran en el contador personal. Las grabaciones deben conservar la correspondencia con su documento autorizado.
- «Llevar los hechos al escrito» descarga una hoja Markdown y una cronología CSV. Ambas incluyen título/RIT de la causa, fecha de generación, alcance y referencias. Se repiten el control de permisos, la comprobación del texto y la integridad del material conservado al descargar.
- El guion de intervención permite elegir y ordenar hasta veinte notas, añadir apertura y petición propias y descargar TXT con referencias numeradas. Una nota modificada, ajena o con fuente revocada impide su exportación. No llama a IA ni añade contenido por su cuenta.
- Los lectores de evidencia y audiencia recuperan automáticamente una ocupación transitoria del motor PDF: hasta dos reintentos a 500/1000 ms, cancelables al cambiar de página. No reintentan errores de autorización o de integridad y mantienen la recuperación manual al agotarse el límite.

## Alcance de las salidas

La hoja y el CSV contienen **los hechos activos de la página y los filtros actuales**, dentro de los presupuestos de verificación existentes. Las fechas ambiguas conservan su expresión e incertidumbre; los hechos sin fecha no reciben una fecha de carga. Los descartados y ocultos quedan fuera. El archivo declara si hay más páginas, si se alcanzó un límite o si parte del conocimiento dejó de estar autorizada. No representa un inventario completo.

Se mantienen las advertencias de extracción parcial, revisión posterior, original no conservado y transcripción TXT. Cotejar una transcripción no acredita su fidelidad al audio ni la exactitud de sus marcas de tiempo. Las citas no se presentan como certificación del razonamiento, la vigencia ni la autenticidad de una fuente manual.

La apertura, el cierre y el orden del guion se conservan temporalmente en pantalla y se descargan para guardarlos. Las notas y sus citas siguen persistidas. Un editor común de causa con historial y recuperación del borrador es la siguiente iteración del plan; no se simula esa persistencia aquí.

## Diseño construido y revisión

Se extiende el sistema existente: Fraunces para títulos, Sora para operar, papel, tinta, cobre y verde mar. El panel usa introducción lateral y lista editorial continua separada por filetes; los enlaces remiten a las secciones, sin ocultarlas. El folio geométrico es propio de LexOpen. Los seis ambientes de biblioteca y sus libros de cuero permanecen en su superficie.

Las instrucciones principales son de 16 px; los controles conservan altura de 44 px. Las aperturas y los destinos responden a acciones del usuario y respetan movimiento reducido. La revisión visual independiente solicitó ampliar la prosa del panel; después de corregirla y recapturar escritorio/360 px, su veredicto fue **ship**, sin hallazgos materiales abiertos en esa corrección. No equivale a certificar toda la aplicación ni a una auditoría completa de accesibilidad.

| Hallazgo de revisión | Resultado |
| --- | --- |
| Prosa funcional del panel de preparación demasiado pequeña | Resuelto: instrucciones y alcance a 1rem; composición y controles conservados en escritorio y móvil |

El hook de diseño se ejecutó durante las ediciones. Se corrigieron los tamaños nuevos fuera de escala. Los avisos restantes de tamaños menores pertenecen a reglas previas de metadatos, pestañas y controles en knowledge/hearings; se conservaron por su función contextual, sin añadir supresiones. La sincronización del registro auxiliar de diseño previo se mantiene como tarea documental separada.

Capturas con **datos ficticios**, tomadas del navegador:

- [Preparación en escritorio](preparacion-2026-11-02/preparation-desktop.png) y [en móvil](preparacion-2026-11-02/preparation-mobile.png).
- [Salida al escrito en escritorio](preparacion-2026-11-02/preparation-export-desktop.png) y [en móvil](preparacion-2026-11-02/preparation-export-mobile.png).
- [Guion en escritorio](preparacion-2026-11-02/hearing-brief-desktop.png) y [en móvil](preparacion-2026-11-02/hearing-brief-mobile.png).

## Verificación

Los registros y sus huellas se conservan en [preparacion-2026-11-02](preparacion-2026-11-02/verification.json). Se usaron dos bases locales desechables separadas, sin datos del estudio: una para integración y otra para navegador.

- Suite unitaria aprobada; pruebas nuevas de Markdown/CSV, fechas inciertas, avisos, neutralización de fórmulas y recuperación PDF aprobadas.
- Suite completa de integración aprobada. Incluye originales alterados, permisos retirados, privacidad de bibliotecas/colecciones, historial, audio, audiencias y citas.
- Suite completa Chromium: **43 pruebas aprobadas**, sin reintentos, en 2,1 minutos. El flujo conjunto incluye sentencia PDF/OCR compartida, grabación/transcripción citada, audiencia y revocación; fuerza además una respuesta 429 para comprobar la recuperación del lector.
- Tras la corrección tipográfica: prueba afectada aprobada en 2,9 segundos con nuevas capturas de escritorio y móvil.
- ESLint y TypeScript aprobados. Compilación de producción aprobada; conserva cuatro advertencias previas sobre trazado de acceso dinámico al sistema de archivos en almacenamiento y límites de acceso.

Los primeros ensayos detectaron falta de Poppler en el equipo y una configuración incompleta de la base de integración. Se preparó el motor local y se repitió la suite en una base vacía, conforme a su contrato. No se modificaron las comprobaciones para ocultar esos fallos. La retirada de fuentes se prueba con archivos ficticios; no hubo una nueva consulta al PJUD/BCN ni reconocimiento real de voz de un proveedor en esta entrega.

La integración de GitHub se acredita por el estado final del PR y sus comprobaciones, no por habilitar una futura fusión. La instalación y publicación en el Host del estudio requieren su propio ensayo operativo; no se declaran realizadas por compilar o probar localmente.
