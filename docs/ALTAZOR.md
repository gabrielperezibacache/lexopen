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

**Académico** organiza trabajos privados de investigación, escritura, docencia y carrera académica. Busca un trabajo por su título para retomar su pregunta, destinatarios, matriz y resultados.

| Apartado | Recorrido |
| --- | --- |
| Trabajo | Elegir fuentes y preparar síntesis, estado del arte, comparación, revisión de afirmaciones o bibliografía, escritura, traducción, abstract y revisión por pares. |
| Matriz de literatura | Configurar dimensiones de texto, número, fecha o etiqueta; registrar filas; incluirlas o excluirlas del análisis; asociar pasajes a celdas. |
| Mesa de revisión | Identificar el siguiente paso del trabajo y comprobar qué secciones de cada manuscrito enlazan con un pasaje disponible. |
| Docencia | Organizar cursos, seminarios, congresos, talleres y convocatorias en trabajos privados. Crear un syllabus desde la ficha del curso o partir de una plantilla en el editor. |
| Mi perfil | Conservar los datos profesionales aportados por el titular y preparar propuestas de currículum; no certifica títulos ni cumplimiento de formularios institucionales. |
| Descubrir | Consultar Crossref y OpenAlex, explorar relaciones bibliográficas, contrastar un registro ORCID público y conservar referencias. |

El editor reúne borradores propios y propuestas de IA en el mismo trabajo. Puedes comenzar con un documento en blanco o con una plantilla, dar formato al texto, insertar referencias a pasajes del trabajo y revisar una vista previa. Descarga una versión guardada en Word o Markdown y su respaldo en un archivo separado. **Incorporar a una causa** crea un escrito privado con sus respaldos nativos después de revisar el resultado. Si repites la incorporación, vuelves al mismo escrito.

El syllabus recoge resumen, enfoque, destinatarios, requisitos, horario, sala, evaluación y bibliografía base. Puedes abrir un mensaje editable en Altazor para solicitar sugerencias bibliográficas. Tú decides qué referencias incorporar después de revisarlas. El [mapa docente](DOCENCIA.md) describe el flujo y sus siguientes etapas.

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

## Evidencia de esta entrega

Las pruebas separan persistencia, permisos, protocolo, uso de proveedores y ejecución de contenedores. Los fixtures de IA y servicios externos no se presentan como cuentas reales ni como razonamiento autónomo probado. Las capturas de la aplicación utilizan datos ficticios. Las comprobaciones públicas de los índices académicos se describen por separado en su guía.

La identidad gráfica de ALTAZOR incorpora un chungungo original de cuatro estados. Su [registro de generación y huella](../public/altazor/provenance.json) documenta el activo utilizado; el texto, los controles y los grafos siguen siendo interfaz accesible.
