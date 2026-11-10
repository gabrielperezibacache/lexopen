# Conexiones y Secretos de ALTAZOR

Esta guía describe el código `1.1.0-preview.4`. Consulte los archivos efectivamente publicados en [Releases](https://github.com/gabrielperezibacache/lexopen/releases). El catálogo nuevo, sus autorizaciones y Secretos no están incluidos en los instaladores anteriores `preview.3` (`c878fc5`).

El ingreso simplificado, la renovación y el cierre tras vencimiento se incorporan en el desarrollo posterior a `preview.4`. Su presencia en esta guía no acredita que exista un nuevo instalador publicado.

[Galería real de escritorio y móvil](altazor-conexiones-2026-11-04/README.md), con datos ficticios, gateway simulado y manifiesto de imágenes. La imagen interna del escritorio de esa galería es sintética; no acredita contenedores reales ni cuentas conectadas.


La revisión `1.1.0-preview.5` incorpora [Drive personal y sincronización de carpetas](SINCRONIZACION.md), independiente del conector de metadatos del escritorio descrito aquí. Cada profesional autoriza contenido y renovación en Google desde **Causas → Sincronización → Mi Google Drive**; el administrador prepara la aplicación una vez. Esta cuenta no necesita iniciar una computadora de ALTAZOR.

## Conectar una aplicación

1. Abra **Configuración → Conexiones e IA → Cuentas conectadas** y elija **Google Workspace** o **GitHub**. Para Dropbox, abra **Todas las conexiones y secretos**.
2. Revise el acceso solicitado y elija iniciar sesión. Introduzca la contraseña y los códigos en la página oficial del servicio.
3. Vuelva a LexOpen para comprobar el resultado. La conexión sólo se muestra confirmada cuando la autorización y la comprobación del servicio terminaron correctamente. Una denegación o interrupción no se presenta como conexión exitosa.
4. Al crear un escritorio, elija expresamente las conexiones que podrá usar. Una selección vacía significa ninguna. La selección queda fijada a esa sesión; cambiar la configuración requiere cerrar las sesiones activas o inciertas.
5. En el escritorio, revise cada solicitud pendiente: aplicación, operación, destino y contenido. Autorice o rechace esa operación concreta. La decisión no concede permiso permanente.

El gateway reforzado exige confirmación incluso para lecturas. El modelo no puede modificar esas reglas. Los permisos concedidos mediante OAuth pueden ser más amplios que una tarea; la revisión por operación limita el uso desde LexOpen, pero no reduce los permisos de la cuenta en el proveedor. Una respuesta incierta se conserva y no se reenvía automáticamente.

Google y GitHub muestran únicamente el ingreso a la cuenta y su estado. El profesional no necesita crear claves, registrar aplicaciones ni abrir consolas. La preparación técnica de una instalación propia corresponde al administrador, en **Configuración**; otros adaptadores pueden requerir datos particulares.

Los instaladores admiten una identidad pública de LexOpen preparada por quien los distribuye. Google se abre en el navegador del usuario y LexOpen recoge el resultado en su ventana original. GitHub puede pedir un código breve en su página oficial. Después se comprueba y conserva la conexión. La [preparación del perfil de distribución](ALTAZOR-PERFIL-PUBLICO-DE-CONEXIONES.md) es una tarea única del publicador, con requisitos de los proveedores; este soporte no acredita que los instaladores publicados ya incluyan esa identidad.

La conexión personal de Google de Altazor es distinta de **Google del estudio**: no reutiliza esa cuenta global ni sus autorizaciones de correo y calendario. El acceso básico consulta metadatos de Drive; trabajar con documentos requiere autorizar su contenido de lectura. GitHub permite consultar el perfil y repositorios públicos. Estas conexiones no habilitan repositorios privados, Gmail, Calendar ni escrituras.

### Inicio de sesión sencillo

Una instalación que utilice un registro propio conserva la preparación administrativa, una vez por Host. En Configuración, abra la guía de preparación del servicio, copie la dirección de retorno y regístrela en la consola oficial. Guarde el identificador y secreto de la aplicación en los campos reservados. LexOpen cifra estos datos. Cada profesional pasa directamente al ingreso oficial una vez preparada la aplicación y habilitado su escritorio. También se admiten las siguientes variables del servidor, que tienen prioridad.

| Servicio | Configuración del servidor |
| --- | --- |
| Google | `ALTAZOR_GOOGLE_CLIENT_ID` y `ALTAZOR_GOOGLE_CLIENT_SECRET`. |
| GitHub | `ALTAZOR_GITHUB_CLIENT_ID` y `ALTAZOR_GITHUB_CLIENT_SECRET`. |
| Dropbox | `ALTAZOR_DROPBOX_CLIENT_ID` y `ALTAZOR_DROPBOX_CLIENT_SECRET`. |

El retorno autorizado es el origen configurado de LexOpen seguido de `/api/altazor/connectors/oauth/callback`. Registre ese retorno exactamente en el proveedor. No añada contraseñas ni tokens a la URL. En un Host local, utilice su dirección loopback; una instalación publicada debe tener su propio registro y configuración autorizados por el proveedor.

Cada inicio vincula la autorización al profesional, a su sesión de LexOpen y al espacio elegido, con un plazo y uso único. El proveedor entrega la autorización al servidor, que la comprueba y la guarda expresamente en el gateway dedicado. El retorno al navegador contiene únicamente el identificador del intento.

**Conexiones guardadas:** Google y Dropbox se autorizan con renovación automática. El gateway conserva la credencial de renovación fuera del chat y de los archivos del escritorio y obtiene un acceso nuevo cuando es necesario, también después de reiniciarse. No hay que iniciar sesión de nuevo al abrir LexOpen ni cada vez que vence un acceso temporal. GitHub conserva su autorización ya guardada; esta actualización no obliga a reemplazar una conexión válida. Las conexiones temporales anteriores de Google o Dropbox necesitan una sola autorización adicional desde **Mantener conexión** o **Conectar**. Desconectar o revocar el permiso en el proveedor pone fin al acceso.

Un fallo de red conserva la conexión y ofrece **Comprobar conexión**. La autorización interactiva sólo vuelve a solicitarse cuando hace falta: por ejemplo, revocación, cambio de cuenta o de permisos, o una exigencia del proveedor. No se oculta ni se evita su verificación.

**Preparación de Google para uso continuo:** el proyecto debe salir del modo Prueba. Google limita a siete días las credenciales de renovación para Drive de aplicaciones externas en Prueba. La consola exige completar la página pública de la aplicación y su política de privacidad antes de habilitar Producción. El registro puede requerir además verificación de Google según sus permisos y público. [Documentación oficial sobre duración y revocación](https://developers.google.com/identity/protocols/oauth2#expiration). La renovación automática evita ingresos repetidos por la caducidad del acceso; no promete una autorización irrevocable.

Para habilitar **Dropbox**, prepare una aplicación en la consola oficial con permisos `account_info.read`, `files.metadata.read` y `files.content.read`. Puede limitar el acceso de la aplicación a su propia carpeta de Dropbox. Actualice el escritorio de Altazor para disponer de las operaciones de listado, búsqueda y lectura de archivos de hasta 4 MiB. Cada consulta requiere confirmación. Los usuarios inician sesión desde **Conectar Dropbox**. [Guía oficial de autorización de Dropbox](https://docs.dropboxapi.com/dropbox-api/docs/get-started/authorization).

Registrar una aplicación no conecta las cuentas del estudio ni de sus profesionales. Cada persona debe conceder su propia autorización. Si el Host no tiene la aplicación preparada, el botón informa del requisito administrativo; no simula un ingreso exitoso.

### Pruebas técnicas anteriores con tokens

Las siguientes modalidades documentan pruebas técnicas anteriores. Los formularios de tokens de Google y GitHub se retiraron del catálogo habitual. El recorrido del profesional es **Conectar → ingreso oficial → volver a LexOpen**. Iniciar sesión en una pestaña por separado no configura automáticamente la conexión API.

- **Google Workspace:** en [OAuth Playground de Google](https://developers.google.com/oauthplayground/), use acceso **Online** y el único alcance `https://www.googleapis.com/auth/drive.metadata.readonly`. Inicie sesión personalmente, intercambie el código y pegue sólo el access token en el campo reservado. Esta modalidad temporal bloquea escrituras y comprueba `Drive about` con `fields=user(permissionId)`; no comprueba Gmail ni acceso al contenido de documentos. Caduca según Google y no se renueva automáticamente. Requiere reconstruir el gateway con el refuerzo que añade el campo `token`.
- **GitHub:** cree un [token fine-grained](https://github.com/settings/personal-access-tokens/new) de un día, con acceso sólo al repositorio elegido y `Contents: Read-only`; `Metadata` se incluye. La comprobación consulta `/user`. Leer un README requiere además el permiso de contenido del repositorio.

La persona realiza el ingreso, consentimiento y creación de credenciales. Pegue los valores únicamente en los campos reservados de LexOpen; nunca en la conversación. Cierre las páginas que muestren tokens antes de continuar una revisión compartida. Las operaciones posteriores siguen requiriendo autorización individual. La modalidad OAuth con aplicación propia conserva sus requisitos y permisos del proveedor.

### Qué ofrece el catálogo

| Área | Aplicaciones y servicios |
| --- | --- |
| Mensajería | Slack, Discord, Telegram, WhatsApp, Email SMTP, Matrix, Google Chat, Microsoft Teams, ntfy. |
| Oficina y archivos | Google Workspace, Microsoft 365, Airtable, Nextcloud, Google Sheets, Dropbox. |
| Productividad | Notion, Trello, Todoist, Linear, Jira, Zendesk, Things y OmniFocus. |
| Código | GitHub, GitLab, Gitea/Forgejo y Motita. |
| Redes sociales | Mastodon, Bluesky, X, LinkedIn, Facebook Page e Instagram. |
| Calendario y contactos | CalDAV, CardDAV y Calendario/Recordatorios/Contactos de macOS. |
| Dibujo | Kroki, Figma y Excalidraw. |
| Otros | Stripe, Home Assistant, RSS, clima, Spotify, TIDAL, API HTTP, webhook y Programa. |

Los 48 registros corresponden a adaptadores del contrato fijado, con operaciones distintas. **Programa está bloqueado** en LexOpen porque ejecutaría comandos en el Host del gateway. Los conectores nativos de macOS sólo se ofrecen cuando el gateway acredita `darwin`; pueden requerir permisos de Automatización concedidos por la persona y operan sobre aplicaciones del Host, fuera del escritorio en contenedor.

Algunos requisitos particulares:

- OAuth suele necesitar una aplicación registrada por el operador y un retorno exacto al gateway. Una compilación propia no incluye automáticamente credenciales OAuth de un tercero. Mastodon y Home Assistant tienen mecanismos particulares de registro.
- WhatsApp utiliza Cloud API; Facebook requiere página e Instagram una cuenta profesional compatible. No representan acceso general a cualquier cuenta personal.
- Google Sheets usa Apps Script/webhook. Email es SMTP y puede requerir contraseña de aplicación; Google Workspace es un conector distinto.
- El control de reproducción de Spotify depende de las condiciones del proveedor, como cuenta Premium y dispositivo activo. TIDAL no acredita control de reproducción.
- Los archivos que un conector deje en la biblioteca del gateway no se importan automáticamente a expedientes de LexOpen. Su incorporación debe preservar los permisos y las fuentes.

## Guardar y escribir un secreto

1. Abra **Conexiones → Secretos**, asigne nombre y aplicación e introduzca el valor únicamente en su formulario reservado. El usuario es opcional y se muestra en la lista.
2. El valor se guarda cifrado. La lista y la consulta individual devuelven sólo metadatos. Sustituirlo, o cambiar su nombre o aplicación, requiere introducir de nuevo el valor.
3. Abra la Computadora, tome el control y seleccione el campo de la página. Elija el secreto, indique el origen HTTPS y el campo que usted comprobó y prepare su uso.
4. Revise el destino declarado y confirme **Escribir una vez**. La autorización dura hasta 60 segundos, pertenece a esa sesión y versión del secreto y se consume antes del envío. No pulsa Enter ni envía el formulario; mantiene el control manual.
5. Compruebe el resultado. Si la respuesta es incierta, revise si se escribió antes de autorizar otro uso. Cambiar el campo mediante los controles de LexOpen, devolver el control, rotar el secreto o perder acceso invalida la autorización pendiente.

El escritorio comprueba sesión, gateway y control manual. **No verifica el DOM ni demuestra que la dirección o el campo declarado coincidan con la página.** La persona debe comprobarlos. Use un campo de contraseña oculto: el sitio puede leer lo escrito y, si lo muestra, el modelo podría verlo al devolverle el control.

Los valores admiten hasta 2.000 bytes UTF-8. LexOpen no los incorpora al chat, grafo, auditoría ni recibos de acciones. El borrado elimina el cifrado de la base actual y sus autorizaciones; no elimina copias de seguridad anteriores ni credenciales ya enviadas al sitio. Revóquelas también en el proveedor cuando corresponda.

## Administrar el entorno

### Instancias y almacenamiento

Prepare un gateway de escritorio independiente, con directorios nuevos, para cada profesional y ámbito. Las bibliotecas y ajustes globales del gateway no tienen el aislamiento entre usuarios de LexOpen: no reutilice esa instancia o sus datos para otra persona o causa. LexOpen reserva el endpoint y rechaza escritorios ajenos.

El escritorio utiliza contenedores, no una VM con kernel propio. No monte carpetas de expedientes, PostgreSQL, credenciales, configuración de Codex ni el directorio personal del Host. Entregue sólo los archivos elegidos para la tarea. Configure por separado el proveedor de IA del gateway.

| Ubicación | Protección y alcance |
| --- | --- |
| **Secretos de LexOpen** | AES-256-GCM con clave derivada de `SESSION_SECRET` y vínculo a propietario, identificador y versión. La API no devuelve el valor. Los recibos utilizan HMAC y no hashes simples de contraseñas. |
| **Token del gateway en LexOpen** | Cifrado y vinculado a propietario, espacio y ámbito. No se devuelve al navegador ni al modelo. |
| **Ajustes de conectores del gateway** | El contrato fijado guarda JSON con permisos `0600`, dentro de un directorio `0700`. Los permisos **no son cifrado**: la cuenta del proceso o quien pueda leer una copia puede acceder a las credenciales conservadas allí. |

Proteja directorios y respaldos del gateway con una cuenta de sistema dedicada y permisos adecuados. En Windows compruebe las ACL de la carpeta: los modos Unix no acreditan por sí solos su protección. Su vault interno es otro mecanismo; el adaptador no importa sus credenciales ni tokens de otras conexiones automáticamente. Conserve la configuración segura del Host: perder o sustituir `SESSION_SECRET` impide abrir los valores cifrados existentes.

### Construir el gateway reforzado

La construcción del servicio usa una revisión fija, identificada en el [flujo de comprobación del escritorio](../.github/workflows/ci.yml). La [receta única del gateway](../scripts/altazor/prepare-gateway-source.mjs) aplica los veinte refuerzos ordenados hasta `gateway.18`, con sus pruebas de scripts y los pasos de formato necesarios entre etapas. Incluye las conexiones persistentes, las descargas verificadas, las autorizaciones del computador, la creación inicial de cuentas autorizadas y el enfoque nativo de archivos de las cuatro cuentas seleccionadas, los metadatos tipados y parciales de Dropbox y OneDrive y la renovación persistente de GitHub con el permiso `read:user` y la preparación determinista de consultas de metadatos con aprobación de un solo uso, sin delegar sus argumentos al modelo. CI y la compilación manual deben usar esa misma receta. La gestión de Drive utiliza un puente autenticado para carpetas y copias verificadas, con permiso explícito y un registro persistente que impide repetir una escritura incierta. El conector genérico utilizado por el modelo conserva lectura; la [integración de Drive por causa](DRIVE-CAUSAS-2026-11-08.md) explica el flujo y sus límites.

Para compilar manualmente, reproduce esos pasos en directorios nuevos, sin archivos ni credenciales del usuario. El refuerzo valida las huellas de la revisión, desactiva los cambios de permisos solicitados por el modelo y exige confirmación por operación. No lo apliques sobre los datos de una instalación existente.

Después de archivar la revisión pública y crear su marcador `.lexopen-source-commit` como indica CI, ejecuta:

```sh
node scripts/altazor/prepare-gateway-source.mjs /ruta/al/codigo-publico-archivado
```

Necesita Node.js y `gofmt` de la versión de Go fijada en CI. `LEXOPEN_GOFMT` permite indicar la ruta de ese ejecutable. La receta prepara sólo el código: no compila ni instala un servicio, no crea credenciales ni cambia una instancia existente. Ante un error se detiene sin reintentar; conserva la copia para el diagnóstico y utiliza otra copia limpia al corregirlo. Las pruebas Go y la compilación se ejecutan después, como en CI.

El refuerzo de lectura habilita `page_read` paginado y `document_read` al modelo, además del endpoint de lectura restringida usado por LexOpen. Requiere reconstruir el perfil `lexopen-desktop-tools-2`. El perfil anterior no contiene el lector: si la lectura no está disponible, actualiza el ejecutable y reconstruye la imagen; no basta con reiniciar una imagen antigua.

El instalador actual prepara automáticamente **la imagen de herramientas** (ofimática, OCR, PDF y audio). El gateway dedicado y su configuración por profesional se instalan por separado. Descargar esa imagen o completar esta receta no acredita que el servicio esté instalado ni conectado. Comprueba su respuesta de salud y la conexión desde LexOpen.

La respuesta de salud de la compilación reforzada debe incluir `lexopen_connector_gate: "v1"` y `lexopen_connector_platform` con su sistema real. LexOpen exige esa capacidad antes de habilitar conexiones; un gateway sin el refuerzo puede seguir ofreciendo el escritorio sin conectores. El indicador es una capacidad del ejecutable administrado localmente, no una certificación externa.

Para recibir encargos también necesita `lexopen_async_messages: "v1"`. LexOpen usa un identificador persistido por encargo y exige un recibo HTTP 202 con ese mismo identificador y el chat correspondiente. El escritorio guarda el encargo y permite cancelarlo antes de consultar al modelo. Una repetición del mismo identificador conserva el recibo sin ejecutar otra vez; tras reiniciar, los trabajos interrumpidos quedan registrados y no se reanudan solos. La aceptación confirma la recepción, no la terminación del trabajo, que se consulta en su actividad. Un gateway anterior puede seguir consultándose o deteniéndose, pero no recibe tareas mediante el antiguo envío síncrono.

Prepara la imagen y una configuración nueva siguiendo la [guía del escritorio](ESCRITORIO-ALTAZOR.md). Usa un motor local disponible, directorios dedicados, una dirección local, puerto propio y autorización independiente. Revisa los registros del servicio antes de compartirlos: su salida puede contener datos de acceso.

### Habilitarlo en LexOpen

1. Active `ALTAZOR_COMPUTER_ENABLED=1` en el Host y mantenga un listener explícito en loopback, mediante `LEXOPEN_BIND=127.0.0.1` o su equivalente admitido. La función está desactivada por defecto.
2. Desde un navegador local, configure en Computadora el endpoint loopback, token y proveedor. Un navegador remoto no puede configurar servicios de loopback del Host. El adaptador no admite gateways remotos/TLS.
3. Confirme la instancia independiente para ese profesional y ámbito, compruebe su estado y configure las conexiones necesarias.
4. Abra la sesión con selección explícita. LexOpen transmite `['-']` para ninguna conexión: una lista vacía en el contrato original del gateway significaría todas.
5. Pruebe autorizaciones, control y cierre con archivos y cuentas de prueba antes de utilizar documentos del estudio.

La política **sólo IA local** bloquea crear y reanudar escritorios, tareas y control/entrada para este adaptador: un gateway loopback no acredita el destino de su modelo independiente. Los escritorios nuevos son **persistentes, sin vencimiento automático**. LexOpen configura `auto_off_minutes: 0` en el motor y comprueba su respuesta. Cerrar la página no detiene el trabajo. **Detener escritorio** cancela la tarea y apaga el contenedor, conservando sus archivos y conversación. **Reanudar el mismo escritorio** reutiliza el contenedor y el chat confirmados; no reenvía tareas anteriores. Las sesiones temporales anteriores pueden convertirse con **Conservar escritorio persistente**, tras comprobar nuevamente permisos, ámbito, gateway e identidad. La migración no amplía automáticamente los permisos de sesiones antiguas. Los controles de presupuesto por tarea, autorización de Secretos y toma del teclado mantienen sus límites independientes.

## Encargar desde la conversación

En una conversación personal o de causa, ALTAZOR puede consultar los escritorios propios de ese mismo ámbito. Abra uno previamente; la conversación no crea escritorios ni amplía su selección de aplicaciones. Al pedir un encargo, el plan muestra el texto completo (hasta 4000 caracteres), la sesión, el proveedor independiente y las aplicaciones autorizadas. Sólo la confirmación de ese plan permite enviarlo; no se transfieren archivos, memoria ni secretos. La tarjeta «Abrir escritorio» lleva a la sesión correspondiente.

Las acciones de sus aplicaciones siguen pidiendo autorización individual en el escritorio. Un resultado incierto conserva su recibo sin reenvío automático. Las credenciales admiten hasta 2000 bytes UTF-8 para ser compatibles con el teclado del entorno fijado.

Los enlaces recuperan expresamente la causa y sesión autorizadas aunque hayan salido de las listas recientes. Una conversación archivada conserva sus resultados históricos de escritorio, con comprobación del acceso vigente; no admite nuevos encargos ni confirmaciones.

## Validación y diagnóstico

```bash
npm run test:altazor
# Sólo con DATABASE_URL y E2E_DATABASE_URL iguales, en una base local test/e2e desechable:
npm run test:altazor:integration
```

Las pruebas de conectores y Secretos utilizan cuentas y gateways ficticios. Comprueban aislamiento, versiones, idempotencia, confirmación, errores inciertos sin reenvío, borrado y concurrencia. El flujo integrado también prueba la transición de inicio a listo y que una escritura no se solape con clics o devolución de control.

Las pruebas Go comprueban el refuerzo del contrato fijado. El job separado `altazor-computer-runtime` verifica contenedores reales con un proveedor HTTP de prueba. Estas comprobaciones no acreditan cuentas conectadas de los 48 servicios ni el rendimiento autónomo de un modelo. Las capturas documentan la interfaz y su fixture.

| Situación | Qué revisar |
| --- | --- |
| Catálogo visible, conexiones no disponibles | Gateway dedicado, capacidad `lexopen_connector_gate`, configuración e inicio de sesión del proveedor. |
| macOS nativo no disponible | Plataforma del gateway y permisos de Automatización; un gateway Linux no concede acceso a las aplicaciones Mac. |
| Programa deshabilitado | Es una restricción del adaptador. No habilite comandos del Host para resolverla. |
| Resultado desconocido | Compruebe sitio, campo o cuenta antes de autorizar otra operación. No reenvíe automáticamente. |
| Autorización de secreto vencida o cambiada | Tome el control, seleccione el campo y prepare otra. Revise versión y acceso a la causa. |
| No se puede descifrar | Revise la configuración segura original o sustituya el valor; no hay recuperación de texto sin la clave. |

Código de LexOpen: [catálogo](../src/lib/altazor/connectors/catalog.ts), [refuerzo](../scripts/altazor/harden-connectors.mjs), [Secretos](../src/lib/altazor/secrets/service.ts) y [flujo integrado](../src/lib/altazor/secrets/computer-secrets.integration.test.ts).
