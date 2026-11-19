# Fiabilidad diaria de LexOpen

## Código y descargas

La preparación posterior a preview 10 se incorporó a la versión 1.1.0. El registro de aceptación reúne la evidencia de las cinco condiciones de producción, los responsables del piloto y la identidad del paquete que deben verificar. [Aceptación de 1.1.0](ACEPTACION-1.1.0.md)

## Implementación de esta entrega

| Área | Cambio |
| --- | --- |
| Mac y distribución | Credenciales sólo en etiquetas con Environment protegido; fallo temprano sin credenciales; recibos independientes de integridad de firma, identidad, notarización y Gatekeeper. Se verifica el DMG, se monta en modo de sólo lectura y se comprueba una copia temporal con cuarentena. Mac público exige superar todas esas comprobaciones, incluso en preview. |
| Respaldo | Inventario SHA-256 de archivos y carpetas, detección de modificaciones, ausencias, archivos adicionales y enlaces; validación antes de sustituir y después de copiar, con recuperación del destino previo ante fallo. Compatibilidad v1 sin índice identificada como no verificada. |
| Plazos | Páginas mensuales y de vencidos, causas buscables y responsables internos. Cumplimiento con respaldo, historial, reapertura y versión optimista; aplicación común desde minutas, offline y Altazor. [Contrato y límites](PLAZOS-CUMPLIMIENTO.md). |
| Historias y búsqueda | Páginas acotadas en Documentos, Clientes, Espacios, Mensajes, Flujos, Auditoría y Mi Fiscalía. Documentos busca nombre y causa. Auditoría filtra en PostgreSQL antes de paginar. Mi Fiscalía conserva orden de seguimiento, incluidas fechas vacías. Los permisos se consultan de nuevo en cada página. |
| Audio | Tramos pendientes cifrados AES-GCM, con clave dependiente de Host, usuario, causa y mesa que no se almacena en IndexedDB. Identidad y metadatos autenticados, migración de copias anteriores sin extender su vigencia y memoria separada por cuenta. Recuperar no reanuda la captura ni envía audio. |
| Operación | Fallo al consultar la cola judicial identificado como indisponible; el estado de respaldo no se presenta como verificación completa ni cifrado. |
| Concurrencia | Los conflictos de serialización `P2034` de PostgreSQL, que confirman una transacción revertida, esperan 50, 100, 200 y 400 ms más una variación de hasta 50 ms antes de reintentar. Hay cinco intentos totales; cada uno ejecuta de nuevo la autorización y trabaja con una instantánea nueva. No se reintentan errores de auditoría, restricciones únicas ni resultados de conexión inciertos. Los recibos conservan su manejo propio de coincidencias únicas. |
| Google | Calendar y Drive corporativo separados de la sesión OAuth; fachada compatible con importaciones actuales y un solo mecanismo de autenticación y renovación de tokens. No cambia la cuenta compartida ni los alcances. |
| OJV | Módulos separados de navegación pública y lectura autenticada. Las credenciales sólo se pasan al flujo autenticado; se conservan la fachada, autorizaciones, ingreso manual y diagnósticos acotados. |
| Trabajo sin conexión | Edición de manuscritos existentes con invalidación de revisión y notas privadas de Biblioteca con marcador validado. Copias selectivas cifradas, control de versiones, auditoría atómica y revalidación del acceso al sincronizar. |
| Evaluación | Comandos reproducibles para recuperación jurídica y modelos instalados en Ollama, con corpus público/ficticio versionado, métricas separadas, exportación JSON/Markdown y ausencia de mediciones identificada. No descargan modelos ni usan cuentas reales. |
| Desarrollo | Dev Container opcional con Node 22, PostgreSQL 16 desechable, inicialización protegida contra bases remotas y CI que comprueba los comandos documentados. |

## Comprobaciones y alcance

Las pruebas usan datos ficticios y una base local desechable. Cubren documentos posteriores al registro 100, fechas empatadas, revocación al recorrer páginas, auditoría anterior a 300 eventos y seguimiento de Fiscalía con fechas nulas. Las pruebas de audio conservan recuperación tras recarga y cierre del navegador y comprueban que los registros persistidos no contienen el Blob ni la clave en claro. Las pruebas de respaldo alteran, eliminan y añaden archivos, introducen enlaces y provocan corrupción durante la copia.

