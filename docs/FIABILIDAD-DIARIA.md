# Fiabilidad diaria — preparación de preview 11

## Código y descargas

La preparación `1.1.0-preview.11` no es un instalador publicado. Preview 10 sigue siendo la última publicación hasta completar las credenciales, comprobaciones y publicación de la siguiente etiqueta. Las funciones integradas después de preview 10 —estado automático de causas, Mi Fiscalía, horarios de consulta, recibos históricos, segundo revisor y equipos recordados— necesitan esa nueva distribución para llegar a los usuarios del instalador.

## Implementación de esta entrega

| Área | Cambio |
| --- | --- |
| Mac y distribución | Credenciales sólo en etiquetas con Environment protegido; fallo temprano sin credenciales; recibos independientes de integridad de firma, identidad, notarización y Gatekeeper. Se verifica el DMG, se monta en modo de sólo lectura y se comprueba una copia temporal con cuarentena. Mac público exige superar todas esas comprobaciones, incluso en preview. |
| Respaldo | Inventario SHA-256 de archivos y carpetas, detección de modificaciones, ausencias, archivos adicionales y enlaces; validación antes de sustituir y después de copiar, con recuperación del destino previo ante fallo. Compatibilidad v1 sin índice identificada como no verificada. |
| Historias y búsqueda | Páginas acotadas en Documentos, Clientes, Espacios, Mensajes, Flujos, Auditoría y Mi Fiscalía. Documentos busca nombre y causa. Auditoría filtra en PostgreSQL antes de paginar. Mi Fiscalía conserva orden de seguimiento, incluidas fechas vacías. Los permisos se consultan de nuevo en cada página. |
| Audio | Tramos pendientes cifrados AES-GCM, con clave dependiente de Host, usuario, causa y mesa que no se almacena en IndexedDB. Identidad y metadatos autenticados, migración de copias anteriores sin extender su vigencia y memoria separada por cuenta. Recuperar no reanuda la captura ni envía audio. |
| Operación | Fallo al consultar la cola judicial identificado como indisponible; el estado de respaldo no se presenta como verificación completa ni cifrado. |
| Google | Calendar y Drive corporativo separados de la sesión OAuth; fachada compatible con importaciones actuales y un solo mecanismo de autenticación y renovación de tokens. No cambia la cuenta compartida ni los alcances. |
| OJV | Módulos separados de navegación pública y lectura autenticada. Las credenciales sólo se pasan al flujo autenticado; se conservan la fachada, autorizaciones, ingreso manual y diagnósticos acotados. |
| Desarrollo | Dev Container opcional con Node 22, PostgreSQL 16 desechable, inicialización protegida contra bases remotas y CI que comprueba los comandos documentados. |

## Comprobaciones y alcance

Las pruebas usan datos ficticios y una base local desechable. Cubren documentos posteriores al registro 100, fechas empatadas, revocación al recorrer páginas, auditoría anterior a 300 eventos y seguimiento de Fiscalía con fechas nulas. Las pruebas de audio conservan recuperación tras recarga y cierre del navegador y comprueban que los registros persistidos no contienen el Blob ni la clave en claro. Las pruebas de respaldo alteran, eliminan y añaden archivos, introducen enlaces y provocan corrupción durante la copia.

Las pruebas de firma y artefactos con transportes simulados comprueban los contratos; la CI nativa ejecuta las herramientas de cada plataforma. Un recibo sin firma de editor no acredita aceptación de macOS. El ensayo automatizado no sustituye la instalación, micrófono, actualización y restauración manuales en los equipos del estudio.

## Validaciones externas necesarias

- Administrador de publicación: configurar `desktop-release`, certificados y credenciales de Apple según [Instaladores](INSTALADORES.md). No se solicitan secretos por chat ni se guardan en el repositorio.
- Piloto autorizado de Google, OJV, correo, ntfy y WhatsApp con cuentas reales: comprobar permisos, renovación, revocación, sesión vencida y recepción/respuesta. Los transportes ficticios no cierran ese piloto.
- Prueba del paquete descargado en Mac Apple Silicon e Intel, Windows y Linux, actualización desde preview 10 y restauración en otro equipo con un respaldo protegido.
- Revisión profesional de reglas procesales y ejemplos de recuperación jurídica antes de atribuirles validez jurídica o calidad medida.

## Desarrollo posterior que no se declara completado

El perfil procesal civil chileno (#267), corpus jurídico evaluado (#260), medición comparativa de modelos locales (#264), manuscritos académicos sin conexión (#259), anotaciones offline (#268), resumen incremental de conversaciones, cumplimiento de plazos con evidencia y auditoría visual exhaustiva mantienen su alcance propio. No se cierran por los cambios de paginación, refactorización ni por una suite de pruebas aprobada. La firma real (#266) necesita además sus credenciales y ejecución verificadas.

Se mantienen el escritorio persistente, las actualizaciones judiciales automáticas a las 08:00 y 22:00 de Chile, las manuales libres, los muros éticos y la cuenta Google compartida.
