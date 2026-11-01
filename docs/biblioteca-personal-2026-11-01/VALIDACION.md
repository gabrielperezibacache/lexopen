# Validación de la biblioteca personal

Fecha: 1 de noviembre de 2026. [Descripción funcional](../BIBLIOTECA-PERSONAL-2026-11-01.md). Todos los usuarios, libros y documentos del ensayo son ficticios. Bases y almacenamiento locales separados de una instalación del estudio. No hubo despliegue ni uso de materiales reales.

## Resultados conservados

| Comprobación | Resultado y alcance | Registro |
| --- | --- | --- |
| Unidades completas, base 37 | PASS, salida 0 confirmada por el ejecutor principal; PDF/OCR estricto, formatos, recuperación y validación del borrador | [Unidades](logs/units.log) |
| TypeScript, base 37 | PASS, salida 0 confirmada por el ejecutor principal | [Tipos](logs/types.log) |
| Lint, base 37 | PASS, salida 0 confirmada por el ejecutor principal | [Lint](logs/lint.log) |
| Integración PostgreSQL completa, base 37 | PASS, salida 0 confirmada por el ejecutor principal; incluye las suites anteriores, libros y RAG | [Integración](logs/integration.log) |
| Vinculación de páginas PDF | PASS, salida 0 confirmada por el ejecutor principal; texto global, rango local, páginas y falsificación coherente | [Regresión PDF](logs/pdf-page-binding.log) |
| Etiqueta canónica de página | PASS, salida 0 confirmada por el ejecutor principal; corromper sólo la etiqueta no cambia la página física de la cita ni de la exportación | [Etiqueta PDF](logs/pdf-page-label.log) |
| Primer recorrido dirigido de navegador | PASS, salida 0; 18 capturas, anterior a la corrección final de tres problemas de interfaz | [Primer navegador](logs/browser-first.log) |
| Actualización 35→37 | PASS para migraciones, drift y conservación de todas las columnas, filas y hashes de 89 tablas anteriores | [Actualización y primera comparación](logs/upgrade-first-service-comparison.log) |
| Restauración lógica y lectura con proceso nuevo | PASS, salida 0; 97 tablas, 761 filas y 30 objetos exactos; libros, referencias, preferencias, permisos, borrador y PNG de página 2 | [Lectura final](logs/restore-final.log) |
| Compilación, base 37 | PASS, salida 0 confirmada por el ejecutor principal | [Compilación](logs/build.log) |
| Migración y esquema productivo ficticio | PASS, salida 0; 37 migraciones aplicadas y sin diferencias con Prisma | [Migraciones](logs/production-migrations.log), [esquema](logs/schema-drift.log) |
| Servidor compilado con controles normales, base 37 | PASS, salida 0; cuatro formatos, seis distribuciones, PDF físico, escritura citada y denegaciones | [Producción local](logs/production.log) |
| Suite completa de navegador, base 37 | PASS, salida 0 confirmada por el ejecutor principal: 35 pruebas, 1,7 minutos; anterior a la ampliación opcional de conversión | [Navegador base 37](logs/browser-schema37.log) |
| Conversión y conservación opcional, dominio 38 | PASS, salidas 0 confirmadas por su ejecutor: compatibilidad previa, nuevos hashes y base de contraste, preferencias y TXT | [Conversión](logs/conversion-domain-integration.log), [libros previos](logs/conversion-existing-books.log), [RAG previo](logs/conversion-existing-rag.log), [unidades](logs/conversion-rag-unit.log), [tipos](logs/conversion-types.log), [lint](logs/conversion-lint.log) |
| Actualización 37→38 y restauración final | PASS, Python y proceso Node nuevo con salida 0; 97 tablas, 783 filas y 32 objetos exactos, incluyendo las dos bases de contraste | [Restauración 38](logs/conversion-upgrade-restore.log) |
| Suite completa 38 anterior al ajuste de compensación | PASS, salidas 0 confirmadas por el ejecutor principal; se conserva como base previa, separada de las regresiones del ajuste | [Unidades](logs/units-schema38-precleanup.log), [integración](logs/integration-schema38-precleanup.log), [tipos](logs/types-schema38-precleanup.log), [lint](logs/lint-schema38-precleanup.log) |
| Compensación de importaciones fallidas o concurrentes | PASS, salidas 0; cinco regresiones PostgreSQL, borrado limitado al intento propio y transporte S3 SDK de prueba | [Compensación](logs/conversion-attempt-cleanup.log), [almacenamiento](logs/conversion-attempt-storage.log), [tipos](logs/conversion-attempt-types.log), [lint](logs/conversion-attempt-lint.log) |
| Lectura restaurada con código final de compensación | PASS, Node y ejecutor con salida 0; los mismos 97/783/32 exactos, sin repetir importación ni migración | [Lectura actual](logs/conversion-current-code-read.log), [módulos](logs/conversion-current-domain.json), [tablas](logs/conversion-current-table-hashes.json) |
| Recorrido dirigido de conversión 38 | PASS, salida 0; seis capturas de opciones, preferencias y lector de texto retenido en escritorio/móvil | [Conversión en navegador](logs/conversion-browser.log) |
| Compilación, tipos y lint finales 38 | PASS, salidas 0 posteriores a la corrección de compensación | [Compilación](logs/build-schema38-final.log), [tipos](logs/types-schema38-final.log), [lint](logs/lint-schema38-final.log) |
| Dominio final 38 | PASS, salida 0; regresiones de libros, RAG y conservación con el código actual | [Dominio](logs/domain-schema38-final.log) |
| Servidor compilado final 38 | PASS, salida 0; cuatro formatos, seis distribuciones, TXT sin original, citas y controles normales | [Producción final](logs/production-schema38-final.log) |
| Regresión completa de navegador 38 | PASS, salida 0 confirmada por el ejecutor principal: 36 pruebas, 1,8 minutos, con base nueva y código final de biblioteca | [Navegador final](logs/browser-schema38-final.log) |
| CI remoto | Pendiente al registrar la evidencia local | [Acciones de la rama `codex/personal-law-library`](https://github.com/gabrielperezibacache/lexopen/actions?query=branch%3Acodex%2Fpersonal-law-library) |

Los estados de salida proceden de resultados confirmados del ejecutor. Un archivo de tipos vacío no demuestra por sí mismo una ejecución correcta. Las excepciones de auditoría de las suites son fallos sintéticos inyectados para comprobar que no quedan escrituras parciales.

Después de la suite local de 36 recorridos se aplicó una corrección acotada de navegación: Biblioteca utiliza la lista canónica de roles del estudio para mostrar el acceso también a los profesionales ya autorizados por la API. No cambió la política de acceso a fuentes. TypeScript y lint se ejecutaron de nuevo y terminaron con salida 0; la comprobación remota del commit publicado incluye esa versión de la navegación.

El [manifiesto de registros](logs/manifest.json) guarda hash y tamaño de cada origen y copia normalizada. Se eliminan códigos de color y espacios finales y se sustituyen rutas locales; los originales permanecen intactos en los temporales del ensayo.

La [huella de código y recursos](CODIGO.sha256) identifica los archivos de aplicación, pruebas, configuración, esquema, migraciones y texturas públicas cambiados en esta entrega. Excluye documentación y el registro del sistema visual para que su edición no se confunda con un cambio del código probado.

El ensayo compilado mantuvo autenticación y CSRF normales, con una base y almacenamiento ficticios. Importó TXT, EPUB, DOCX y PDF; recuperó el original y la imagen física de página 2; conservó las seis preferencias de distribución; denegó la edición a un lector y la recuperación de derivados tras revocar acceso. Tres peticiones JSON enviadas por partes que excedían sus límites devolvieron 413 y la ausencia de CSRF devolvió 403. El modo IA recorrió el transporte HTTP real de `askLlm` hacia un servidor compatible de prueba en loopback: dos peticiones, una respuesta estructurada válida y otra con cita inventada rechazada. Una búsqueda vacía no llamó al modelo. Es una comprobación de integración y controles, no una medición de calidad de un modelo vivo ni un envío a un proveedor remoto.

El ensayo HTTP final 38 repitió esos recorridos con el código de compensación actual y añadió un PDF con OCR convertido a sólo TXT: original no disponible con 410, imagen PDF denegada, descarga de texto con hash exacto, citas con base `retained_text` y notas sin afirmar cotejo contra un original omitido. También conservó los originales y sus hashes cuando esa opción se eligió. La IA hizo dos peticiones HTTP al proveedor compatible de prueba, sin presentar ese transporte como evaluación de un modelo vivo.

## Actualización y restauración

La fuente ficticia de 35 migraciones se abrió con `default_transaction_read_only=on`: **89 tablas, 723 filas y 27 objetos**. Los destinos `lexopen_books_upgrade_test` y `lexopen_books_restore_test` no existían antes del ensayo. Se crearon de nuevo sin reiniciar ni eliminar ninguna base existente.

Después de copiar la fuente, se aplicaron las migraciones 36 y 37. Cada valor de cada columna histórica conservó su representación SQL JSON exacta y su hash de fila. La única diferencia en tablas anteriores fue añadir dos filas a `_prisma_migrations`. Las ocho tablas de biblioteca estaban inicialmente vacías y el esquema migrado coincidió con Prisma. Los 37 checksums de migración coincidieron con el repositorio.

La nueva fixture incorporó tres profesionales ficticios y tres originales TXT, EPUB y PDF; encuadernación de cuero, ficha, lomo, estante y favorito; dos preferencias independientes (`salon/night/spines` y `archivo/oak/covers`); una colección de lectura compartida; un borrador manual con pasajes y exportación, y un historial compartido invalidado por una retirada anterior de acceso. Volver a compartir lectura no rehabilitó silenciosamente aquel historial antiguo.

El dump lógico y la copia de archivos se restauraron en el segundo destino. Se compararon **97 tablas, 761 filas y 30 objetos**, con todos los hashes y tamaños idénticos. Un proceso Node nuevo importó cinco módulos actuales y registró sus SHA-256. El verificador de libro fue `9e1800fecad6e4181abd68cd12a798bc54277b8a2fda9e0ffc33217d34020bcd`.

La lectura nueva conservó exactamente la propiedad y lectura compartida, ficha y aspecto, colecciones, preferencias, prosa y revisión, citas, bibliografía, hash del original y exportación. La cita EPUB conservó sección 2 y página nula; la PDF conservó página física 2, texto, referencia e imagen PNG idéntica. Los accesos de un tercero a los libros, originales, colección y borrador devolvieron 404. El historial retirado devolvió 404 y una lista con sólo su identificador opaco. Tres revisiones antiguas devolvieron 409 y una edición por el lector devolvió 404.

Se compararon de nuevo todas las tablas y objetos antes y después de esas lecturas y denegaciones: no hubo escrituras, llamadas de red ni uso de modelo. La fuente de 35 migraciones también siguió exactamente igual. Los dumps, descriptores y copias ficticias se conservan bajo el directorio temporal del ensayo.

Se incluyen los [hashes y recuentos por tabla y objeto](logs/table-object-hashes.json) y el [descriptor de lectura del proceso nuevo](logs/restored-domain-read.json). Los conjuntos de filas de las tablas se comparan como texto SQL ordenado, sin perder precisión numérica ni fechas; los archivos se comparan por ruta, tamaño y SHA-256.

## Incidencias del adaptador de pruebas

El primer intento renombró por error la ruta del almacenamiento de origen al adaptar el ensayo anterior. Se detuvo antes de crear bases. Se corrigió únicamente la ruta del script temporal; el [registro inicial](logs/upgrade-setup-attempt.log) permanece disponible.

El siguiente intento completó actualización y restauración exactas, pero comparó como listas ordenadas los identificadores de libros de una colección. Las entradas creadas juntas tenían la misma fecha; el mismo conjunto podía leerse en otro orden después del restore. El adaptador final compara `bookIds` y `memberIds` como conjuntos ordenados y conserva la comparación exacta de todas las filas de base, textos, citas, archivos y demás valores. No se modificaron aplicación, bases ni archivos para obtener el resultado aprobado. El intento original y el resultado final están registrados por separado.

Este es un ensayo lógico de PostgreSQL y archivos locales, con servicios de dominio y render real de una página PDF. No comprueba respaldo físico del Host, vault, configuración, S3, OAuth, un modelo de producción ni un reinicio HTTP compilado sobre la base restaurada.

## Ampliación final: actualización 37→38

Se mantuvo el primer ensayo como fuente ficticia de 37 migraciones con libros activos: **97 tablas, 761 filas y 30 objetos**. Los destinos nuevos `lexopen_books_conversion_upgrade_test` y `lexopen_books_conversion_restore_test` no existían antes de crearse. No se reinició ni eliminó ninguna base de los ensayos anteriores.

La migración 38 conservó exactamente cada valor histórico, proyectando todas las columnas anteriores para calcular hashes de filas. Sólo añadió una fila de migración y nueve columnas. Los [valores iniciales](logs/conversion-defaults.json) se comprobaron expresamente: tres libros con `originalRetained=true`, `convertedToText=false`, hashes y tamaños nuevos nulos y metadatos de conversión vacíos; dos preferencias con conversión desactivada, conservación del original activada y umbral 10. Los originales, citas guardadas sin campos nuevos, identificadores de fuente, prosa y revisión de los borradores previos y las distribuciones personales siguieron utilizables. La imagen histórica de página física 2 mantuvo su hash exacto.

La fixture final añadió dos profesionales ficticios, un PDF con OCR convertido a sólo texto y un EPUB convertido conservando su original. Para la entrada PDF se comprobó que el archivo retenido era exactamente el texto UTF-8 preparado, con SHA-256 propio, sin original binario en su directorio de almacenamiento, sin páginas físicas guardadas ni imagen del PDF. Descargar su original devolvió 410; solicitar la imagen devolvió 404. Sus citas tenían página nula, `verificationBasis=retained_text` y notas que identificaban el TXT como respaldo. La huella del archivo recibido se conservó como procedencia. El EPUB mantuvo bytes originales, hash, secciones y base de contraste `original`.

Se conservaron la lectura compartida explícita, dos borradores con las bases de contraste correspondientes y sus exportaciones, además de preferencias de conversión activada, original omitido por defecto y umbral 1 para el nuevo propietario. El lector autorizado pudo consultar el TXT; un tercero no obtuvo libros, texto ni borradores.

El respaldo y restauración final compararon **97 tablas, 783 filas y 32 objetos**, con todos los campos y hashes exactos. Un proceso Node nuevo, PID 63498, importó los cinco módulos congelados y volvió a comprobar libros anteriores y nuevos, original o texto retenido, citas, hashes, prosa, bibliografía, exportaciones, preferencias y permisos. Una edición con revisión incorrecta devolvió 409. Todas las tablas y archivos siguieron iguales después de las lecturas y denegaciones; no se usó red ni modelo. La fuente de 37 migraciones también permaneció intacta.

Se conservan el [registro completo](logs/conversion-upgrade-restore.log), los [hashes por tabla y objeto](logs/conversion-table-object-hashes.json) y el [descriptor del proceso nuevo](logs/conversion-restored-domain-read.json). Los 38 checksums de migración coincidieron con el repositorio y la comprobación de esquema devolvió salida 0. El verificador de ese ensayo fue `46c58249b38f0eacd05241fbeac107e9faf38d0232d1bf80e7d92d0860123b44`. Las revisiones posteriores se acreditan por separado, sin atribuir los hashes anteriores al árbol final.

Después de corregir la compensación de intentos de importación, se repitió únicamente la lectura de la restauración existente desde otro proceso nuevo. Se incorporó el hash del almacenamiento a los cinco módulos de dominio y se verificó el servicio final `00d2b3bbeb871bf1562bb78add7f66dd8310fdd9ee8ac2d7b8c5b8b3db8b285c`. No se crearon fuentes, bases ni migraciones adicionales. Todas las tablas, 783 filas y 32 objetos, valores recuperados y denegaciones volvieron a coincidir. La fuente 37 siguió intacta. El [registro final](logs/conversion-current-code-read.log) y sus [hashes](logs/conversion-current-domain.json) identifican el proceso y código usados.

Estos resultados acreditan recuperación lógica local y compatibilidad de fuentes previas, no un despliegue, respaldo físico ni calidad semántica de la IA. Omitir el original es una decisión para una importación nueva; la migración no elimina originales previos y las referencias no fingen cotejarlos cuando sólo se retuvo texto.

## Revisión y alcance

La revisión independiente del servidor encontró que una cita PDF podía aceptar una página con texto coherentemente alterado sin reconstruir su relación con el libro completo. Se corrigió validando las páginas ordenadas, sus hashes, el texto global, posiciones locales y globales y la etiqueta física canónica. Las regresiones de falsificación de texto, página, rangos y etiqueta aprobaron.

La ampliación de conversión recibió además una revisión de la conservación durante importaciones concurrentes: un intento que perdía la transacción frente a otra opción de conservación podía dejar un archivo sin referencia. Se corrigió asignando una ruta única por intento y compensando sólo sus objetos cuando la transacción falla o reutiliza un ganador. Las regresiones verifican carreras con opciones opuestas, fallo de auditoría, repetición con las mismas opciones, escrituras parciales y fallo explícito de compensación. El ayudante de borrado rechaza rutas ajenas, históricas o inseguras y comprueba el transporte S3 mediante un servidor SDK de prueba. Si la infraestructura impide compensar una escritura, se devuelve un error 503 con las dos causas para que el Host pueda reparar el intento; no se declara una importación correcta. La lectura final de la restauración, descrita arriba, confirma el código actual sin alterar los datos recuperados. El revisor independiente confirmó el hallazgo resuelto por inspección del código y de las cinco regresiones aprobadas.

La primera revisión de interfaz encontró tres problemas: títulos extensos recortados, la vista Archivo no respetaba los lomos solicitados y el lector no facilitaba llevar el libro a la mesa de escritura. Se corrigieron en un lote: títulos completos legibles en catálogo con ajuste de portada, lomos respetados en Archivo y una acción que lleva el volumen a la mesa de escritura con el libro ya elegido. El revisor independiente confirmó los tres puntos resueltos y revisó las seis vistas de conversión sin nuevos problemas materiales. La revisión visual quedó cerrada; no se siguieron generando rondas de pulido.

El detector se ejecutó una sola vez. Sus [tres avisos](logs/design-scan.json) corresponden a las miniaturas geométricas de distribución, no a acentos laterales de tarjetas. El resultado no sustituye la revisión visual ni una auditoría de accesibilidad completa.

La recuperación es léxica BM25. La comprobación de identificadores, literalidad, integridad y página no valida semánticamente toda la prosa de un modelo ni acredita vigencia jurídica. No se midió calidad sobre un conjunto jurídico revisado, rendimiento de bibliotecas grandes, funcionamiento en dispositivos físicos ni todas las variantes de los formatos declarados.

## Capturas finales de la biblioteca

El [manifiesto de capturas](capturas/final38/manifest.json) identifica 24 vistas de interfaz de la ejecución final de 36 pruebas y una imagen de página física recuperada con el código final después del restore. Las capturas anteriores se sustituyen por esta tanda; se conservan sus manifiestos históricos en los registros. Las vistas de interfaz usan Chromium de escritorio de 1366×900 y emulación móvil de 360×800; no representan dispositivos físicos.

- [Mesa](capturas/final38/books-mesa-desktop.png) y [mesa móvil](capturas/final38/books-mesa-mobile.png).
- [Estantes](capturas/final38/books-estantes-desktop.png) y [estantes móvil](capturas/final38/books-estantes-mobile.png).
- [Gabinete](capturas/final38/books-gabinete-desktop.png) y [gabinete móvil](capturas/final38/books-gabinete-mobile.png).
- [Galería](capturas/final38/books-galeria-desktop.png) y [galería móvil](capturas/final38/books-galeria-mobile.png).
- [Archivo](capturas/final38/books-archivo-desktop.png) y [archivo móvil](capturas/final38/books-archivo-mobile.png).
- [Salón](capturas/final38/books-salon-desktop.png) y [salón móvil](capturas/final38/books-salon-mobile.png).
- [Lector](capturas/final38/books-reader-desktop.png) y [lector móvil](capturas/final38/books-reader-mobile.png).
- [Escritura](capturas/final38/books-writing-desktop.png) y [escritura móvil](capturas/final38/books-writing-mobile.png).
- [Biblioteca vacía](capturas/final38/books-empty-desktop.png) y [vacía móvil](capturas/final38/books-empty-mobile.png).
- [Página física 2 restaurada](capturas/final38/restored-physical-page2.png).

## Capturas finales de conversión

Entre las [24 vistas finales](capturas/final38/manifest.json), seis documentan las opciones de conversión, preferencias y lector de texto retenido. El conjunto incluye también una imagen restaurada de PDF. Documentan la diferencia de respaldo sin presentar una cita de TXT como cotejo contra un original omitido.

- [Opciones al importar](capturas/final38/conversion-options-desktop.png) y [opciones móvil](capturas/final38/conversion-options-mobile.png).
- [Preferencias personales](capturas/final38/conversion-preferences-desktop.png) y [preferencias móvil](capturas/final38/conversion-preferences-mobile.png).
- [Lector de texto retenido](capturas/final38/conversion-reader-desktop.png) y [lector móvil](capturas/final38/conversion-reader-mobile.png).
