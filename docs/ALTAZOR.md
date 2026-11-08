# ALTAZOR AI

ALTAZOR reúne la conversación, las fuentes y las herramientas de LexOpen en **Mi jornada**, al abrir la aplicación. Cada profesional conserva sus conversaciones, adjuntos, memoria y trabajos académicos en su cuenta. El acceso a una causa y a sus respaldos se comprueba de nuevo al utilizarlos.

La ampliación de [Conexiones y Secretos](ALTAZOR-CONEXIONES.md) incorpora el catálogo de aplicaciones del escritorio, autorización de sus operaciones y credenciales privadas con escritura de un uso. También permite preparar desde la conversación un encargo para un escritorio ya abierto, con texto íntegro y confirmación antes de enviarlo.

## Empezar una conversación

1. Abre **Mi jornada**, o pulsa **ALTAZOR** desde cualquier apartado. Elige tu espacio personal o una causa accesible.
2. Escribe el encargo. Puedes arrastrar archivos, pulsar **Adjuntar** o seleccionar pasajes de la biblioteca, hechos y notas de audiencia.
3. Revisa el destino de IA. Si es remoto, autoriza el envío de ese mensaje y su selección. La configuración de sólo IA local del estudio prevalece.
4. Envía el mensaje. Las lecturas se ejecutan directamente; los cambios en causas, agenda u otras herramientas muestran un plan que debes revisar y confirmar.
5. Continúa después desde **Conversaciones**. El orden, las respuestas, los planes y los estados se conservan tras recargar o reiniciar el Host.

El ámbito de una conversación queda fijado al crearla. Para trabajar en otra causa, crea otra conversación. No se reutiliza silenciosamente el contexto de expedientes distintos.

Los mensajes guardados y los trabajos en curso se recuperan. Un mensaje que todavía no se ha enviado permanece en el editor mientras cambias de apartado; al cerrar la ventana con texto pendiente aparece la advertencia del navegador. La aplicación conserva el texto ante errores de envío. Una solicitud interrumpida se identifica como tal y no se vuelve a ejecutar automáticamente.

## Continuar entre apartados

Inicio y el panel lateral comparten conversación y borrador mientras navegas. «Mi asistente» reúne memoria, conexiones y computadora; Académico tiene un apartado propio. El Host puede continuar mensajes expresamente enviados durante un máximo de 24 horas, con permisos, sesión y fuentes vigentes; no confirma escrituras ni reproduce operaciones interrumpidas.

Consulta [Sincronización](SINCRONIZACION.md) para conectar el contenido de Drive personal, separado del conector de metadatos de la computadora.

## Adjuntos y fuentes

Los adjuntos conservan los bytes originales y una huella SHA-256. La extracción usa los formatos y herramientas locales ya disponibles en LexOpen, incluido OCR cuando corresponde. No se reemplaza un PDF por un mensaje que diga que fue leído.

- Hasta cinco archivos activos por conversación, 25 MiB por archivo y 100 MiB en total.
- El contexto enviado al modelo contiene ventanas explícitas del texto extraído; no acredita lectura íntegra de un libro o expediente extenso.
- Un PDF sólo tiene localizadores de página física cuando la extracción los proporciona. No se inventan páginas para DOCX, EPUB o texto plano.
- **Guardar en biblioteca** incorpora una copia privada mediante el importador existente. Se aplican las preferencias personales de conversión y conservación; repetir la acción recupera el mismo libro.
- Retirar un adjunto elimina su contenido de la conversación e invalida las respuestas que dependan de él. No borra una copia que hayas incorporado expresamente a la biblioteca.

Los pasajes seleccionados de la biblioteca y del expediente se cotejan con sus versiones y material conservado antes de utilizarse. Las referencias vuelven al origen. La comprobación de correspondencia no acredita por sí sola autenticidad, vigencia, pertinencia ni la conclusión del asistente.

Si cambia el permiso de un respaldo, se ocultan también sus respuestas derivadas. La misma regla alcanza a las conversaciones posteriores que usaron esas respuestas como contexto.

## Memoria que puedes revisar

