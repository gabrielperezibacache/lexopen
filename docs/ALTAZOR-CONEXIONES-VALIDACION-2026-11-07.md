# Conexiones de Altazor: validación del 7 de noviembre de 2026

Google Drive y GitHub se comprobaron con las cuentas ya conectadas de la instalación privada. Después de actualizar LexOpen y reiniciar su servicio de escritorio, ambas conservaron el acceso. Las dos descargas siguientes se solicitaron desde la conversación, se revisaron antes de ejecutarlas y se comprobaron dentro del computador de Altazor. No fue necesario iniciar sesión otra vez.

## Archivos comprobados en el escritorio real

| Origen | Archivo | Resultado calculado del archivo |
| --- | --- | --- |
| Documento público de ejemplo de Google | `ejemplo-publico-google.pdf` | 53.269 bytes; PDF legible de **1 página** |
| Repositorio público `gabrielperezibacache/lexopen` | `README.md` | 8.696 bytes; primera línea literal: `<div align="center">` |

Huellas SHA-256 de las copias comprobadas:

- PDF: `26d3ce26ff264b4cd14f10c7922b5c5cc7d91205232fc2beb017b33af11dd707`.
- README: `e9d352466ec0a7d815038040db5db01c1f839bb902274cbfc35c37b01c6dfabf`.

El origen de Google fue el documento público `1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms`. No se utilizaron expedientes ni archivos personales para estas pruebas.

Una lectura independiente dentro del contenedor volvió a comprobar los bytes, huellas, páginas y primera línea. Los resultados coinciden con los recibos de LexOpen y permanecieron visibles al recargar la conversación durante la sesión. El escritorio temporal se detuvo al terminar; las conexiones y los recibos guardados se conservaron.

Se corrigió el fallo por el que el modelo podía anunciar una descarga o inventar sus páginas sin haber creado el archivo. Una petición explícita con destino inequívoco se prepara ahora como una operación concreta, con autorización de un solo uso. Sólo el archivo real, contrastado dentro del escritorio, produce una descarga verificada. Una respuesta ambigua o un recibo ausente no se confirman ni se repiten automáticamente.

La preparación automática y la presentación de estos recibos se validaron para Google Drive y GitHub. El límite actual de estas descargas completas es 4 MiB; no se entrega un fragmento como si fuera el archivo íntegro. La consulta de resultados históricos después de cerrar o vencer una sesión sigue siendo una mejora pendiente de la interfaz, independiente de la conservación de los recibos.

## Conectar una cuenta

El recorrido habitual es **Conectar → iniciar sesión en el servicio oficial → autorizar → volver a LexOpen**. El panel funcional no solicita tokens personales, identificadores ni secretos de aplicaciones. Esos preparativos pertenecen exclusivamente a quien publica o administra la instalación.

El retorno desde el navegador del sistema funciona aunque ese navegador no tenga la sesión de LexOpen. La respuesta se guarda cifrada y sólo puede completarla la sesión autenticada que inició el ingreso. Se corrigió también el bloqueo del proxy que antes impedía llegar a ese retorno sin cookie.

El perfil público opcional permite distribuir el cliente instalado de Google y la autorización por dispositivo de GitHub. El usuario creó sus identidades y autorizó preparar ese perfil. Sus valores están fuera de Git y en la configuración protegida de compilación. No se distribuyen el secreto web del estudio, tokens de cuenta ni credenciales personales. Una preparación guardada previamente conserva su prioridad.

La conservación de las cuentas se comprobó en la instalación real. Los escenarios de vencimiento, rotación, denegación, concurrencia y guardado único se comprobaron además con proveedores ficticios.

## Estado de Google

La [presentación y privacidad](perezibacache-site/LEXOPEN-PUBLICACION-2026-11-07.md) siguen publicadas. Google confirmó la propiedad HTTPS del dominio mediante Search Console, tras la confirmación personal de su titular. Se actualizó el nombre y logotipo de LexOpen y se guardaron los dos permisos de consulta de Drive con su justificación.

