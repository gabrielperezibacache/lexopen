# WhatsApp y escritos sin conexión

Implementación del 7 de noviembre de 2026. La comprobación usa cuentas, números y documentos ficticios; los transportes de mensajes se simulan. No acredita entregas en una cuenta real de Meta o Twilio.

## Activar WhatsApp

En **Configuración → Notificaciones**, un administrador del Host puede elegir Meta Cloud API o Twilio. Solo se usa un proveedor a la vez.

1. Registre un número de negocio en el proveedor y una **plantilla aprobada sin variables**, por ejemplo: «Tiene nuevas notificaciones en LexOpen. Abra la aplicación para revisarlas». No configure encabezados, medios ni botones que requieran parámetros. LexOpen envía esa plantilla; no incluye nombres, textos, documentos ni enlaces de las causas.
2. En Meta, configure la versión Graph que admita su aplicación, el identificador del número, el nombre e idioma exactos de la plantilla, Access Token, App Secret y un token de verificación de al menos 24 caracteres. Suscriba el webhook al campo `messages`.
3. En Twilio, configure Account SID, **Primary Auth Token** y Content SID (`HX…`) de la plantilla aprobada. Configure la recepción del número como POST de formulario.
4. Publique, mediante el acceso HTTPS de su Host, la ruta correspondiente: `/api/notify/whatsapp/webhook/meta` o `/api/notify/whatsapp/webhook/twilio`. Introduzca la URL pública completa en LexOpen y en el proveedor, sin parámetros. Twilio firma la URL exacta; se verifica contra esta configuración, sin confiar en cabeceras reenviadas por el cliente.
5. Cada profesional debe aceptar la vinculación en **Cuenta → Notificaciones**, obtener el código y enviar el mensaje `LEXOPEN …` desde su teléfono al número del negocio. El código caduca en 15 minutos y solo sirve una vez. Un teléfono ya vinculado a otra cuenta no se reasigna.
6. Tras comprobar la vinculación, active los eventos de WhatsApp en la matriz. Comienza desactivado, también para plazos fatales. Los demás canales conservan sus reglas existentes. Puede revocarlo desde la cuenta o enviando `BAJA` o `STOP` al número del negocio.

Credenciales y destinos se cifran con el mecanismo de secretos del Host. La API de configuración devuelve presencia de credenciales y campos públicos, nunca sus valores. Dejar un secreto vacío conserva el anterior. Cambiar el número del negocio revoca las vinculaciones y códigos anteriores.

Los envíos usan la cola durable existente, con permisos y destino comprobados al procesarlos. Un rechazo por límite de velocidad admite reintento. Un timeout, un error 5xx o una respuesta de aceptación sin identificador queda **incierto** y requiere reconciliación antes de reenviar. `enviado` significa aceptación por el proveedor, no entrega al teléfono, lectura ni acuse del plazo. Los webhooks de este incremento verifican la vinculación y la baja; no implementan conversaciones ni un monitor de estados de entrega.

Contrato de integración: [colección oficial de Meta](https://www.postman.com/meta/whatsapp-business-platform/request/o65u5m5/send-message-template-text), [plantillas de Twilio](https://www.twilio.com/docs/content/send-templates-created-with-the-content-template-builder) y [verificación de firmas de Twilio](https://www.twilio.com/docs/usage/security).

## Preparar y usar escritos sin conexión

1. Con conexión y una sesión autorizada, abra un escrito privado de una causa y pulse **Trabajar sin conexión**. Se guardan primero los cambios del editor principal.
2. Cree el espacio cifrado de este navegador con una clave local de al menos 12 caracteres y pulse **Preparar este escrito**. Conserve la clave: es independiente de la cuenta y no se envía al Host.
3. Puede cerrar o recargar la página sin red y desbloquearla con esa clave. El enlace **Trabajo sin conexión** del marco de LexOpen y `/offline.html` abren el espacio. El texto se guarda localmente al dejar de escribir; el estado indica si ese guardado se completó.
4. Al recuperar conexión, inicie sesión con la misma cuenta y pulse **Sincronizar escrito**. Cada envío conserva su identificador y contenido exactos antes de contactar con el servidor. Una respuesta perdida se reintenta con el mismo identificador. Si siguió editando, confirme primero aquel envío y vuelva a sincronizar para enviar el texto posterior.
5. Si otra sesión cambió la versión, se conserva su copia y se impide sobrescribirla. Descargue su texto y compárelo en el editor principal. **Descargar versión del servidor** reemplaza la copia local solo después de una confirmación cuando existen cambios pendientes.

El espacio admite hasta 100 registros locales, incluidos hasta 40 escritos, y 16 MiB de datos. AES-256-GCM cifra contenido, títulos, identidad del titular, versiones y peticiones pendientes; la clave se deriva mediante PBKDF2-SHA-256 con 600.000 iteraciones y sal aleatoria. Solo se mantiene en memoria mientras el espacio está abierto. Otra pestaña no puede sobrescribir ni borrar una versión local posterior. No se eliminan cambios pendientes por caducidad. El usuario puede bloquear, descargar, quitar un escrito o borrar el espacio.

Requiere HTTPS o localhost, WebCrypto e IndexedDB habilitados. Si el navegador deniega el almacenamiento o se agota la cuota, el texto visible puede descargarse y no se declara guardado. Limpiar los datos del navegador elimina las copias; una descarga de texto es un archivo sin cifrado bajo control del usuario.

La clave local permite leer copias previamente preparadas aunque el Host esté inaccesible. Esas copias no reflejan revocaciones posteriores. **Toda sincronización** vuelve a exigir sesión, titular, permisos actuales, acceso a respaldos y versión del servidor. El espacio no aprueba escritos, no envía mensajes y no ejecuta IA. Crear escritos, buscar fuentes, revisar y exportar versiones aprobadas sigue requiriendo conexión. Clientes y tareas permiten creación local, edición, asignaciones y vínculos con causas preparadas; buscar opciones nuevas requiere conexión. Consulte [Trabajo sin conexión](TRABAJO-SIN-CONEXION.md). La captura de audio pendiente conserva su mecanismo separado de recuperación.

## Caché y regresiones

El service worker solo guarda cinco recursos públicos: `/offline.html`, sus estilos y sus tres módulos. No almacena páginas autenticadas, respuestas de API, originales ni adjuntos. Una navegación fallida abre ese documento público. Al activarse, elimina la antigua caché `lexopen-shell-v1`, que podía contener `/`. Las revisiones del shell deben incrementar la versión de `SHELL_CACHE` cuando cambien sus recursos.

Pruebas: contratos simulados de ambos proveedores, integración PostgreSQL y webhook HTTP firmado; cifrado, recarga sin red, recibos después de respuesta perdida, conflictos, otra cuenta, permisos retirados, almacenamiento denegado, cuota, concurrencia entre copias y eliminación de caché antigua. Las desconexiones de navegador se provocan en un proxy HTTP de bucle local que también afecta al service worker; no dependen de la emulación de red de cada motor.

Resultado local: baterías unitarias e integración completas, lint, TypeScript y compilación de producción aprobados. Se comprobaron 48 casos de navegador entre Chromium, Chromium con captura nativa y WebKit, con los fixtures HTTP autenticados y los originales compartidos en almacenamiento temporal. Firefox queda configurado para CI; el compositor de este Mac impide su arranque local. Para reproducir pruebas contra un servidor aislado, `DATABASE_URL`, `E2E_DATABASE_URL`, `SESSION_SECRET` y `STORAGE_PATH` deben coincidir en el proceso de Playwright y en el servidor.
