# Validación de sincronización automática OJV

Continuación de la [comprobación de accesos oficiales](../ojv-accesos-oficiales-2026-11-03/README.md), sobre `main@e2b57a34fafcc45f9f0a4e4a5f94324fc1f09a68`.

## Método

El diagnóstico ejecuta las funciones de LexOpen que registran la causa, importan Mis Causas, adquieren el trabajo, procesan la cola y guardan movimientos. No sustituye sus resultados por filas extraídas a mano. Usa PostgreSQL local recién creado, carpetas temporales privadas, sin usuarios del estudio, credenciales guardadas, proveedor alternativo, datos de demostración, caché ni descarga de PDFs. No inicia los programadores de la instalación habitual.

El caso público es **C-876-2022, 3º Juzgado Civil de Santiago**, identificado en una [publicación oficial de PJUD](https://www.pjud.cl/prensa-y-comunicaciones/noticias-del-poder-judicial/147149). El historial recuperado se limita al cuaderno seleccionado por el portal y las pestañas leídas; no acredita todos los cuadernos del expediente.

La comprobación autenticada requiere ingreso personal en una ventana temporal del proceso de LexOpen. No copia cookies del navegador habitual ni lee el almacén de credenciales. Limita la sincronización a una causa disponible en Corte Suprema. Los informes omiten identificadores y recuentos privados exactos. Esta comprobación no cubre la cartera completa ni otras materias.

## Resultado público real

La ejecución completa guardó **243 movimientos** en PostgreSQL y dejó los trabajos de cola completados. Una segunda consulta real, con caché desactivada, insertó **cero movimientos** y conservó el mismo recuento. No se descargaron documentos ni se utilizó la base del estudio. El [informe público](validacion-publica.json) registra la fecha y las comprobaciones; omite la huella de conexión de la base temporal.

## Resultado autenticado real

Después del ingreso personal del usuario, el conector leyó el listado y el detalle real de una causa de **Corte Suprema**. Pasaron la adquisición del trabajo, importación, procesamiento de cola y persistencia en PostgreSQL. Una nueva búsqueda y lectura del detalle en la misma sesión no creó otra causa ni duplicó movimientos. La sesión temporal se cerró al terminar. No se guardaron credenciales ni se descargaron documentos. El [informe autenticado](validacion-autenticada.json) contiene sólo las comprobaciones, sin identidades ni recuentos privados exactos.

El primer intento autenticado se detuvo antes de importar: la carga del módulo podía superar la espera fija de 700 ms. La corrección espera a que la materia seleccionada esté visible, con plazo acotado y comprobaciones de cancelación y avisos. Tras el nuevo ingreso manual, el recorrido completo y su repetición pasaron.

Al terminar ambas comprobaciones se detuvo el PostgreSQL temporal y se eliminaron sus datos, almacenamiento y secretos efímeros. Sólo se conservaron los informes proyectados de esta carpeta, sin información privada de expedientes.

## Correcciones derivadas de las pruebas

- La consulta pública no exige configurar un solver si no hay CAPTCHA visible.
- El listado espera una respuesta nueva y terminal; un indicador de carga o un cambio de pie de tabla no bastan.
- El detalle y sus pestañas esperan un historial reconocible; la cabecera de la causa no se convierte en movimientos.
- La selección de pestañas exige un destino dentro del detalle para evitar confundir enlaces documentales con navegación.
- Los comentarios HTML del portal no se interpretan como filas o celdas. En el historial público observado había celdas comentadas que desplazaban la columna de fecha; excluir sólo los comentarios permitió reconocer sus 124 movimientos.
- Las celdas ocultas conservan su posición vacía para mantener alineadas las columnas, sin incorporar su texto ni enlaces.
- Una sesión temporal procesa sólo los trabajos que acaba de encolar, de forma secuencial. Los trabajos ajenos en curso no se recuperan ni se marcan como completados por esa sesión.
- Volver del detalle a Mis Causas espera el cierre de su fondo, sin aceptar avisos del portal.
- Abrir Mis Causas espera la carga de la materia seleccionada; una respuesta AJAX demorada no se interpreta como ausencia de materias.
- Desactivar documentos bloquea tanto la descarga durante la consulta como el respaldo posterior, incluso si se solicita una importación forzada.
- La sesión temporal se cierra al finalizar, cancelar o vencer su plazo total de 30 minutos.

## Pruebas reproducibles

La suite de navegador usa páginas ficticias para reproducir respuestas demoradas, indicadores de carga, paneles ocultos, enlaces de anexos, avisos y regreso al listado. La integración en PostgreSQL verifica importación, cola, persistencia, repetición sin duplicados y aislamiento de trabajos con una fuente ficticia y sin red. Ninguna de estas pruebas, por sí sola, acredita la consulta real a OJV.

El diagnóstico real está documentado en la [guía PJUD](../PJUD.md#validación-de-la-sincronización-completa). `pjud:online` sigue siendo una prueba de conectividad y formularios.

Pasaron la suite general, las tres suites de navegador locales, la integración de la sesión y la cola en PostgreSQL, ESLint, TypeScript y la compilación de producción. La compilación conserva cuatro avisos previos de rastreo dinámico de archivos en `rate-limit.ts` y `storage.ts`.
