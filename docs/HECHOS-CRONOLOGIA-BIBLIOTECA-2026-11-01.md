# Hechos, cronología, contradicciones y biblioteca

Entrega del 1 de noviembre de 2026. Rama `codex/case-knowledge-library`, sobre `codex/spaces-drive-official-sources` 13f8f20 ([PR 209](https://github.com/gabrielperezibacache/lexopen/pull/209)). Requiere las entregas anteriores de evidencia, PDF e investigación. Continúa el [plan de capacidades propias](PLAN-DESARROLLO-TRIFOLIA.md), sin cuentas, servicios ni API de TRIFOLIA. No incluye despliegue de un Host del estudio.

## Conocimiento del expediente

En **Causa → Hechos, cronología y contradicciones → Abrir conocimiento del expediente**, se pueden proponer hechos desde las fuentes preparadas o registrar una afirmación manual con un pasaje literal. La apertura es explícita para no verificar todos los originales cada vez que se carga la causa. Se incluyen documentos del expediente y archivos de espacios vinculados a esa causa que el profesional tenga permiso actual para consultar.

Cada hecho conserva afirmación, fecha literal, normalización, precisión, carácter inferido, estado, destacado y clave de comparación. Los estados son propuesto, revisado, descartado y oculto. La revisión exige un motivo y registra actor, fecha, versión anterior y posterior, cambios temporales y cambios de estado. «Revisado» expresa la decisión del profesional; no certifica una conclusión judicial. Una edición basada en una revisión anterior se rechaza con conflicto en lugar de sobrescribir una decisión nueva.

La extracción es local y conservadora, sin modelo ni consultas de red. Guarda propuestas, no conclusiones. El análisis retoma un cursor por versión y extractor; repetirlo no duplica el mismo pasaje. Si una fuente pasa de A a B y vuelve a A, añade la nueva referencia al hecho previo y conserva la afirmación, estado, fecha y revisión corregidos por la persona. Dos afirmaciones diferentes respaldadas por el mismo pasaje pueden registrarse separadamente.

## Cronología e incertidumbre

La cronología utiliza la fecha del acontecimiento contenida en la cita, nunca la fecha de subida. Conserva días, meses completos, años y rangos. Una expresión ambigua como `03/04/2025` permanece sin fecha normalizada; no se decide silenciosamente qué día ocurrió el hecho. Una normalización distinta de la lectura inequívoca de la fuente exige marcarla como inferida y explicar el motivo.

Las vistas separan los hechos con fecha normalizada de los hechos sin fecha o con expresión ambigua. Los hitos procesales ya registrados en la causa se muestran en un carril separado, con su procedencia PJUD, manual o importada; no se convierten automáticamente en hechos documentales revisados.

## Contradicciones revisables

Una contradicción enlaza dos hechos con sus citas verificadas y explica qué parece incompatible. Se pueden proponer diferencias de fecha, monto, actor, versión o afirmación. Las reglas automáticas de fecha y monto sólo comparan hechos a los que una persona asignó la misma clave de acontecimiento. Los montos requieren moneda y contexto temporal comparables; ante negaciones, magnitudes o períodos ambiguos, el extractor se abstiene.

La decisión distingue propuesta, discrepancia aparente, confirmada por revisión y descartada. Cada cambio conserva motivo, actor y versiones. Si cambia un hecho o su evidencia, se advierte que la revisión puede quedar desactualizada. La ausencia de información no se etiqueta como contradicción, y una etiqueta confirmada por el usuario no se presenta como conclusión jurídica automática.

## Citas y permisos actuales

El mismo verificador resuelve fuentes jurídicas, documentos del expediente y archivos del espacio. Antes de devolver conocimiento derivado comprueba el rol y permiso actual del usuario, el ámbito de causa o espacio, la cita literal, el hash del fragmento y del texto completo, las posiciones Unicode de origen, el hash de los bytes originales conservados y, en PDF, la página física. Un fragmento alterado, un original ausente o una página discordante no se presentan como respaldo válido. Copiar una cita y guardar una fuente en la biblioteca vuelven a comprobar su origen.

Las citas mantienen versión y enlace al lector. Las fuentes antiguas, extracciones parciales, OCR y aportes manuales muestran sus advertencias. La captura más reciente no acredita vigencia jurídica; una copia histórica no se actualiza silenciosamente. Las capturas heredadas sólo se consideran actuales si el archivo no fue modificado después de prepararlas.

La búsqueda filtra por permisos antes de aplicar términos y estados. No utiliza coincidencias con texto inaccesible para generar indicadores ni acepta un cursor que revele un hecho oculto. Si se revoca acceso al expediente o al archivo, también se impiden las siguientes lecturas de hechos, contradicciones, biblioteca e investigaciones derivadas. Los clientes del portal no reciben estas superficies internas. Los datos, cambios e historial se confirman con auditoría transaccional; un fallo de auditoría revierte la escritura.

## Biblioteca personal de fuentes

En **Jurisprudencia → Biblioteca**, cada profesional crea colecciones propias, con nombre y notas manuales. Una colección corresponde a fuentes jurídicas públicas, una causa o un espacio; su ámbito queda fijo al crearla. No hay colecciones compartidas ni invitaciones en esta entrega. Una colección pública no admite documentos privados.

**Guardar en biblioteca**, disponible junto a las citas y pasajes, conserva una versión completa de la fuente utilizando una cita verificada como ancla. Repetir el guardado de la misma versión no duplica la entrada. Cuando se prepara una versión nueva del documento, la colección conserva la versión elegida y señala su antigüedad. Retirar una entrada o eliminar una colección no modifica su documento original.

En **Jurisprudencia → Consultar**, se eligen colecciones para combinarlas con el corpus autorizado o consultar sólo la biblioteca seleccionada. La investigación utiliza las versiones exactas fijadas y verifica cada resultado final, no sólo el ancla de la colección. El historial conserva la selección y su huella. Retirar una fuente elegida, cambiar las notas o perder permisos impide recuperar una consulta cuyo alcance ya no coincide. Las notas son datos de revisión; no se ejecutan como instrucciones de un modelo.

## Límites explícitos

| Operación | Límite de esta entrega |
| --- | --- |
| Vista de hechos | Ventana de 400 hechos candidatos y 2.000 referencias verificadas; hasta 200 hechos autorizados por página |
| Cronología | Sólo hechos de la página autorizada dentro de esa ventana; no es inventario completo del expediente |
| Contradicciones mostradas | Hasta 100, con ambos hechos disponibles en la vista |
| Fuentes para análisis | Hasta 200 fuentes candidatas; filtrar por nombre para otras selecciones |
| Análisis incremental | Hasta 20 versiones, 200 fragmentos y 200 propuestas por ejecución; conserva cursor para continuar |
| Colecciones | Hasta 100 por persona y 200 versiones por colección |
| Selección para consulta | Hasta 10 colecciones y 200 entradas en total |
| Verificación del original | Lectura acotada a 25 MiB; texto de versión hasta 2 millones de caracteres |

Los límites y la cobertura parcial se informan en la interfaz. Repetir un análisis continúa el material pendiente; no implica que una sola ejecución haya revisado todo el expediente. La búsqueda sigue siendo literal y extractiva: no genera una síntesis jurídica, un grafo semántico ni una evaluación general de veracidad.

## Migración y comprobaciones

La migración aditiva `20261101220000_case_knowledge_and_library` lleva el esquema de 34 a **35** migraciones. Añade ocho tablas para hechos, citas, revisiones, contradicciones, cursor de análisis y biblioteca. No modifica los bytes de migraciones anteriores ni reescribe fuentes históricas. La eliminación de una causa con conocimiento asociado exige conservar y resolver esas relaciones antes de borrar su historia.

El [registro de validación](conocimiento-2026-11-01/VALIDACION.md) distingue las pruebas aprobadas de las pendientes y enlaza logs, capturas y hashes. El ensayo lógico 34→35 preservó todos los campos anteriores; la restauración conservó 89 tablas, 723 filas y 27 objetos, incluidos hechos revisados, contradicción, notas, versiones fijadas e imagen de página física. Una lectura posterior desde un proceso nuevo comprobó el código final de dominio y no cambió la base ni el almacenamiento. No es un ensayo físico del Host, vault, configuración, S3 ni OAuth real.

Para actualizar una instalación se debe detener el Host y sus workers, conservar un respaldo verificable de base, archivos y configuración, instalar dependencias, aplicar `prisma migrate deploy`, generar Prisma y compilar. Mantener Poppler/Tesseract para PDF y OCR. Después comprobar una cita histórica, una revisión de hecho y una colección fijada. No sustituir las migraciones por `db push`.

## Continuación

Este incremento abre F3 con flujos utilizables y conectados a F1/F2. Quedan pendientes instrucciones de expediente aplicadas a la asistencia con política explícita, revisión de contexto ante cambios de una fuente, colaboración de colecciones, relaciones entre entidades, evaluación jurídica sobre una muestra revisada y mediciones de escala en el Host objetivo. Continúan también las fuentes oficiales pendientes, redacción/Word, MCP propio y cartografía. No se declara completa F3 ni paridad con las 58 capacidades de referencia.
