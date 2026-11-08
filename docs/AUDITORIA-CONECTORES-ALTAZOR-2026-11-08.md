# Auditoría de conexiones de Altazor — 2026-11-08

## Qué se revisó

Lectura del catálogo, intersección con las capacidades nativas, validación de acceso, OAuth guiado y avanzado, enlace de la conversación al escritorio, aprobación y continuación de resultados. No se inspeccionaron credenciales, cuentas, navegador, VM ni Host desde este subagente. Los estados reales indicados proceden de pruebas realizadas por el agente principal en esta tarea.

Hay **48 adaptadores**: **4 accesos guiados** (Google, GitHub, Dropbox y Microsoft), **17 OAuth avanzados**, **23 configuraciones de credencial/servicio**, **3 integraciones sólo macOS** y **1 programa de Host bloqueado**. Estar en el catálogo no equivale a estar disponible, conectado ni comprobado.

## Problemas concretos

1. **Corregido en la rama de trabajo: el chat no encaminaba Dropbox/OneDrive.** `connector-desktop-intent.ts:8-11` sólo reconocía Drive/GitHub y tampoco «Comprueba/Verifica». Ahora reconoce esos encargos de lectura conservando el texto íntegro y dejando fuera negaciones, hipótesis e instrucciones de cómo conectar.
2. **Corregido en la rama de trabajo: faltaban instrucciones de herramientas cloud.** `tools/desktop-connector-task.ts:12-15` añade las recetas reales `list/search/download_file`, las rutas literales de Dropbox e identificadores OneDrive, límites como texto, archivos ambiguos, metadatos frente a contenido y separación de correo/calendario. Sólo se inyectan aliases generados por servidor para el propietario/espacio y seleccionados en esa sesión.
3. **Corregido en la rama de trabajo: Dropbox/OneDrive no reanudaban tras aprobar metadatos.** `computer/gateway.ts:213-217` ahora permite una continuación ligada a la decisión persistida para list/search y los GET de metadatos OneDrive admitidos. La política de lectura se valida antes; las descargas staged conservan su recibo y no lanzan el modelo. La prueba PG comprueba ambas nubes e idempotencia.
4. **Corregido: la descripción del encargo identifica las cuatro conexiones guiadas.** La vista previa muestra Drive, GitHub, Dropbox y OneDrive por su nombre, conservando los límites de lectura y los repositorios públicos de GitHub.
5. **Pendiente de integración OneDrive verificada en conversación.** `computer/types.ts:18`, `file-task.ts` y `file-receipt.ts` sólo admiten Google/GitHub/Dropbox en la vía determinista y recibo tipado. El nativo ofrece download_file de OneDrive y la política lo admite, pero eso no prueba que la vía completa de recibo sea utilizable en la conversación. No prometer paridad antes de ampliarla y probarla.
6. **Pendiente de producto: 40 adaptadores de gateway siguen avanzados.** Para éstos no hay la misma experiencia «Conectar e iniciar sesión» de los cuatro guiados. El catálogo intersecta la disponibilidad nativa y el estado distingue guardar de comprobar correctamente. Priorizar los que la persona necesite y no presentar todos como cuentas ya utilizables.
7. **Claridad pendiente en tarjetas Google Workspace/Microsoft 365.** El catálogo describe correo/calendario/escritura, pero el acceso guiado actual es Drive/OneDrive de lectura. Los paneles detallados sí delimitan permisos. Conviene hacer visible esta diferencia en la tarjeta y en el resumen de aplicaciones del chat; no solicitar más permisos para armonizar el texto.
8. **Pruebas externas pendientes.** Google necesita revisión pública; Microsoft requiere registro/ingreso que no se ha completado; los otros proveedores necesitan cuentas o recursos seleccionados. No se debe llamar «verificación de las 48 conexiones» a esta revisión de código.

## Matriz proveedor por proveedor

Las capacidades avanzadas declaradas están sujetas a disponibilidad del runtime y autorización por uso. El inicio de sesión guiado Google/GitHub/Microsoft no habilita todas las acciones genéricas de sus adaptadores.