En **Memoria** encuentras una vista de grafo y una lista accesible de recuerdos y relaciones. Puedes registrar preferencias, conceptos y afirmaciones, asociarlos y revisar sus respaldos.

- **Propuesto** y **Confirmado** son estados distintos. Sólo lo confirmado participa al marcar **Usar mi memoria confirmada** en una consulta.
- Una preferencia personal puede tener respaldo manual. Las afirmaciones y conceptos requieren un pasaje autorizado del material conservado.
- Cada causa tiene su espacio privado; la memoria personal se mantiene separada. No se identifican personas de expedientes distintos por coincidencia de nombres.
- Puedes confirmar, editar o hacer olvidar un recuerdo. Olvidar retira su contenido y sus relaciones, conserva una marca interna para impedir su recreación por una operación antigua y no elimina los documentos originales.
- Si el respaldo deja de estar disponible, se omite también el contenido derivado del grafo y del contexto de IA.

La memoria funciona con nodos y relaciones en PostgreSQL; no requiere instalar otro servicio de grafos. El historial de conversación y la memoria confirmada cumplen funciones diferentes: conservar mensajes no equivale a convertirlos automáticamente en hechos corroborados.

## Investigación, escritura y docencia

**Academia** organiza trabajos privados de investigación, escritura, docencia y carrera académica. Cada trabajo conserva su pregunta, destinatarios, matriz y resultados.

| Apartado | Recorrido |
| --- | --- |
| Trabajo | Elegir fuentes y preparar síntesis, estado del arte, comparación, revisión de afirmaciones o bibliografía, escritura, traducción, abstract y revisión por pares. |
| Matriz de literatura | Configurar dimensiones de texto, número, fecha o etiqueta; registrar filas; incluirlas o excluirlas del análisis; asociar pasajes a celdas. |
| Docencia | Usar objetivo, destinatarios, duración, resultados de aprendizaje y evaluación para preparar programas, rúbricas y material docente. |
| Mi perfil | Conservar los datos profesionales aportados por el titular y preparar propuestas de currículum; no certifica títulos ni cumplimiento de formularios institucionales. |
| Descubrir | Consultar Crossref y OpenAlex, explorar relaciones bibliográficas, contrastar un registro ORCID público y conservar referencias. |

Las propuestas de IA se guardan para edición y revisión. Puedes descargarlas en Word real o Markdown. **Incorporar a una causa** crea un escrito privado con sus respaldos nativos, después de revisar el resultado; repetir la incorporación recupera el mismo escrito. No presenta documentos ante tribunales.

Una fila de matriz con acceso revocado se oculta, pero su contenido y respaldo originales se conservan. Guardar el título o los datos generales no la transforma en una fila manual vacía. Las ediciones concurrentes se rechazan antes de sobrescribir cambios.

La búsqueda académica envía únicamente los términos o identificadores expresamente autorizados; no incorpora automáticamente archivos, conversaciones o datos de causas. Sus resultados son metadatos, no citas de textos completos cotejados. Las alertas temáticas de esta versión se actualizan manualmente; su RSS privado usa el último resultado guardado y requiere sesión.

La bibliografía admite APA, IEEE, Vancouver, Chicago, MLA, BibTeX y RIS, con importación de referencias y avisos sobre campos ausentes. Consulta los límites y la verificación de los índices en [Descubrimiento académico](altazor-discovery.md).

## Conexiones y LinkedIn

**Conexiones** reúne el acceso a Codex personal, las integraciones existentes y la autorización personal de LinkedIn. Los estados distinguen configuración pendiente, conexión, caducidad y permisos concedidos. Tener un enlace de perfil o un token guardado no basta para indicar una conexión válida.

Los trabajos académicos revisados pueden preparar un borrador privado para LinkedIn. Se conserva su relación con la revisión de origen; si ésta cambia o pierde una fuente, se debe preparar otro borrador. Los extractos mayores de 3.000 caracteres se identifican antes de continuar.

