# Revisión de uso de LexOpen

Se revisaron las entradas habituales con profesionales y clientes ficticios, en escritorio y a 360 px. Las pruebas cubrieron navegación, permisos, persistencia y recuperación. El trabajo de esta revisión continúa por separado de la preparación de los instaladores de `1.1.0-preview.7`.

## Problemas reproducidos

| Prioridad | Problema | Corrección y comprobación |
| --- | --- | --- |
| Alta | En Correo, el retorno podía anunciar una conexión aunque el buzón no existiera, correspondiera a otro proveedor o estuviera en error. | El aviso de éxito requiere que la cuenta guardada corresponda al proveedor y conste conectada. Se probó un retorno Gmail sin cuenta, otro con cuenta Microsoft, un retorno válido y un estado de error. [Pruebas](../e2e/correo.spec.ts) |
| Alta | Mis Causas encontraba «Andes» pero omitía el mismo expediente al buscar «andes». Un enlace con parámetros de búsqueda repetidos podía interrumpir la pantalla. | La búsqueda de expedientes ignora mayúsculas y procesa enlaces repetidos sin fallar. Se probó a 360 px desde el menú y se abrió el expediente resultante. [Pruebas](../e2e/case-archive.spec.ts) |
| Media | Abrir un aviso desde la campana conservaba el contador de no leídos. La bandeja vacía dirigía a Tareas, un destino interno que el portal no puede abrir. | Abrir el aviso actualiza su lectura y conserva el acuse crítico como paso independiente. La bandeja vacía lleva a las preferencias de notificaciones. [Pruebas](../e2e/notifications.spec.ts) |
| Media | Los ajustes personales presentaban cuatro botones con poca indicación del destino. Contraseña y verificación abría el inicio de Mi cuenta. | Se usan filas con iconos, descripciones y el grabado del lector. Seguridad lleva al bloque de contraseña y verificación. [Pruebas de Configuración](../e2e/settings-categories.spec.ts) |
| Media | A 360 px, el lanzador de Altazor invadía el botón de envío y el aviso de privacidad en Feedback. | El lanzador se compacta en esa pantalla y el aviso aparece junto a la descripción. La prueba comprueba que los controles no se solapen y que el comentario se pueda seguir. [Pruebas de Feedback](../e2e/feedback.spec.ts) |
| Baja | La prueba del Log PJUD podía seleccionar una copia oculta durante la carga progresiva de Configuración. | La comprobación busca el panel dentro de la región visible de Seguridad y avisos. [Prueba](../e2e/causas-section.spec.ts) |
| Baja | En escritorio, el grabado de la portada de ingreso se trataba como imagen diferida pese a aparecer arriba. | La imagen principal del ingreso solicita carga inmediata. [Ingreso](../src/app/login/page.tsx) |

## Recorridos y conexiones

| Área | Qué se comprobó |
| --- | --- |
| Mis Causas, Expediente y Novedades | Gestión manual, modos de trabajo, búsqueda, archivo, cuatro orígenes, agrupación y permisos del documento. |
| Biblioteca, Audiencias y Escritos | Colecciones privadas, páginas físicas y citas, hechos, cronología, notas, captura por tramos, transcripción de prueba y recuperación de escritos. Se recorrió sentencia → audiencia → transcripción citada. |
| Inicio, Configuración y cuenta | Conversación y adjuntos, selección de país, Comunicaciones, enlaces de ajustes, acceso por rol, Feedback y avisos con acuse independiente. |
| Google Workspace, GitHub y Dropbox | Autorización guiada, alcances, retorno de un uso, pertenencia a la sesión, selección de conector y permisos de operación con respuestas simuladas. |
| Google Drive | Lectura autorizada, renovación, selección de carpetas, sincronización, concurrencia y conservación del archivo importado. |
| Correo y PJUD | Alta y recuperación del buzón, lectura con permisos, consulta e importación judicial con datos ficticios, reanudación, deduplicación y conservación de originales. |

La captura utilizó el grabador del navegador con audio de prueba. Los servicios de transcripción y los proveedores de conexiones se simularon. Para acreditar una conexión real hace falta el ingreso de la persona autorizada en cada proveedor.

La comprobación pública de red obtuvo HTTP 200 en GitHub y Google OAuth. Drive y Dropbox respondieron y solicitaron credenciales. La portada pública de la OJV redirigió al ingreso protegido. [GitHub](https://api.github.com/) · [Google OAuth](https://accounts.google.com/.well-known/openid-configuration) · [Drive](https://www.googleapis.com/drive/v3/about) · [Dropbox](https://api.dropboxapi.com/2/users/get_current_account) · [OJV](https://oficinajudicialvirtual.pjud.cl/indexN.php)

En una ejecución local con Turbopack, tres pruebas de audio recibieron un 404 antes de alcanzar la ruta de carga o reintento. Pasaron las tres con `E2E_BUNDLER=webpack`. Una prueba en servidor precompilado también confirmó la carga, la conservación del audio tras un error del proveedor, el reintento y la descarga del TXT. La ejecución del PR que prepara los instaladores pasó sus 113 pruebas de navegador. [Comprobaciones del PR](https://github.com/gabrielperezibacache/lexopen/actions/runs/42150986183)

## Próximos pasos

1. **Cerrar el piloto de conexiones.** Mostrar cuenta, alcance, última comprobación y acción siguiente en la misma ficha. Validar, con cuentas de prueba, renovación, revocación y retorno al paso pendiente. Con PJUD, comprobar al menos dos cuadernos, un documento nuevo y el vencimiento de sesión.
2. **Hacer visibles los pendientes importantes.** Añadir filtros y paginación al historial de avisos. Verificar que un acuse pendiente sigue accesible aunque existan más de cien avisos y que la revocación de una causa retira el contenido del contador y del historial.
3. **Completar el recorrido de entrega.** Probar de principio a fin novedad → expediente → audiencia → escrito exportado. Verificar reapertura, fuentes accesibles y correspondencia entre el Word, la versión del escrito y los pasajes revisados.
4. **Extender el refinamiento visual.** Aplicar el grabado del lector a entradas o estados vacíos donde ayude a orientar. Reservar el chungungo para acciones de Altazor y los estantes para Biblioteca. Revisar lectura, foco y controles en ambos temas y a 360 px antes de extender un patrón.
5. **Comprobar la experiencia de instalación.** Probar inicio gráfico, actualización desde la versión previa y restauración tras un fallo en Windows, macOS y Linux. Registrar por separado los resultados del Host empaquetado y el estado de firma.