La aplicación está en Producción, pero **la revisión pública OAuth aún no está aprobada**. Google indicó esperar 24 horas después de acreditar el dominio antes de repetir la comprobación de marca. También exige un video de demostración que incluya todos los clientes OAuth del proyecto. El enlace de ese video todavía está pendiente. El expediente y los próximos pasos están en [Verificación de Google](GOOGLE-VERIFICACION-2026-11-07.md).

## Dropbox y Microsoft 365

El código admite clientes públicos con PKCE y permisos delimitados de lectura, sin exigir un secreto de cliente al usuario. Dropbox contempla cuenta, metadatos y contenido; Microsoft contempla el perfil y los archivos propios de OneDrive, sin permisos de correo, calendario, escritura ni acceso general a archivos del estudio.

Se validaron el ingreso, el retorno al navegador original, el guardado y la renovación mediante cuentas ficticias. El motor de escritorio también comprobó los límites de descarga, las redirecciones y las huellas de archivos de prueba.

El titular creó el registro de Dropbox y confirmó su consentimiento de lectura. Se guardaron el identificador público, PKCE sin secreto y el retorno local, con únicamente `account_info.read`, `files.metadata.read` y `files.content.read`. La aplicación de Dropbox permanece en Desarrollo; todavía no está habilitada para una distribución pública general.

La primera autorización real detectó un defecto: el motor rechazaba importar una cuenta cuyo alias aún no existía. El motor `.12` crea el alias y sus credenciales en una sola escritura; renovar una cuenta retirada sigue sin recrearla. La corrección se instaló localmente tras sus pruebas. El intento fallido quedó revisado sin reenviarlo, y Drive y GitHub conservaron su configuración. **Falta repetir el ingreso de Dropbox con la corrección para confirmar el guardado real de la cuenta.** Microsoft aún no tiene una identidad de aplicación registrada ni una conexión real comprobada.

La descarga determinista de Dropbox admite una ruta explícita, por ejemplo `Descarga el archivo "/Docencia/Curso.pdf" de Dropbox`. Conserva el origen y contrasta bytes, huella y páginas dentro del escritorio. Sus pruebas usan un PDF ficticio de tres páginas; todavía no acreditan una descarga con la cuenta real de Dropbox. Las rutas ambiguas no se recortan para elegir silenciosamente otro archivo.

## Autorizaciones del computador

Configuración reúne **Supervisar cada acción**, **Consultas inteligentes** y **Trabajo autónomo**, con categorías separadas para entrada, navegación y aplicaciones. Cambiar de modo no activa categorías. Los permisos se vinculan al usuario, espacio y sesión; el escritorio confirma la revisión aplicada antes de trabajar. El [alcance de cada modo](ALTAZOR-AUTORIZACIONES-ESCRITORIO.md) detalla los límites del control gráfico y los resultados inciertos.

Se probó una sesión real sin cuentas conectadas: el modelo local solicitó mover el puntero a una coordenada concreta, la interfaz presentó la acción y el motor confirmó una única ejecución tras aprobarla. La política aplicada fue supervisada, sin categorías autónomas. La sesión terminó sin consultas pendientes y se cerró expresamente. Esto comprueba el circuito de autorización; no acredita que el modelo consiga cualquier objetivo ni que comprenda el efecto de cada clic.

## Alcance de las comprobaciones

La primera ronda del motor superó 98 pruebas con detección de concurrencia; la ronda `.12` superó 134, sin fallos ni omisiones. Son rondas sucesivas, no cantidades acumulables. La aplicación superó TypeScript, ESLint, las pruebas de recibos y políticas, las integraciones con PostgreSQL desechable y los recorridos de navegador de conexiones, recuperación y vistas móviles. Las pruebas automáticas usan proveedores y cuentas ficticios; las dos descargas de la tabla y la autorización del movimiento sí se comprobaron en el entorno real.

El paquete autónomo conserva las dependencias anidadas de Next y materializa únicamente los enlaces a sus siete paquetes públicos registrados, excluyendo archivos de entorno. La actualización local comprueba el manifiesto, conserva cuenta y configuración y prepara la restauración de la versión anterior.

Siguen pendientes la revisión pública de Google, las cuentas reales de Dropbox/Microsoft y publicar y validar nuevos instaladores. No se ha presentado esta actualización local como una publicación ni como una integración en `main`.