La publicación requiere abrir la previsualización, comprobar autor, texto y audiencia y confirmar esa acción. Se guarda un recibo. Una respuesta remota ambigua queda como **resultado desconocido** y no se reenvía automáticamente. Copiar texto o abrir LinkedIn no se muestra como una publicación confirmada.

Las interacciones sociales se realizan en LinkedIn. LexOpen no crea un feed social, una base de contactos ni un servicio propio de mensajes académicos. Las funciones no concedidas por LinkedIn no se presentan como disponibles.

### Configuración del administrador

La autorización web necesita una aplicación registrada y un retorno HTTPS exacto:

```text
LINKEDIN_CLIENT_ID=<id de la aplicación>
LINKEDIN_CLIENT_SECRET=<secreto sólo en el Host>
LINKEDIN_REDIRECT_URI=https://<host>/api/personal-connectors/linkedin/oauth/callback
LINKEDIN_SHARE_ENABLED=1
```

`SESSION_SECRET` debe estar configurado. Las credenciales personales se cifran y nunca se incorporan al modelo, a los adjuntos ni al navegador. El retorno prepara un resultado pendiente; sólo la sesión iniciadora puede completar la conexión. La autorización PKCE nativa de LinkedIn no está implementada en esta entrega; una instalación únicamente local puede preparar el texto y abrir LinkedIn mientras configura la modalidad web.

El inicio de sesión y la publicación con una cuenta real requieren la aplicación y permisos correspondientes. Las pruebas de desarrollo usan identidades, firmas y proveedores ficticios.

