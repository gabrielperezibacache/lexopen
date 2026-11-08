# Perfil público de conexiones para los instaladores

El responsable de publicar LexOpen puede preparar una identidad de aplicación una sola vez. Los profesionales que instalen una versión con ese perfil podrán autorizar su propia cuenta desde LexOpen, sin crear proyectos ni registrar aplicaciones.

Este perfil es independiente de la configuración privada que un estudio haya guardado. El Host incorpora el perfil distribuido únicamente cuando no hay uno configurado en `ALTAZOR_DISTRIBUTED_OAUTH`; no reemplaza identificadores ni secretos de las aplicaciones propias del estudio. La elección entre configuración propia y distribuida corresponde al servicio de conexiones.

## Preparación de la publicación

El perfil admite exclusivamente este contrato:

- `schemaVersion: 1`.
- Google: `type: "installed"`, `client_id` y `client_secret` de un cliente de tipo **Aplicación de escritorio**, dedicado a Altazor y marcado como cliente de agente de IA. Debe mantenerse separado de las integraciones interactivas convencionales, según las [indicaciones de Google para agentes](https://support.google.com/cloud/answer/15549257#agentic-client).
- GitHub: `type: "device"` y `client_id` de una aplicación con autorización por dispositivo habilitada.
- Dropbox: `type: "public_client"` y `client_id`. Usa PKCE y renovación sin secreto de aplicación; el permiso de archivos se limita a lectura.
- Microsoft: `type: "public_client"` y `client_id` con el GUID del registro nativo. Usa PKCE y retorno `http://localhost:<puerto>/api/altazor/connectors/oauth/callback`, conservando exactamente el puerto de la instalación. No admite secreto de cliente.

Microsoft solicita únicamente `offline_access`, `User.Read` y `Files.Read`. El primero permite obtener la autorización renovable; los permisos API conservados son exactamente `User.Read` y `Files.Read`. No se solicita acceso al correo, agenda, contactos ni modificación de archivos. Dropbox conserva exclusivamente `account_info.read`, `files.metadata.read` y `files.content.read`. Estas modalidades requieren un escritorio con la capacidad `lexopen_cloud_file_oauth: v1`; una versión anterior permanece bloqueada antes de pedir consentimiento.

El ingreso se abre en la página oficial. El navegador devuelve una respuesta cifrada al Host y sólo la sesión original de LexOpen puede completar el canje y guardar la conexión. Si se recarga la aplicación con un ingreso pendiente cuyo enlace se perdió, «Reiniciar ingreso» abre un intento nuevo mediante una acción expresa; no vuelve a enviar el código ni repite una importación anterior. Un intento que ya está intercambiándose sólo permite comprobar su estado.

La aplicación de GitHub distribuida debe mantener la modalidad de tokens sin caducidad automática. El importador actual no renueva tokens de GitHub emitidos con `expires_in` o `refresh_token`; ese caso se rechaza antes de guardar la conexión y no se presenta como acceso permanente. La revocación y las políticas del proveedor pueden exigir un nuevo consentimiento.

El parámetro de cliente que Google genera para una aplicación instalada forma parte de un cliente público; no debe tratarse como un secreto confidencial. Esta implementación requiere ese parámetro para conservar la compatibilidad con el importador actual. **No se debe reutilizar ni distribuir el secreto de una aplicación web.** El parser valida la declaración de tipo y la estructura, pero no puede comprobar el tipo real de un cliente en la consola de Google a partir de su identificador. Esa comprobación corresponde al responsable de la publicación.

Las instrucciones de los proveedores están en [Google: aplicaciones de escritorio](https://developers.google.com/identity/protocols/oauth2/native-app) y [GitHub: autorización por dispositivo](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow). La identidad distribuida no sustituye el consentimiento de cada persona ni la verificación que requiera el proveedor.

Los contratos públicos de los otros servicios se describen en [Dropbox: autorización con PKCE](https://docs.dropboxapi.com/dropbox-api/docs/get-started/authorization) y [Microsoft: autorización de aplicaciones públicas](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow). La preparación del publicador queda en Configuración; la persona sólo conecta su cuenta y autoriza en el proveedor. Sin una identidad real preparada, la interfaz muestra «Servicio en preparación» y no presenta formularios de identificadores o claves en el flujo funcional.

[La plantilla](../desktop/resources/oauth-clients.example.json) contiene valores vacíos a propósito. No constituye una configuración utilizable ni se incorpora automáticamente a un instalador.

Para preparar los recursos de una publicación, indique un archivo público ya revisado mediante `LEXOPEN_DISTRIBUTED_OAUTH_PROFILE`. Alternativamente, puede proporcionar `desktop/resources/oauth-clients.json`, que está excluido de Git. No se leen ni copian las credenciales del Host que esté utilizando el responsable de la publicación.

En GitHub Actions, el responsable puede preparar una sola vez el secreto de repositorio `LEXOPEN_PUBLIC_OAUTH_PROFILE_JSON` con ese perfil. Se utiliza el mecanismo de secretos de CI para impedir que su contenido aparezca en la cabecera de los registros, aunque sea una configuración de cliente público destinada al instalador. No debe contener tokens de personas ni secretos de aplicaciones web. El workflow valida el contrato, escribe su representación canónica en una carpeta temporal del runner y comunica sólo su ruta a la preparación del paquete. No descarga configuración desde servicios externos.

Esta entrada de CI es opcional. Su ausencia permite preparar una compilación sin identidad distribuida; no acredita que las conexiones estén preparadas para nuevos usuarios. El registro de las identidades públicas y su incorporación a la próxima publicación siguen siendo pasos únicos del responsable de publicar LexOpen.

## Qué comprueba el paquete

La preparación valida el perfil con un límite de 16 KiB y rechaza tipos web, claves adicionales, firmas conocidas de tokens de usuario, campos de redirección y enlaces simbólicos. Guarda únicamente su representación validada en `resources/oauth-clients.json`, con su SHA-256 en los metadatos de la aplicación. La copia final del instalador vuelve a comprobar el contenido contra esa huella.

El parser compartido también se incluye en los recursos del Host. Al iniciar una instalación empaquetada, carga el perfil opcional en el entorno del servidor sin escribirlo en la configuración personal ni sustituir un perfil existente. Un perfil existente ilegible o inválido no provoca una sustitución silenciosa por otro.

Los archivos de cuenta, autorizaciones y credenciales personales siguen excluidos de los recursos distribuibles. No se añadió un servicio de intercambio central ni un mecanismo para descargar perfiles desde direcciones remotas.

## Alcance de esta incorporación

Se verificaron el parser, la prioridad de configuración, el arranque aislado del Host, el empaquetado y las comprobaciones de integridad con datos ficticios. Después se registró la identidad real del publicador y se guardó su perfil en la configuración protegida de compilación, con comprobaciones técnicas en ambos proveedores. El [registro de validación](ALTAZOR-CONEXIONES-VALIDACION-2026-11-07.md) distingue esas pruebas de las conexiones reales existentes y de las tareas todavía pendientes: nueva publicación, ingreso completo en una instalación limpia y verificación pública de Google. El perfil no prepara automáticamente un escritorio por persona.

La ampliación pública de Dropbox y Microsoft se validó con clientes, cuentas y respuestas HTTP ficticios en PostgreSQL desechable: retorno a localhost con puerto exacto para Microsoft, reclamación en la sesión original, canje e importación sin secreto, renovación declarada y rechazo de permisos adicionales. Esto acredita el contrato del código; sus identidades reales de distribución y la conexión con cuentas reales siguen pendientes. No se registraron aplicaciones ni se aceptaron condiciones durante esta ampliación.
