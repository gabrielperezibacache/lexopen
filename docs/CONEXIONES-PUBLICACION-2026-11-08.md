# Conexiones y preparación para publicación

Estado de trabajo al **8 de noviembre de 2026**, hora de Chile continental. Esta guía explica qué puede utilizarse en la instalación de validación, qué falta para distribuir las conexiones y qué debe contener el expediente de Google. Cumplir un requisito, guardar una configuración o superar una prueba no equivale a obtener la aprobación del proveedor.

## Estado de las conexiones

| Servicio | Comprobado hasta esta fecha | Pendiente para la distribución |
| --- | --- | --- |
| **Google Drive** | La aplicación está en Producción en la consola de Google. En la instalación privada se comprobó ingreso, consulta y descarga real, también después de reiniciar el motor. | La aplicación sigue **sin verificar**. La comprobación de marca permanece bloqueada y **Preparar** está deshabilitado. Falta el video y completar la revisión del proveedor. |
| **GitHub** | Ingreso y consulta o descarga real de recursos públicos, con autorización conservada después del reinicio. El perfil distribuible utiliza ingreso por dispositivo. | La rotación al vencimiento natural no se ha observado con la cuenta real; su tratamiento tiene pruebas automáticas. El acceso guiado no habilita repositorios privados. |
| **Dropbox** | Ingreso, consulta de nombres y descarga real. Se registró el retorno local de LexOpen, se conservó el retorno anterior y se guardaron la ficha de la aplicación y su política. El piloto admite hasta 500 usuarios. | Sigue en **Development**, no en Production. Falta cargar el icono oficial desde el selector de archivos de Dropbox y atender los requisitos que indique el proveedor para producción. |
| **Microsoft / OneDrive** | Hay preparación de código de lectura en el repositorio. | El registro y la prueba con cuenta real permanecen pendientes por decisión expresa del usuario. No se ha preparado un perfil distribuible de Microsoft ni se anuncia una conexión operativa. |

El catálogo contiene 48 adaptadores; la [auditoría de conexiones](AUDITORIA-CONECTORES-ALTAZOR-2026-11-08.md) detalla su alcance. Las comprobaciones reales anteriores corresponden a Google, GitHub y Dropbox. Los demás registros del catálogo no adquieren ese estado por aparecer en pantalla.

Se actualizaron los perfiles de aplicación para Google de escritorio (`installed`), GitHub por dispositivo (`device`) y Dropbox como cliente público (`public_client`) en la configuración protegida de distribución y de CI. Esa preparación no incorpora tokens de las cuentas de usuarios ni el secreto de un cliente web. Tampoco concede permisos a nuevas personas: cada titular debe iniciar sesión y autorizar su cuenta.

La interfaz separa el ingreso del profesional de la administración avanzada: los formularios técnicos permanecen cerrados y las tarjetas muestran acceso comprobado sólo cuando lo confirma OAuth para ese espacio. Los controles de publicación exigen un perfil público completo e idéntico en Windows, macOS y Linux. Las compilaciones de comprobación sin identidades se identifican como no publicables; Microsoft no es requisito. Esta ronda no acredita nuevos instaladores publicados ni una aprobación de Google.

## Cómo se conecta una cuenta

El recorrido del profesional es **Conectar → ingreso oficial del proveedor → autorización → volver a LexOpen → comprobar el acceso**. La configuración inicial de la identidad de la aplicación corresponde a quien la distribuye o administra; no se pide a cada profesional que registre un proyecto nuevo para utilizar una identidad ya preparada.

Los permisos del ingreso guiado son de lectura y tienen límites concretos:

| Servicio | Permiso del recorrido guiado | Límite relevante |
| --- | --- | --- |
| Google, consulta | `drive.metadata.readonly` | Nombres, tipos y otros metadatos; no permite leer el contenido del archivo. |
| Google, documentos | `drive.readonly` | Lectura y descarga o exportación de contenido existente. La ampliación requiere otra autorización explícita; no se infiere del permiso de metadatos. |
| GitHub | `read:user` | Perfil y recursos públicos admitidos por el conector; no repositorios privados. |
| Dropbox | `account_info.read`, `files.metadata.read`, `files.content.read` | Identificación de la cuenta y lectura de sus archivos según la operación autorizada. |

El botón actual **Conectar Google** solicita directamente lectura de archivos. Un usuario nuevo no necesita completar primero una conexión de metadatos y ampliarla después. Las cuentas antiguas que sólo conservan metadatos mantienen su ampliación explícita a contenido; no se cambia su permiso automáticamente. En los instaladores, GitHub puede pedir confirmar un código breve de dispositivo en su página oficial; no es una clave de API ni exige registrar otra aplicación. [Proceso oficial de GitHub](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps).