La [metadata OIDC pública de LinkedIn](https://www.linkedin.com/oauth/.well-known/openid-configuration), consultada directamente el **4 de noviembre de 2026**, declara el issuer exacto `https://www.linkedin.com/oauth`, firma `RS256` y las rutas de autorización, token, userinfo y JWKS utilizadas por el conector. La validación acepta únicamente ese issuer; rechaza el dominio sin `/oauth` y cualquier otro emisor. El ejemplo de la [guía de LinkedIn en Microsoft Learn](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2) conserva el dominio sin esa ruta; se utiliza el valor de la metadata publicada, sin ampliar la lista de emisores aceptados.

El conector envía un nonce por intento y exige su correspondencia en el ID token, conforme a [OIDC Core, validación del ID token](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation). La metadata y la guía públicas de LinkedIn consultadas no detallan ese eco; esta revisión no acredita su comportamiento con una cuenta real. Se conserva la comprobación sin relajar firma, audiencia, nonce o caducidad.

## Computadora del asistente

**Computadora** conecta un escritorio opcional mediante un broker de LexOpen. Cada profesional y ámbito utiliza un gateway dedicado; un mismo endpoint no se comparte entre causas. El motor de escritorio es un contenedor, no una VM con kernel propio.

El recorrido permite crear una sesión con caducidad, enviar un encargo y archivos expresamente elegidos, observar capturas, tomar el control para un ingreso manual, devolverlo, cancelar una tarea y cerrar la sesión. LexOpen conserva sus propios permisos y recibos. No entrega su base de datos, el almacenamiento completo ni sus credenciales al escritorio.

El adaptador está desactivado por defecto. No instala ni inicia un motor al abrir Mi jornada. La configuración se realiza desde el Host local y exige un gateway preparado expresamente para ese espacio. Con la política **sólo IA local**, no se permite iniciar tareas en un gateway cuyo destino de modelo independiente no pueda acreditarse como local.

La Mesa de documentos por causa sigue disponible para su receta local de Word y Markdown. El escritorio amplía ese recorrido; la existencia de un botón no prueba que haya un entorno preparado. La interfaz muestra el estado real de configuración y comprobación.

Las instrucciones del adaptador, el contrato fijado y las limitaciones de cierre y caducidad están en [Computadora: operación y pruebas](../src/lib/altazor/computer/README.md).

## Texto del navegador y de documentos

El perfil de escritorio **tools-2** ofrece `page_read` y `document_read` al agente del contenedor. Lee primero el texto del navegador activo y los controles numerados; los documentos PDF, DOCX, ODT, PPTX, XLSX y de texto se consultan dentro de su carpeta de trabajo. Las lecturas largas admiten búsqueda y bloques sucesivos. No devuelven valores de formularios ni autorizan acciones por el contenido de una página o archivo.

Cuando hay texto del navegador, la observación automática usa ese texto en lugar de adjuntar una captura. La imagen sigue disponible cuando el contenido es visual o no existe una capa de texto útil. Un PDF escaneado puede necesitar reconocimiento o revisión visual. El panel **Leer como texto** permite comprobar lo leído, buscar y avanzar por bloques sin enviarlo automáticamente al chat.

Al actualizar una instalación con el perfil anterior, reconstruye la imagen del escritorio siguiendo la guía del adaptador. La aplicación detecta un lector incompatible; no muestra texto ficticio como si hubiera leído el contenedor.

## Planes e Ícaros

Cada encargo muestra un resumen y la cantidad de acciones. Los pasos y resultados detallados se abren a petición; las acciones pendientes o delegadas no se cuentan como análisis terminados. El visor permite ampliar, entrar y salir de pantalla completa y conservar la posición de lectura del chat.

En **Ícaros** puedes crear especialistas privados para el ámbito actual y elegir el proveedor y modelo de cada uno. Comparten las restricciones del estudio y tus permisos, no credenciales ni acceso adicional. La memoria de cada Ícaro está separada y requiere activarla y conservar recuerdos expresamente. Olvidar una fuente o un recuerdo invalida los resultados que dependan de él.

Puedes pedir «Delega al Ícaro Revisor: compara estas fuentes». Altazor prepara un plan con el modelo, destino y fuentes seleccionadas antes de delegar. Los encargos se conservan en una cola, sus resultados se reúnen en la conversación y puedes continuar escribiendo mientras trabajan. No se copia automáticamente el historial, la memoria ni los adjuntos del padre. La cancelación y los cambios de acceso se comprueban también durante el trabajo. Hay límites de dos trabajos simultáneos por usuario, diez en cola y un nivel de subdelegación.

## Ayuda a distancia

**Ayuda a distancia** configura ntfy por usuario mediante un servidor HTTPS, un token y temas separados para los avisos y las respuestas. WhatsApp requiere que la administración prepare Meta Cloud API y su plantilla aprobada, y que cada persona verifique su propio número. El webhook configurado es `/api/altazor/help/whatsapp`. Los secretos sólo se guardan cifrados en el Host.

Cuando el escritorio entra en una espera real, Altazor conserva la pregunta y envía un aviso mínimo por los canales conectados. La respuesta de ntfy o WhatsApp usa el código de esa pregunta. Cada nueva petición de ayuda tiene su propia identidad, aunque aparezca dentro de la misma tarea. Una respuesta autenticada reanuda únicamente esa espera: no concede permisos ni aprueba operaciones de conectores.

La aplicación comprueba ayudas mientras está visible. Para atenderlas con el navegador cerrado, mantén el Host activo con su worker de jornada: `LEXOPEN_JORNADA_INTERVAL_MINUTES=1` y `CRON_SECRET` configurado. Desktop ya prepara ese worker. El mismo worker procesa los encargos de Ícaros y respeta la preferencia personal de trabajo en segundo plano. Un envío de resultado incierto se conserva para revisión y no se repite automáticamente.

La actualización añade una migración de base de datos: ejecuta `npm run db:migrate` en el proceso habitual de actualización del Host. Las pruebas de ntfy, Meta y modelos usan proveedores ficticios; la entrega a tu teléfono depende de los canales y permisos reales que conectes.

## Evidencia de esta entrega

Las pruebas separan persistencia, permisos, protocolo, uso de proveedores y ejecución de contenedores. Los fixtures de IA y servicios externos no se presentan como cuentas reales ni como razonamiento autónomo probado. Las capturas de la aplicación utilizan datos ficticios. Las comprobaciones públicas de los índices académicos se describen por separado en su guía.

La identidad gráfica de ALTAZOR incorpora un chungungo original de cuatro estados. Su [registro de generación y huella](../public/altazor/provenance.json) documenta el activo utilizado; el texto, los controles y los grafos siguen siendo interfaz accesible.