La prueba de concurrencia fuerza dos lecturas de la misma versión de un registro antes de escribir, comprueba que una transacción se repite sin perder ninguna edición y envía ocho creaciones de evento con la misma clave: un evento, un recibo y una auditoría. También verifica reversión por fallo de auditoría y revocación antes de recuperar un recibo. Las operaciones paralelas de la prueba terminan antes de retirar sus datos, incluso cuando una falla.

Las regresiones de navegación comprueban la preparación de la causa visible aunque exista una copia anterior oculta. Se conservan las comprobaciones estrictas frente a dos controles visibles y las de ausencia de controles por falta de permisos. No se desactiva la conservación de formularios para resolver duplicados del DOM en las pruebas.

Las pruebas de firma y artefactos con transportes simulados comprueban los contratos; la CI nativa ejecuta las herramientas de cada plataforma. Un recibo sin firma de editor no acredita aceptación de macOS. El ensayo automatizado no sustituye la instalación, micrófono, actualización y restauración manuales en los equipos del estudio.

## Validaciones externas necesarias

- Administrador de publicación: configurar `desktop-release`, certificados y credenciales de Apple según [Instaladores](INSTALADORES.md). No se solicitan secretos por chat ni se guardan en el repositorio.
- Piloto autorizado de Google, OJV, correo, ntfy y WhatsApp con cuentas reales: comprobar permisos, renovación, revocación, sesión vencida y recepción/respuesta. Los transportes ficticios no cierran ese piloto.
- Prueba del paquete descargado en Mac Apple Silicon e Intel, Windows y Linux, actualización desde preview 10 y restauración en otro equipo con un respaldo protegido.
- Revisión profesional de reglas procesales y ejemplos de recuperación jurídica antes de atribuirles validez jurídica o calidad medida.

## Desarrollo posterior que no se declara completado

La edición candidata del perfil civil chileno (#267) está implementada. Su activación requiere validación profesional documentada. Siguen pendientes la revisión y ampliación del corpus jurídico (#260), las mediciones de modelos locales en el equipo del estudio (#264), el resumen incremental de conversaciones y la auditoría visual exhaustiva. La firma real (#266) requiere las credenciales del editor y su comprobación en el instalador descargado.

Se mantienen el escritorio persistente, las actualizaciones judiciales automáticas a las 08:00 y 22:00 de Chile, las manuales libres, los muros éticos y la cuenta Google compartida.

Los evaluadores ya disponibles y sus límites están en [Evaluación jurídica e IA](EVALUACION-JURIDICA-IA.md). Una ejecución con fixtures no cierra la validación profesional ni acredita velocidad de modelos reales.

## Recepción del piloto del estudio

| Prueba en el equipo del estudio | Evidencia que conserva el responsable |
| --- | --- |
| Actualizar un Mac Apple Silicon con preview 10 y un respaldo disponible. Instalar la edición firmada desde el canal de publicación y abrir el mismo Host. | Versión anterior y nueva, SHA-256 del instalador, identidad Developer ID, aceptación de Gatekeeper, notarización y comprobación de una causa y su documento tras el reinicio. [Procedimiento de distribución](INSTALADORES.md) |
| Ejecutar el evaluador sobre los modelos ya instalados en ese Mac, con Ollama en modo local. | Informe JSON y Markdown con hardware, edición y digest del modelo, corpus, tiempos y mediciones ausentes. [Comandos de evaluación](EVALUACION-JURIDICA-IA.md) |
| Usar una causa de prueba autorizada. Desde OJV, consultar y descargar un documento. Desde la cuenta Google compartida, comprobar la carpeta Organización → cliente → causa. Pedir ayuda desde Altazor y responder por el canal ntfy habilitado. | Anotar versión del Host, hora en Santiago, recorrido, resultado y error observado. Comparar el documento descargado, comprobar la lectura de Drive desde un segundo usuario con acceso y verificar que la respuesta de ntfy se asocia al encargo correcto una sola vez. Omitir identificadores judiciales, contenido y credenciales al compartir el resultado. |

La edición civil candidata y su revisión se siguen en [Plazos](PLAZOS-CUMPLIMIENTO.md). La publicación firmada requiere el entorno protegido de GitHub y las credenciales del editor. Las pruebas del piloto se registran cuando se ejecutan en el equipo y las cuentas del estudio.