Estos accesos no habilitan correo, calendario, edición, borrado ni publicación. Las integraciones específicas de correo y calendario tienen configuración y permisos separados. Guardar una conexión, comprobar su acceso y ejecutar una consulta o descarga son estados distintos.

En Dropbox quedó registrado `http://127.0.0.1:3000/api/altazor/connectors/oauth/callback`; se conserva además el retorno previo de `localhost` en el puerto `3366`. Son retornos locales del piloto, no una afirmación de aprobación para producción. El perfil de cliente público evita introducir un secreto web en cada instalación.

## Mapa de datos y permisos

LexOpen funciona en un **Host propio** que conserva su base de datos y los archivos incorporados. El entorno privado de validación aloja el motor de escritorio en una **VM privada**; dentro de ella, el escritorio de trabajo se ejecuta en un contenedor. La VM y el contenedor son capas distintas. Cada profesional y ámbito necesita una instancia dedicada conforme a la [guía de conexiones](ALTAZOR-CONEXIONES.md#instancias-y-almacenamiento).

| Dato o acción | Recorrido y conservación | Qué debe autorizarse o comprobarse |
| --- | --- | --- |
| Identidad de la aplicación | Los perfiles de distribución permiten reconocer a LexOpen ante el proveedor. Son distintos de la cuenta personal y de sus credenciales. | La configuración del proveedor, sus retornos y el perfil de la instalación deben coincidir. |
| Ingreso y consentimiento | El titular se identifica en la página oficial. El retorno se valida en el Host y queda ligado a la sesión y al espacio que lo iniciaron. | La persona revisa la cuenta y los permisos. Las contraseñas y códigos no se escriben en la conversación. |
| Credenciales de acceso y renovación | Se conservan en los componentes reservados del Host y del motor privado que gestiona la conexión. No forman parte de los mensajes ni del archivo descargado. | Proteger la configuración, los directorios y los respaldos. Desconectar en LexOpen y revocar también en el proveedor cuando corresponda. |
| Consulta de nombres o metadatos | La solicitud sale desde el motor autorizado hacia el servicio elegido. El resultado conserva origen, tipos y límites de la página recibida. | Revisar la operación y conceder su autorización. Una consulta de nombres no acredita lectura del contenido ni un inventario completo de la cuenta. |
| Descarga o exportación | El servicio entrega los bytes al escritorio de trabajo. El recibo permite comprobar archivo, tamaño, huella y, cuando corresponde, páginas. | Elegir el archivo y autorizar la operación. Incorporarlo después a una causa o biblioteca es una acción distinta. |
| Trabajo con IA | El Host y el motor utilizan sus proveedores de IA configurados por separado. El contenido elegido sólo debe salir al destino mostrado cuando la operación y su envío estén autorizados. | Declarar el destino real y la política aplicable. Una dirección local del motor no demuestra que su modelo sea local. |
| Historial y respaldos | El Host conserva las conversaciones y los registros previstos por LexOpen; la instancia privada puede conservar archivos y configuración propios. | Detener un escritorio o revocar una cuenta no demuestra que se hayan eliminado copias anteriores ni respaldos. |

No se debe declarar que todos los datos permanecen locales cuando se ha configurado un proveedor de IA remoto o se consulta una nube. Los encargos inequívocos de mostrar sólo nombres cuentan con tratamiento determinista, según la auditoría citada; los encargos generales conservan su recorrido de IA y sus autorizaciones.

La protección tampoco es idéntica en todas las ubicaciones: los valores reservados de LexOpen tienen cifrado, mientras que los ajustes de conectores del motor se protegen mediante permisos de archivo y directorio. Esos permisos no equivalen a cifrado. La [guía operativa](ALTAZOR-CONEXIONES.md#instancias-y-almacenamiento) describe esta diferencia y la protección de respaldos. El expediente del proveedor debe describir la arquitectura real, incluidos Host, VM, motor, almacenamiento e IA, sin sustituirla por la expresión genérica «aplicación local».

## Expediente de Google

### Marca, dominio y espera

La presentación pública es [LexOpen](https://perezibacache.cl/lexopen/) y su [política de privacidad](https://perezibacache.cl/lexopen/privacidad/). La propiedad del dominio se acreditó en Search Console aproximadamente el **7 de noviembre a las 23:45 UTC**, equivalentes a las 20:45 de Chile. Debe conservarse el archivo de acreditación del alojamiento.

Google indicó esperar 24 horas tras esa comprobación. Por tanto, **no corresponde reintentar antes del 8 de noviembre a las 23:45 UTC, 20:45 de Chile continental**. La consulta de estado de esta fecha seguía mostrando la marca bloqueada y Preparar deshabilitado; no se reenviará antes de ese plazo. Cumplir la espera permite volver a comprobar el estado, no garantiza que el bloqueo desaparezca ni que Google apruebe la aplicación.

Producción, propiedad del dominio, marca y aprobación de acceso a datos son pasos diferentes. Google exige completar la marca antes de solicitar la revisión de acceso a datos. [Requisitos oficiales de verificación](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).

### Permisos y justificación

El expediente declara exclusivamente los permisos de Drive `drive.metadata.readonly` y `drive.readonly`. Google los clasificó como restringidos en esta preparación. No se añadieron permisos para Gmail, Calendar, escritura, borrado o publicación. La justificación guardada corresponde a consultar y descargar documentos existentes para el trabajo jurídico y académico.

Antes de enviarlo, se debe comprobar que la justificación describe las funciones observables y explica por qué un permiso más limitado no basta para ellas. Declarar o justificar un permiso no equivale a que Google lo haya aprobado. [Gestión oficial del acceso a datos](https://support.google.com/cloud/answer/15549135?hl=en).

### Video de demostración: pendiente

**No se ha generado ni subido el video. El campo de YouTube sigue vacío.** La guía siguiente prepara su grabación; no es evidencia de un video terminado.

Google pide demostrar el consentimiento en inglés, la pantalla completa con los permisos solicitados y las funciones que los utilizan, incluyendo **todos los clientes OAuth del proyecto**. En este caso deben mostrarse por separado el cliente web y el cliente de escritorio, con el nombre de LexOpen y su Client ID visible en el flujo oficial. La narración o los rótulos ayudan a identificar cada paso. [Guía oficial del video](https://support.google.com/cloud/answer/15549135?hl=en).

Preparar una cuenta y documentos de demostración, sin expedientes, nombres ni archivos privados. Mantener visibles el Client ID y los permisos necesarios para la revisión; ocultar contraseñas, códigos de recuperación, tokens y secretos. Si aparece una advertencia de aplicación no verificada, registrar ese estado real. Un cliente que no pueda completar su recorrido se documenta como pendiente: no se reemplaza por una captura simulada.

### Guion en inglés para la grabación

El guion es una pauta para narrar las acciones que se ejecuten realmente. El nombre de archivo propuesto, `LexOpen OAuth Demo.pdf`, corresponde a un documento ficticio que debe prepararse antes de grabar. No representa un archivo ya creado o descargado.

| Paso | Acción que debe verse | Narración propuesta en inglés |
| --- | --- | --- |
| 1. Presentación | Abrir la presentación pública y la política de privacidad. | “This is LexOpen, a legal and academic workspace. This public page describes the application and links to its privacy policy.” |
| 2. Cliente web: primer ingreso | Desde Conectar Google, mostrar el consentimiento oficial en inglés, el nombre de la aplicación, Client ID y permiso de lectura de archivos solicitado realmente. | “I am starting the web client flow. I am authorizing read-only access to existing Drive documents. This is the first connection flow; the user does not register a new developer project.” |
| 3. Consulta web | Volver a LexOpen, comprobar la conexión y buscar el documento ficticio. Mostrar límites y tipos recibidos. Elegir y autorizar su descarga. | “The connection has returned to LexOpen. I will search for the demonstration document. These are the results of this query; they are not a complete inventory of the account.” |
| 4. Consulta limitada heredada, si se conserva | Documentar por separado el recorrido real que todavía solicite `drive.metadata.readonly` y su ampliación explícita. Concretarlo con cuentas de prueba antes de grabar; no presentarlo como el primer ingreso actual ni inventar una opción de interfaz. | “This separate metadata-only authorization permits names and file types, not document contents. A legacy connection needs explicit authorization before it can read a document.” |
| 5. Resultado web | Mostrar el archivo real en el escritorio, abrirlo y contrastar el recibo con nombre, bytes, huella y páginas calculadas. | “The file is present in the task desktop. I will open it and compare it with the download receipt. The receipt describes the downloaded bytes; it is separate from any answer written by an AI model.” |
| 6. Cliente Desktop | Abrir el cliente de escritorio que se someterá a revisión. Repetir el ingreso y la consulta o descarga desde el navegador del sistema, mostrando su Client ID propio y el retorno a LexOpen. Cubrir por separado cualquier modalidad limitada que ese cliente aún solicite. | “I will now repeat the authorization and file workflow from the desktop client. This client has its own OAuth client ID. I will show both requested permissions, return to LexOpen, and verify a real query and download.” |
| 7. Datos e IA | Mostrar el destino y la autorización aplicables. Si se demuestra análisis, seleccionar sólo el PDF ficticio y registrar el resultado real. | “The workspace uses an operator-controlled Host and a private desktop environment. AI processing uses the configured destination and requires the applicable authorization. This demonstration uses only a test document.” |
| 8. Control del titular | Mostrar dónde se comprueba o desconecta la cuenta, sin revelar credenciales. | “The user can check or disconnect the connection here and revoke access in the provider account. Credentials are kept outside the conversation. Disconnecting an account does not claim to delete previously downloaded files or backups.” |

No se debe afirmar “Google verified”, “approved” o “published” durante el video si esos estados no existen. Tampoco debe afirmarse que el análisis de IA ha ocurrido por el solo hecho de haber descargado el archivo.

### Lista de evidencia antes del envío

1. Revisión de marca habilitada y estado real comprobado después del plazo indicado.
2. Sitio y política accesibles, con identidad y tratamiento de datos coherentes con la instalación demostrada.
3. Recorridos web y Desktop completos, con sus Client ID y los dos permisos de lectura visibles.
4. Consulta, descarga o exportación, archivo en el escritorio y recibo correspondiente; ninguna sustitución por una respuesta de texto.
5. Mapa de datos contrastado con los destinos reales del Host, VM, motor y proveedores de IA.
6. Video real revisado y subido a YouTube como **Unlisted**, con autorización de quien administra la cuenta; enlace incorporado al campo del expediente.
7. Centro de verificación revisado, requisitos restantes identificados y declaraciones confirmadas por la persona responsable.

Google solicita el enlace de YouTube no listado como parte de esa evidencia. Guardarlo en el formulario aún no significa que la revisión esté aprobada. [Preparación oficial de la solicitud](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).

### Evaluación de seguridad y CASA

Los permisos restringidos pueden exigir una evaluación de seguridad según el acceso y el recorrido de los datos. Google contempla evaluación para aplicaciones que acceden a esos datos desde o a través de servidores de terceros. **No se ha obtenido una aprobación ni determinado una exención de CASA para esta entrega.** La arquitectura debe declararse y la exigencia aplicable resolverse en la revisión, sin deducir una exención del uso de un Host propio, una VM privada o un piloto. [Evaluación de seguridad de Google](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).

## Validación de esta entrega

La interfaz simplificada quedó instalada en el entorno privado de LexOpen, conservando cuenta, configuración, archivos y diseño. Se volvieron a comprobar las cuentas reales de Google, GitHub y Dropbox después de la actualización; las tres respondieron sin nuevos inicios de sesión. Esto no prueba el primer ingreso de una segunda cuenta ni que Google haya aprobado la aplicación.

La compilación pasó, junto con siete pruebas unitarias de estados, las tres suites de perfiles y ensamblado de publicación y la integración OAuth con PostgreSQL desechable. Pasaron los 39 casos Chromium del grupo acotado: 38 en la primera ejecución y el restante tras incorporar una corrección de navegación que ya existía en el trabajo local; se revisaron además las vistas de escritorio y móvil. Las cuentas y los proveedores de las pruebas automáticas son ficticios.

El perfil real de publicación se preparó con los tres proveedores requeridos y superó su validación y empaquetado en un directorio aislado. La configuración protegida de compilación recibió ese mismo perfil. No se incluyeron cuentas, tokens de usuario ni el secreto del cliente web del estudio. Los controles de publicación y la igualdad de perfiles se probaron con fixtures, sin publicar nuevos instaladores durante esta entrega.

## Próximos pasos acotados

1. Después del 8 de noviembre a las 20:45 de Chile continental, volver a comprobar la marca de Google y atender el resultado concreto. No anticipar un envío ni una aprobación.
2. Preparar y grabar los dos recorridos de Google con datos ficticios; revisar el mapa de datos y completar el expediente sólo con evidencia real.
3. Cargar manualmente el icono oficial de Dropbox y continuar su preparación de producción. Hasta entonces, describirlo como piloto en Development con hasta 500 usuarios.
4. Publicar futuros instaladores sólo desde el ensamblado estricto, con las tres identidades preparadas y la misma huella en todos los paquetes. No convertir los artefactos de comprobación en una publicación.
5. Mantener Microsoft pendiente hasta que el usuario pida retomarlo. Validar cada proveedor adicional con una operación pequeña autorizada, sin extender a todo el catálogo las pruebas de las tres cuentas actuales.

La [preparación de Google del 7 de noviembre](GOOGLE-VERIFICACION-2026-11-07.md), la [guía operativa de conexiones](ALTAZOR-CONEXIONES.md) y la [auditoría del 8 de noviembre](AUDITORIA-CONECTORES-ALTAZOR-2026-11-08.md) conservan sus alcances y evidencias. Este documento añade el estado de publicación y la pauta del expediente, sin alterar esos registros.
