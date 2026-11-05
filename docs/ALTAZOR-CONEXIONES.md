# Conexiones y Secretos de ALTAZOR

Esta guía describe el código `1.1.0-preview.4`. Consulte los archivos efectivamente publicados en [Releases](https://github.com/gabrielperezibacache/lexopen/releases). El catálogo nuevo, sus autorizaciones y Secretos no están incluidos en los instaladores anteriores `preview.3` (`c878fc5`).

[Galería real de escritorio y móvil](altazor-conexiones-2026-11-04/README.md), con datos ficticios, gateway simulado y manifiesto de imágenes. La imagen interna del escritorio de esa galería es sintética; no acredita contenedores reales ni cuentas conectadas.

## Conectar una aplicación

1. Abra **Mi jornada → Conexiones** y busque por nombre o categoría. Una tarjeta del catálogo no concede acceso a una cuenta.
2. El administrador debe haber preparado la Computadora dedicada para su cuenta y ámbito. Abra la configuración de una conexión, introduzca los campos del servicio y guarde. Los campos reservados no vuelven a mostrar su valor guardado.
3. Cuando corresponda, use **Iniciar sesión** en el proveedor y conceda únicamente los permisos que esté dispuesto a entregar a esa cuenta. **Comprobar** consulta el resultado que admita el conector.
4. Al crear un escritorio, elija expresamente las conexiones que podrá usar. Una selección vacía significa ninguna. La selección queda fijada a esa sesión; cambiar la configuración requiere cerrar las sesiones activas o inciertas.
5. En el escritorio, revise cada solicitud pendiente: aplicación, operación, destino y contenido. Autorice o rechace esa operación concreta. La decisión no concede permiso permanente.

El gateway reforzado exige confirmación incluso para lecturas. El modelo no puede modificar esas reglas. Los permisos concedidos mediante OAuth pueden ser más amplios que una tarea; la revisión por operación limita el uso desde LexOpen, pero no reduce los permisos de la cuenta en el proveedor. Una respuesta incierta se conserva y no se reenvía automáticamente.

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

Los valores admiten hasta 2.000 caracteres. LexOpen no los incorpora al chat, grafo, auditoría ni recibos de acciones. El borrado elimina el cifrado de la base actual y sus autorizaciones; no elimina copias de seguridad anteriores ni credenciales ya enviadas al sitio. Revóquelas también en el proveedor cuando corresponda.

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

La política **sólo IA local** bloquea crear sesiones, tareas y control/entrada para este adaptador: un gateway loopback no acredita el destino de su modelo independiente. Las sesiones tienen un límite de acceso de veinte minutos; vencer no demuestra que el contenedor ni sus archivos hayan sido destruidos. El operador debe detener y retirar los recursos de su instancia.

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