| Proveedor | Acceso | Uso disponible/declarado | Estado de esta tarea | Evidencia de catálogo |
| --- | --- | --- | --- | --- |
| Slack | OAuth avanzado / aplicación propia o credencial | Enviar mensajes, consultar historial | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:7 |
| Discord | Credencial, webhook o servicio avanzado | Enviar por webhook | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:28 |
| Telegram | Credencial, webhook o servicio avanzado | Bot: enviar y consultar actualizaciones | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:43 |
| WhatsApp | Credencial, webhook o servicio avanzado | Enviar por Cloud API | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:61 |
| Email | Credencial, webhook o servicio avanzado | Enviar por SMTP; no recibe correo | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:79 |
| Matrix | Credencial, webhook o servicio avanzado | Enviar a una sala | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:98 |
| Mastodon | OAuth avanzado / aplicación propia o credencial | Publicar y consultar la instancia | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:115 |
| Bluesky | Credencial, webhook o servicio avanzado | Publicaciones, timeline y notificaciones | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:137 |
| X (Twitter) | OAuth avanzado / aplicación propia o credencial | Publicaciones, menciones y reacciones | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:157 |
| LinkedIn | OAuth avanzado / aplicación propia o credencial | Publicaciones, comentarios y reacciones | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:183 |
| GitHub | Inicio de sesión guiado | Consulta pública de archivos e incidencias en el acceso guiado | Cuenta y descarga real verificadas por root; sólo repositorios públicos | src/lib/altazor/connectors/catalog.ts:204 |
| GitLab | OAuth avanzado / aplicación propia o credencial | Incidencias, comentarios y API | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:228 |
| Gitea / Forgejo | Credencial, webhook o servicio avanzado | Crear incidencias | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:249 |
| Motita | Credencial, webhook o servicio avanzado | Encargar tareas a otro gateway | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:266 |
| Notion | OAuth avanzado / aplicación propia o credencial | Crear páginas y añadir contenido | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:282 |
| Trello | Credencial, webhook o servicio avanzado | Crear tarjetas | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:302 |
| Todoist | OAuth avanzado / aplicación propia o credencial | Crear tareas y API | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:319 |
| Linear | OAuth avanzado / aplicación propia o credencial | Crear incidencias y API | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:338 |
| Jira | OAuth avanzado / aplicación propia o credencial | Buscar y crear incidencias | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:357 |
| Google Chat | Credencial, webhook o servicio avanzado | Enviar por webhook | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:379 |
| Microsoft Teams | Credencial, webhook o servicio avanzado | Enviar por webhook de Workflows; no Graph de chats | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:394 |
| Google Workspace | Inicio de sesión guiado | Drive: metadatos y contenido según permiso | Cuenta y descarga real verificadas por root; revisión pública de Google pendiente | src/lib/altazor/connectors/catalog.ts:409 |
| Microsoft 365 | Inicio de sesión guiado PKCE | OneDrive: listar, buscar y descargar con Files.Read | Registro y cuenta pendientes; código de lectura preparado | src/lib/altazor/connectors/catalog.ts:439 |
| Airtable | OAuth avanzado / aplicación propia o credencial | Añadir registros y API | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:467 |
| Nextcloud | Credencial, webhook o servicio avanzado | Leer/escribir mediante WebDAV | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:487 |
| Google Sheets | Credencial, webhook o servicio avanzado | Añadir filas mediante Apps Script | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:506 |
| Diagrams (Kroki) | Sin inicio de sesión; configuración del recurso | Generar SVG de diagramas | Sin prueba real de extremo a extremo en esta auditoría | src/lib/altazor/connectors/catalog.ts:521 |
| Figma | OAuth avanzado / aplicación propia o credencial | Consultar archivos y comentar | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:536 |
| Excalidraw | Sin inicio de sesión; configuración del recurso | Guardar escenas locales | Sin prueba real de extremo a extremo en esta auditoría | src/lib/altazor/connectors/catalog.ts:555 |
| Webhook | Credencial, webhook o servicio avanzado | Enviar JSON a un destino fijo | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:568 |
| HTTP API | Credencial, webhook o servicio avanzado | Llamar una API configurada | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:584 |
| Program | Bloqueado | Ejecutar un programa del Host: bloqueado | No se debe habilitar en el escritorio aislado | src/lib/altazor/connectors/catalog.ts:600 |
| Stripe | Credencial, webhook o servicio avanzado | Consultar pagos/facturas; acciones financieras declaradas | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:616 |
| Zendesk | OAuth avanzado / aplicación propia o credencial | Consultar tickets y responder | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:636 |
| ntfy (push) | Credencial, webhook o servicio avanzado | Enviar notificaciones push | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:658 |
| Calendar & reminders (CalDAV) | Credencial, webhook o servicio avanzado | Consultar/crear eventos y recordatorios | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:675 |
| Contacts (CardDAV) | Credencial, webhook o servicio avanzado | Consultar/crear contactos | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:699 |
| Mac Calendar, Reminders & Contacts | Integración macOS | Calendario, recordatorios y contactos del Mac del gateway | No disponible en la VM Linux actual; requiere gateway macOS y permisos propios | src/lib/altazor/connectors/catalog.ts:718 |
| Home Assistant | OAuth avanzado / aplicación propia o credencial | Consultar estados y llamar servicios | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:741 |
| News feeds (RSS) | Sin inicio de sesión; configuración del recurso | Leer feeds RSS/Atom configurados | Sin prueba real de extremo a extremo en esta auditoría | src/lib/altazor/connectors/catalog.ts:759 |
| Weather | Sin inicio de sesión; configuración del recurso | Consultar pronóstico por localidad | Sin prueba real de extremo a extremo en esta auditoría | src/lib/altazor/connectors/catalog.ts:774 |
| Spotify | OAuth avanzado / aplicación propia o credencial | Búsqueda, listas y control Premium | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:789 |
| TIDAL | OAuth avanzado / aplicación propia o credencial | Búsqueda y listas; no reproducción remota | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:815 |
| Dropbox | Inicio de sesión guiado PKCE | Listar, buscar y descargar archivos con lectura | Cuenta, descarga completa y consulta real de cinco nombres PDF verificadas en esta auditoría | src/lib/altazor/connectors/catalog.ts:836 |
| Things (Mac) | Integración macOS | Consultar/crear/completar tareas del Mac del gateway | No disponible en la VM Linux actual; requiere gateway macOS y permisos propios | src/lib/altazor/connectors/catalog.ts:853 |
| OmniFocus (Mac) | Integración macOS | Consultar/crear/completar tareas del Mac del gateway | No disponible en la VM Linux actual; requiere gateway macOS y permisos propios | src/lib/altazor/connectors/catalog.ts:870 |
| Facebook Page | OAuth avanzado / aplicación propia o credencial | Gestionar una página y Messenger | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:885 |
| Instagram | OAuth avanzado / aplicación propia o credencial | Cuenta profesional: publicaciones y comentarios | Sin prueba con cuenta real en esta auditoría | src/lib/altazor/connectors/catalog.ts:910 |

