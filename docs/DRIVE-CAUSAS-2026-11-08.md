# Drive en Mis Causas

LexOpen utiliza la cuenta de Google conectada a Altazor para las carpetas de las causas. El profesional puede elegir una carpeta existente o crear una nueva, sin registrar otra aplicación ni guardar otra cuenta.

## Recorrido

1. En Aplicaciones de Altazor, conectar Google. Una cuenta que ya conserva lectura ofrece **Permitir crear y editar**. El permiso se amplía sólo tras el consentimiento oficial de Google.
2. En **Mis Causas → causa → Google Drive**, elegir una carpeta existente o **Nueva carpeta aquí**. Revisar su ubicación y confirmar.
3. Desde un documento, elegir **Guardar en Google Drive**, revisar archivo, versión y carpeta y confirmar el guardado. Altazor también puede preparar esta acción desde la conversación de la causa.
4. Activar **Recibir novedades de Drive** para incorporar archivos y revisiones entrantes con la misma cuenta. La carpeta se vincula inicialmente con la recepción en pausa.

La lectura y la gestión de archivos son autorizaciones distintas. El alcance completo `drive` permite gestionar los archivos accesibles de esa cuenta e incluye técnicamente eliminación. Las herramientas directas de esta etapa crean carpetas, guardan copias y crean versiones separadas; no ofrecen borrar, mover, compartir ni sobrescribir un archivo existente. Los permisos efectivos sobre cada archivo siguen dependiendo de Google. [Alcances oficiales de Drive](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

## Copias y recuperación

Las copias salientes admiten hasta **4 MiB**, con archivo original disponible en LexOpen. Se fijan cuenta, causa, carpeta, versión local, tamaño y huella antes del envío. Los documentos marcados como reservados no se envían por esta herramienta.

**Guardar nueva versión** crea otro archivo de Drive y conserva el anterior. La referencia del documento pasa a la nueva copia sólo después de verificar el resultado. No se presenta esta operación como modificación del contenido en el mismo identificador remoto.

Una respuesta incierta queda pendiente de comprobación y bloquea nuevos envíos para evitar duplicados. **Comprobar resultado** consulta el registro y, cuando corresponde, el objeto remoto; no repite la escritura. Un conflicto confirmado antes de aplicar cambios libera la operación para preparar una acción nueva.

La recepción automática incorpora archivos y revisiones **desde Drive hacia la causa**. Conserva procedencia, copias verificadas y versiones anteriores; no constituye sincronización bidireccional. Los cambios de cuenta, carpeta, permisos o generación invalidan los encargos preparados con el estado anterior.

## Estado de validación

Las pruebas de OAuth, permisos, registros, recuperación y herramientas del asistente utilizan PostgreSQL desechable y proveedores simulados. La compilación conjunta y el recorrido visual se comprueban por separado. La autorización de escritura con una cuenta real, la demostración pública y la verificación de Google deben documentarse con sus resultados reales; estas pruebas no acreditan esos pasos ni instaladores publicados.

## Propuesta para actualizar la política pública

Texto preparado para revisión; su presencia en este documento no significa que esté publicado:

> Con tu autorización, LexOpen puede consultar archivos de Google Drive y guardar documentos en los destinos que elijas. Para gestionar archivos existentes solicita el permiso completo de Drive. Este permiso incluye técnicamente modificar y eliminar archivos; las herramientas directas actuales crean carpetas y guardan copias o versiones separadas, conservando los originales. Las operaciones quedan vinculadas a tu cuenta y a la causa correspondiente. Desconectar Google detiene el acceso futuro; no elimina automáticamente las copias conservadas en expedientes o respaldos.

La política debe conservar además el mapa real de datos entre Host, motor privado, archivos e IA configurada, junto con el responsable y los mecanismos de revocación existentes. Este añadido sustituye la afirmación anterior de que Google siempre se utiliza sólo en lectura; no cambia los permisos de GitHub ni Dropbox.

## Justificación y demostración para Google

Justificación propuesta: gestionar el ciclo documental de causas con carpetas y archivos previamente existentes. El alcance `drive.file` no garantiza acceso al corpus existente por el solo hecho de elegir su carpeta. No se solicitan permisos adicionales de correo o calendario en este flujo.

El video real debe mostrar los clientes web y de escritorio, sus Client ID y el consentimiento oficial en inglés, incluyendo todos los perfiles solicitados. Con datos ficticios debe demostrar selección y creación de carpeta, guardado y comprobación del documento, nueva versión con identificador distinto y original conservado, recepción entrante sin duplicados y desconexión. Las credenciales deben permanecer fuera de la grabación.

La [guía de publicación](CONEXIONES-PUBLICACION-2026-11-08.md) conserva los requisitos pendientes de marca, espera del dominio, video y revisión. Microsoft permanece pendiente por indicación del usuario.
