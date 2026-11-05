# Conexiones y Secretos de ALTAZOR

Esta guía describe el código `1.1.0-preview.4`. Consulte los archivos efectivamente publicados en [Releases](https://github.com/gabrielperezibacache/lexopen/releases). El catálogo nuevo, sus autorizaciones y Secretos no están incluidos en los instaladores anteriores `preview.3` (`c878fc5`).

El ingreso simplificado, la renovación y el cierre tras vencimiento se incorporan en el desarrollo posterior a `preview.4`. Su presencia en esta guía no acredita que exista un nuevo instalador publicado.

[Galería real de escritorio y móvil](altazor-conexiones-2026-11-04/README.md), con datos ficticios, gateway simulado y manifiesto de imágenes. La imagen interna del escritorio de esa galería es sintética; no acredita contenedores reales ni cuentas conectadas.

## Conectar una aplicación

1. Abra **Mi jornada → Conexiones** y elija Google Workspace o GitHub. Una tarjeta del catálogo no concede acceso a una cuenta.
2. Pulse **Conectar**, revise el acceso solicitado e inicie sesión personalmente en la página oficial. Contraseñas y códigos se introducen allí; no se envían al chat.
3. Vuelva a LexOpen para comprobar el resultado. La conexión sólo se muestra confirmada cuando la autorización y la comprobación del servicio terminaron correctamente. Una denegación o interrupción no se presenta como conexión exitosa.
4. Al crear un escritorio, elija expresamente las conexiones que podrá usar. Una selección vacía significa ninguna. La selección queda fijada a esa sesión; cambiar la configuración requiere cerrar las sesiones activas o inciertas.
5. En el escritorio, revise cada solicitud pendiente: aplicación, operación, destino y contenido. Autorice o rechace esa operación concreta. La decisión no concede permiso permanente.

El gateway reforzado exige confirmación incluso para lecturas. El modelo no puede modificar esas reglas. Los permisos concedidos mediante OAuth pueden ser más amplios que una tarea; la revisión por operación limita el uso desde LexOpen, pero no reduce los permisos de la cuenta en el proveedor. Una respuesta incierta se conserva y no se reenvía automáticamente.

El administrador prepara una vez la aplicación OAuth del servicio y el escritorio dedicado. Si falta esa preparación, el profesional ve un estado pendiente de activación; no debe crear claves para realizar su trabajo. Otros adaptadores pueden requerir configuración particular. Sus campos técnicos y la alternativa de tokens se encuentran en **Opciones avanzadas**.

La conexión personal de Google de ALTAZOR es distinta de **Google del estudio**: no reutiliza esa cuenta global ni sus autorizaciones de correo y calendario. El ingreso sencillo solicita sólo lectura de metadatos de Drive; GitHub solicita lectura de perfil y consulta de repositorios públicos. No acredita acceso a repositorios privados, Gmail, Calendar ni contenido de documentos.

### Inicio de sesión sencillo

La preparación corresponde al administrador del Host, una sola vez por despliegue. En **Preparación del administrador**, abra el registro oficial del servicio y guarde el identificador y secreto en los campos reservados. Se conservan cifrados y no vuelven a mostrarse; los profesionales no necesitan introducirlos. Como alternativa de despliegue, pueden configurarse estas variables reservadas del servidor, que tienen prioridad:

| Servicio | Configuración del servidor |
| --- | --- |
| Google | `ALTAZOR_GOOGLE_CLIENT_ID` y `ALTAZOR_GOOGLE_CLIENT_SECRET`. |
| GitHub | `ALTAZOR_GITHUB_CLIENT_ID` y `ALTAZOR_GITHUB_CLIENT_SECRET`. |

El retorno autorizado es el origen configurado de LexOpen seguido de `/api/altazor/connectors/oauth/callback`. Registre ese retorno exactamente en el proveedor. No añada contraseñas ni tokens a la URL. En un Host local, utilice su dirección loopback; una instalación publicada debe tener su propio registro y configuración autorizados por el proveedor.

Cada inicio vincula la autorización al profesional, a su sesión de LexOpen y al espacio elegido, con un plazo y uso único. El proveedor entrega la autorización al servidor, que la comprueba y la guarda expresamente en el gateway dedicado. El retorno al navegador contiene únicamente el identificador del intento. El conector de Google usa una autorización temporal, sin renovación automática en esta revisión; al caducar, la persona vuelve a conectar.

Registrar una aplicación no conecta las cuentas del estudio ni de sus profesionales. Cada persona debe conceder su propia autorización. Si el Host no tiene la aplicación preparada, el botón informa del requisito administrativo; no simula un ingreso exitoso.

### Opciones avanzadas: prueba con tokens

La alternativa de tokens es opcional para operadores y pruebas técnicas. El recorrido habitual del profesional es **Conectar → ingreso oficial → volver a LexOpen**. Iniciar sesión en una pestaña por separado no configura automáticamente la conexión API.

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

Prepare un gateway Kitties independiente, con directorios nuevos, para cada profesional y ámbito. Las bibliotecas y ajustes globales del gateway no tienen el aislamiento entre usuarios de LexOpen: no reutilice esa instancia o sus datos para otra persona o causa. LexOpen reserva el endpoint y rechaza escritorios ajenos.

El escritorio utiliza contenedores, no una VM con kernel propio. No monte carpetas de expedientes, PostgreSQL, credenciales, configuración de Codex ni el directorio personal del Host. Entregue sólo los archivos elegidos para la tarea. Configure por separado el proveedor de IA del gateway.

| Ubicación | Protección y alcance |
| --- | --- |
| **Secretos de LexOpen** | AES-256-GCM con clave derivada de `SESSION_SECRET` y vínculo a propietario, identificador y versión. La API no devuelve el valor. Los recibos utilizan HMAC y no hashes simples de contraseñas. |
| **Token del gateway en LexOpen** | Cifrado y vinculado a propietario, espacio y ámbito. No se devuelve al navegador ni al modelo. |
| **Ajustes de conectores del gateway** | El contrato fijado guarda JSON con permisos `0600`, dentro de un directorio `0700`. Los permisos **no son cifrado**: la cuenta del proceso o quien pueda leer una copia puede acceder a las credenciales conservadas allí. |

Proteja directorios y respaldos del gateway con una cuenta de sistema dedicada y permisos adecuados. En Windows compruebe las ACL de la carpeta: los modos Unix no acreditan por sí solos su protección. Su vault interno es otro mecanismo; el adaptador no importa sus credenciales ni tokens de otras conexiones automáticamente. Conserve la configuración segura del Host: perder o sustituir `SESSION_SECRET` impide abrir los valores cifrados existentes.

### Construir el gateway reforzado

El contrato se fija en el commit público **`6aee950bdf971ff41f3867763a0ec9f5ef8ef8e3`** de `madkoding/kitties`. La selección de conexiones necesita el refuerzo incluido en LexOpen; activar `approvals: ask` en una compilación sin ese refuerzo no lo sustituye.

Desde la raíz de LexOpen, use directorios nuevos de construcción, sin configuración ni credenciales del usuario. Estos comandos preparan el ejecutable; no configuran cuentas ni arrancan el servicio:

```bash
ALTAZOR_CHECKOUT=/ruta/nueva/kitties-checkout
ALTAZOR_SOURCE=/ruta/nueva/kitties-source
git clone --no-checkout https://github.com/madkoding/kitties.git "$ALTAZOR_CHECKOUT"
git -C "$ALTAZOR_CHECKOUT" checkout --detach 6aee950bdf971ff41f3867763a0ec9f5ef8ef8e3
mkdir "$ALTAZOR_SOURCE"
git -C "$ALTAZOR_CHECKOUT" archive HEAD | tar -xf - -C "$ALTAZOR_SOURCE"
printf '%s\n' 6aee950bdf971ff41f3867763a0ec9f5ef8ef8e3 > "$ALTAZOR_SOURCE/.lexopen-source-commit"
node scripts/altazor/harden-connectors.mjs "$ALTAZOR_SOURCE"
(cd "$ALTAZOR_SOURCE" && go test ./internal/chat -run '^TestLexOpen' -count=1)
make -C "$ALTAZOR_SOURCE" WEB=0 VERSION=lexopen-connector-gate-v1 build
```

Use la versión de Go requerida por el `go.mod` fijado y las herramientas de construcción del proyecto. El parche comprueba huellas antes de escribir, desactiva los cambios de permisos solicitados por el modelo y exige confirmación nueva por operación. Reaplicarlo a una fuente modificada falla: extraiga otra copia limpia en lugar de eliminar las comprobaciones. No lo ejecute sobre datos del gateway.

La respuesta de salud de la compilación reforzada debe incluir `lexopen_connector_gate: "v1"` y `lexopen_connector_platform` con su sistema real. LexOpen exige esa capacidad antes de habilitar conexiones; un gateway sin el refuerzo puede seguir ofreciendo el escritorio sin conectores. El indicador es una capacidad del ejecutable administrado localmente, no una certificación externa.

Prepare la imagen de escritorio y una configuración nueva siguiendo [Computadora: operación y prueba real](../src/lib/altazor/computer/README.md). Utilice un runtime disponible, directorios dedicados, listener en `127.0.0.1` o `::1`, puerto propio y token independiente. Para arrancar el gateway preparado:

```bash
"$ALTAZOR_SOURCE/dist/kitties" -config /ruta/privada/gateway.yaml gateway
```

El gateway puede imprimir su token al iniciar: no publique la salida sin revisar. Configure aplicaciones OAuth, permisos y proveedor únicamente en ese entorno. Las restricciones de red de una prueba aislada no constituyen la configuración productiva de sus cuentas.

### Habilitarlo en LexOpen

1. Active `ALTAZOR_COMPUTER_ENABLED=1` en el Host y mantenga un listener explícito en loopback, mediante `LEXOPEN_BIND=127.0.0.1` o su equivalente admitido. La función está desactivada por defecto.
2. Desde un navegador local, configure en Computadora el endpoint loopback, token y proveedor. Un navegador remoto no puede configurar servicios de loopback del Host. El adaptador no admite gateways remotos/TLS.
3. Confirme la instancia independiente para ese profesional y ámbito, compruebe su estado y configure las conexiones necesarias.
4. Abra la sesión con selección explícita. LexOpen transmite `['-']` para ninguna conexión: una lista vacía en el contrato original del gateway significaría todas.
5. Pruebe autorizaciones, control y cierre con archivos y cuentas de prueba antes de utilizar documentos del estudio.

La política **sólo IA local** bloquea crear sesiones, tareas y control/entrada para este adaptador: un gateway loopback no acredita el destino de su modelo independiente. Las sesiones tienen un límite de acceso de veinte minutos. **Mantener sesión 20 min** requiere confirmación personal y vuelve a comprobar permisos, ámbito, gateway y el mismo escritorio, con un máximo de dos horas desde su creación. No inicia otro contenedor ni copia la sesión del navegador; una renovación invalida autorizaciones de Secretos preparadas antes. El asistente no puede renovarse por sí mismo. Después del vencimiento siguen disponibles **Cancelar tarea** y **Detener escritorio**, con comprobación del acceso actual; no se reabren las herramientas de trabajo ni Secretos. Vencer no demuestra que el contenedor ni sus archivos hayan sido destruidos: el operador debe detener y retirar los recursos de su instancia.

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

Fuentes del contrato fijado: [catálogo](https://github.com/madkoding/kitties/blob/6aee950bdf971ff41f3867763a0ec9f5ef8ef8e3/internal/connector/catalog.go), [OAuth](https://github.com/madkoding/kitties/blob/6aee950bdf971ff41f3867763a0ec9f5ef8ef8e3/internal/oauth/oauth.go), [ajustes](https://github.com/madkoding/kitties/blob/6aee950bdf971ff41f3867763a0ec9f5ef8ef8e3/internal/orchestrator/settings.go) y [entrada manual por stdin](https://github.com/madkoding/kitties/blob/6aee950bdf971ff41f3867763a0ec9f5ef8ef8e3/internal/orchestrator/control.go). Código de LexOpen: [catálogo](../src/lib/altazor/connectors/catalog.ts), [refuerzo](../scripts/altazor/harden-connectors.mjs), [Secretos](../src/lib/altazor/secrets/service.ts) y [flujo integrado](../src/lib/altazor/secrets/computer-secrets.integration.test.ts).