## Evidencia transversal

- `connectors/easy-oauth-providers.ts:1-4`: cuatro proveedores guiados.
- `connectors/oauth-access.ts:6-12`: alcance Drive metadatos/contenido, GitHub read:user, Dropbox lectura, Microsoft Files.Read/User.Read.
- `connectors/desktop-read-policy.ts:20-103`: operaciones admitidas y destinos de sólo lectura para los aliases guiados.
- `connectors/policy.ts:32-50`: disponibilidad intersectada con catálogo nativo y bloqueo de integraciones macOS en Linux.
- `connectors/availability.ts:10-32`: conexión guardada no equivale a acceso comprobado.
- `computer/gateway.ts:170-184`: sesiones con selección explícita y reglas ask por conector; aprobaciones ligadas a kitty/chat/conector.
- `components/altazor/AltazorConnectorCatalog.tsx:160-168`: configuración avanzada, prueba de acceso y límites por plataforma.
- `components/altazor/AltazorConnectors.tsx`: LinkedIn de publicaciones tiene un flujo separado de borrador/revisión/autoría/audiencia; no equivale a una red académica propia ni acceso al feed/contactos.

## Validación del cambio acotado

29 pruebas unitarias PASS (routing, tareas originales, continuación, recibos y políticas), prueba PG desechable PASS para GitHub/Dropbox/OneDrive y ESLint sin errores. Las pruebas usan cuentas y gateway ficticios; las descargas reales las valida el agente principal. Manifiesto de archivos: `/private/tmp/lexopen-cloud-prompt-routing-agent-manifest.json`.

## Pruebas reales y perfeccionamiento del asistente

En la instalación privada se comprobó acceso y descarga completa desde Google Drive, GitHub y Dropbox. Dropbox descargó su PDF de bienvenida: 1.144.386 bytes y 10 páginas, con huella SHA-256 comprobada también mediante lectura independiente dentro del contenedor. No se modificaron archivos externos. Las pruebas de lectura se autorizaron una sola vez y el escritorio de prueba se detuvo al finalizar. Los datos privados de las cuentas y las evidencias locales no se incorporan al repositorio.

Microsoft queda pendiente por decisión del usuario. El inicio de sesión abrió su directorio académico; no se registró una aplicación ni se cambiaron permisos en esa institución. Esto no equivale a una cuenta OneDrive conectada. La revisión pública de Google sigue sujeta a la espera del proveedor y al vídeo demostrativo requerido.

Las instrucciones de Altazor ahora explican el flujo entre conversación persistente, memoria recuperada, causas, biblioteca, audiencias, escritos, investigación y docencia, escritorio y conectores. El mapa distingue las operaciones disponibles de una respuesta de texto. El ámbito personal o de causa lo aporta el servidor. Las conexiones seleccionadas no conceden permisos implícitos para correo, calendario o escritura. Una tarea pendiente, una captura o un clic no se presentan como resultado completado.

