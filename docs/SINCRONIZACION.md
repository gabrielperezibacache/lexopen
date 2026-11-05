# Mantener tus documentos y causas al día

## Mi Google Drive

1. Abre **Causas → Sincronización → Mi Google Drive**.
2. Pulsa **Conectar con Google**, revisa el permiso y continúa en la página oficial. La conexión se completa en la ventana original de LexOpen.
3. Abre una causa y su apartado de Drive. Elige **Mi cuenta personal**, busca la carpeta por nombre y confirma la raíz. También puedes pegar el enlace de una carpeta.
4. Activa las actualizaciones automáticas y elige una frecuencia. La elección de carpeta queda inicialmente pausada; seleccionarla no empieza a descargar.
5. Consulta las copias en Documentos. Puedes pausar o desconectar sin borrar lo que ya conservaste.

El permiso personal permite leer y descargar contenido de Drive y renovar el acceso mientras el Host esté disponible. No permite modificar ni borrar archivos remotos. LexOpen revisa sólo las carpetas autorizadas para la sincronización; la autorización de Google por sí misma no envía archivos al modelo de IA.

La raíz incluye sus subcarpetas, con recorrido limitado a ocho niveles y 250 carpetas. Los lotes y su posición se conservan para continuar después. Cada importación vuelve a comprobar conexión, pertenencia a la raíz y permisos de la causa. Carpetas movidas fuera de la raíz se excluyen. Una respuesta parcial se muestra como pendiente de revisión.

Una nueva versión conserva la copia anterior. Los archivos no admitidos o inaccesibles se identifican y no impiden revisar los siguientes. Borrar una copia local conserva un recibo para que esa misma versión no reaparezca automáticamente; una importación explícita de esa revisión informa que esa revisión no está disponible.

### Preparación administrativa, una vez

El administrador prepara una aplicación OAuth en Google y registra el retorno que muestra LexOpen en **Preparar conexión · administración**. Puede reutilizar explícitamente la identidad de la aplicación ya preparada para ALTAZOR, agregando el nuevo retorno, o configurar otra aplicación.

El retorno personal es `/api/personal-connectors/google-drive/oauth/callback` sobre la dirección configurada de LexOpen. Se solicita exclusivamente `https://www.googleapis.com/auth/drive.readonly`, con acceso offline para renovación. Google puede exigir verificación y restricciones de usuarios de prueba para este alcance. Registrar los datos en LexOpen no acredita que Google haya aprobado la aplicación.

Las variables opcionales `PERSONAL_DRIVE_GOOGLE_CLIENT_ID` y `PERSONAL_DRIVE_GOOGLE_CLIENT_SECRET` tienen prioridad sobre la preparación cifrada de la interfaz. Nunca se incluyen sus valores en el repositorio. La aplicación de metadatos de la computadora y esta autorización de contenido tienen propósitos y retornos separados; no se copian tokens entre ambas.

Los valores personales permanecen cifrados en el servidor. El retorno de Google puede abrirse en un navegador externo sin la cookie original: allí sólo se recibe una autorización temporal cifrada. La activación necesita la sesión original de LexOpen, su versión vigente y un intento de un solo uso.

## Cuenta de Drive del estudio

Es una conexión compartida del estudio, preparada por su administrador. No es una cuenta privada de cada profesional. Los archivos disponibles dependen de sus permisos de Google y del alcance concedido a esa aplicación; `drive.file` no equivale a acceso indiscriminado a todo Drive.

En cada causa, elige la cuenta antes de vincular la carpeta o importar. No se utiliza silenciosamente la cuenta personal de otro profesional ni se cambia a la cuenta del estudio cuando falla una conexión personal. Una suscripción pausada puede reasignarse con permisos actuales; una actualización activa conserva su responsable hasta que se pause.

## Oficina Judicial Virtual

Activa **Poder Judicial de Chile** en **Configuración → Gestión de causas**. Después, en **Causas → PJUD · Chile** puedes:

- Consultar públicamente por **RIT/ROL y tribunal**.
- Abrir el ingreso manual de **ClaveÚnica**, revisar Mis Causas y seleccionar las que deseas incorporar.
- Elegir, por causa, seguimiento, frecuencia y conservación de documentos nuevos.

Introduce tu contraseña y códigos únicamente en la página oficial. LexOpen utiliza una ventana aislada y temporal; no importa la sesión del navegador habitual. Las consultas revisan los cuadernos disponibles y conservan los documentos autorizados.

La cola de descargas y el seguimiento de movimientos tienen estados separados. Los documentos privados que necesitan un ingreso vigente esperan en «requiere ClaveÚnica». Cuando vuelves a identificarte y autorizas las causas, se retoman los pendientes disponibles; los originales guardados y los recibos de documentos retirados se conservan.

Una sesión temporal dura hasta 30 minutos y puede vencer antes por decisión del portal. Un desafío, una caída o la falta de acceso a un documento no se presenta como sincronización completa. Las descargas tienen límites durante la lectura, no después de consumir el archivo entero. Los accesos autenticados entre dominios oficiales usan sólo las cookies pertinentes de la ventana aislada, sin guardarlas ni seguir redirecciones.

Volver a **Gestión manual** pausa el trabajo judicial pendiente y conserva expedientes, originales y configuración. Google Drive tiene su propio ciclo y permanece disponible.

## Cuándo se actualiza

Desktop Host prepara un ciclo de trabajo pendiente de un minuto y una revisión judicial de cinco minutos, respetando configuraciones existentes y la frecuencia de cada causa. Sólo se procesan sincronizaciones activadas y encargos enviados; una conexión de cuenta no activa por sí sola todas las carpetas.

Para Host desde código, configura `LEXOPEN_JORNADA_INTERVAL_MINUTES` y `PJUD_SYNC_INTERVAL_MINUTES` junto con `CRON_SECRET` según la guía del Host. Los servicios alojados pueden invocar los endpoints protegidos con su programador. No deben exponerse credenciales de programación al navegador.

Los temporizadores requieren que el Host siga funcionando. Una pantalla que informa configuración de intervalos no acredita por sí sola una ejecución real. Las pruebas de esta revisión usaron bases, archivos, transportes y cuentas ficticias; el acceso con cuentas reales se valida por separado.