Las autorizaciones y las respuestas técnicas de Dropbox y OneDrive se presentan en español, con origen y destino visibles y detalles desplegables. Los recibos completos se conservan para revisión, sin interpretar instrucciones de los documentos externos.

La revisión independiente detectó que un modelo podía copiar el formato textual de una consulta y obtener su presentación visual de resultado. Ahora sólo un turno de aprobación generado por el gateway recibe la marca de procedencia del conector; el modelo no puede declararla mediante su texto ni mediante un campo de origen. Además se comprueba que el servicio y la acción sean compatibles. Los recibos tipados de archivos siguen verificándose por separado.

Una prueba real con el modelo local mostró otro error: trató una carpeta como PDF y convirtió una página de resultados en una afirmación sobre toda la cuenta. Los servicios ahora entregan metadatos con tipos explícitos y límites. Para los encargos inequívocos de mostrar sólo nombres, LexOpen filtra y cuenta los resultados mediante código, después de comprobar el origen y la autorización; no vuelve a consultar al modelo. Una carpeta llamada `.pdf` sigue siendo carpeta y un tipo incierto nunca se presenta como PDF. Los resultados siempre se refieren a la consulta recibida, con aviso de recorte cuando corresponde.

La revalidación de GitHub también reveló que una autorización temporal había vencido. Su modalidad actual permite accesos de ocho horas con un permiso de renovación; el flujo anterior descartaba ese permiso. Se añadió su almacenamiento y rotación segura para web y dispositivo, manteniendo únicamente `read:user`, y una opción para convertir la conexión temporal sin desconectarla. Las autorizaciones clásicas sin vencimiento conservan su funcionamiento. No se desactiva la caducidad del proveedor. [Protocolo oficial de GitHub](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).

Las pruebas automáticas comprueban renovación, rotación, concurrencia, reinicio, permisos y rechazo de respuestas inválidas. La validación con cuentas reales distingue guardar el par renovable, reiniciar y consultar del hecho de observar una rotación al vencer: esta última sólo se acredita cuando se alcanza su ventana natural, sin manipular fechas ni credenciales para simularla.

## Cierre de la validación del 8 de noviembre

La consulta real desde la conversación de Altazor preparó una búsqueda literal de `.pdf`, con máximo de cinco resultados y la cuenta de Dropbox elegida para el escritorio. Tras una autorización, devolvió cinco nombres tipados como archivos PDF. Se verificaron la huella y el tamaño del recibo, su pertenencia a esa petición y su origen en el conector. No se abrió ni descargó contenido en esa consulta. El resultado avisa que es una página y no un inventario completo. El escritorio de prueba se detuvo al terminar.

La preparación de las consultas inequívocas de nombres también pasa ahora por código: el modelo no decide los argumentos ni redacta el resultado. Los encargos generales conservan su flujo de IA. Un encargo nuevo espera a que se resuelva la autorización pendiente; la repetición de la misma petición conserva su resultado. Ante una pérdida de confirmación o un fallo al guardar el historial, se bloquea la repetición automática. Los recibos de metadatos y de descargas son contratos distintos.

Google Drive, GitHub y Dropbox respondieron con las cuentas reales tras reiniciar el motor actualizado, sin nuevos inicios de sesión. GitHub conserva su autorización renovable; no se ha esperado al vencimiento natural de su token para observar una rotación real. Ese caso se cubre mediante pruebas automáticas y no se presenta como observado con la cuenta del usuario.

La última compilación pasó 53 pruebas unitarias, cuatro pruebas de receta, cuatro suites de integración con PostgreSQL desechable y 25 pruebas Chromium. El motor pasó 190 casos y subcasos con detector de concurrencia, sin omisiones, y su receta reprodujo 280 archivos Go idénticos. Las pruebas con proveedores simulados y las comprobaciones con cuentas reales se mantienen separadas. La actualización quedó instalada en el entorno privado de validación, conservando cuenta, configuración, archivos y estética; este cierre no acredita publicación en `main` ni nuevos instaladores.

## Orden de continuidad

1. Retomar Microsoft cuando el usuario lo solicite: elegir el directorio administrador de la identidad y comprobar su cuenta y un archivo seleccionado.
2. Añadir paridad de recibos verificados de OneDrive antes de anunciar descargas equivalentes a las otras tres conexiones.
3. Completar la revisión pública de Google con evidencia del flujo web y de escritorio.
4. Priorizar los siguientes proveedores según el uso del estudio; preparar una identidad de publicación y ofrecer inicio de sesión guiado cuando el proveedor lo admita.
5. Validar cada cuenta real mediante una operación pequeña, con origen, resultado y límites explícitos. La revisión del catálogo no sustituye esa prueba.
