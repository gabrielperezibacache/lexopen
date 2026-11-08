# Segunda integración local — 8 de noviembre de 2026

La revisión continúa sobre `main` en `5e7b4653`, después de la consolidación del PR #254. Se conserva el historial local pendiente hasta `e4b7c35a`: consultas literales de metadatos sin enviar el encargo al modelo, presentación del estado real de cada cuenta y requisitos de identidad para publicar instaladores y gestión documental de Drive por causa.

## Alcance incorporado

- `dc7e1bc0`: las consultas de nombres de Dropbox y OneDrive se preparan como operaciones nativas. Exigen autorización, cuenta y ámbito actuales, recibo con tamaño y SHA-256 y resultado tipado. Las respuestas perdidas no se reenvían automáticamente. Una consulta pendiente impide reemplazar el encargo con otro nuevo.
- `1c03bdc2`: documentación de la validación de conexiones y de los límites y funciones pendientes. Las comprobaciones con cuentas reales comunicadas por su autor se distinguen de las pruebas ficticias de esta integración.
- `170a21c7`: las tarjetas usan el estado OAuth comprobado para el espacio actual. La publicación exige las identidades públicas de Google, GitHub y Dropbox, idénticas en las cuatro plataformas; Microsoft permanece opcional. Los artefactos de verificación no pueden publicarse como una versión.
- `735de175`: guía de preparación pública y de los requisitos de revisión de Google. No equivale a una aprobación del proveedor ni a publicar una versión.

- `6d4f8d4e`: una cuenta personal de Altazor para elegir o crear carpetas de causas, guardar copias y nuevas versiones separadas y recibir revisiones desde Drive. Requiere consentimiento de gestión, confirmación del destino, permisos actuales y huellas de origen; el registro duradero precede al envío. La cancelación del asistente se vuelve a comprobar inmediatamente antes del RPC. Una respuesta incierta se comprueba sin repetir la escritura.
- `e4b7c35a`: registro del autor sobre instalación privada y comprobaciones con cuentas reales; conserva explícitamente la escritura real y la revisión pública pendientes. Esta integración no repite operaciones sobre esas cuentas.

Se preservan las versiones actuales de Actions, la ejecución paralela de CI y la edición visual de main. Los cambios locales antiguos del flujo monolítico de CI ya están cubiertos por la ejecución actual, incluyendo auditorías, navegadores y audio; no se reintroduce ese flujo.

## Validación

La comprobación usa PostgreSQL, almacenamiento y cuentas ficticias. Se ejecutan unitarias, integración completa, tipos, lint, compilación y los recorridos de conexiones, escritorio y ajustes. CI incluye expresamente las nuevas pruebas de consultas nativas, junto con la compilación y pruebas reales del gateway fijado en ambas arquitecturas.

Se corrigieron dos incompatibilidades de fixtures al consolidar: la referencia antigua de upload-artifact y un mensaje de prueba que se enviaba después de insertar autorizaciones pendientes. El escenario ahora comprueba primero el envío permitido y después su rechazo sin crear una acción nueva mientras hay una consulta pendiente. Se conserva el control de permisos de producción. El contrato de disponibilidad del motor incluye ahora explícitamente la ausencia de capacidad de gestión de Drive en motores antiguos.

La revisión adicional reprodujo y corrigió dos fallos de Drive. Una cuenta renovable dejaba de resolverse cuando caducaba el token de acceso anterior, aunque el motor conservara la renovación; ahora sigue exigiendo prueba sellada coherente y estado nativo actual, y rechaza cuentas caducadas sin renovación. Los recibos de escritura aceptaban campos adicionales: ahora rechazan claves inesperadas, incluidas credenciales o respuestas privadas del proveedor, antes de devolver un resultado. Ambas correcciones tienen regresiones.

Las pruebas completas de integración, las nuevas integraciones de causas y herramientas Drive, los contratos de renovación, recibos, OAuth y receta nativa, tipos, lint, compilación y validación de los tres flujos de Actions se ejecutaron localmente. Los recorridos compilados pasaron en Chromium (37) y WebKit (21), incluyendo conexiones distribuidas, tarjetas de autorización y los seis escenarios de Drive; Chromium incluye además configuración y escritorio. Las tres suites con respuestas simuladas bloquean su service worker para que no eluda la interceptación de fixtures. Las suites del modo sin conexión conservan su worker real. CI vuelve a comprobar la integración conjunta con navegadores y motores nativos en ambas arquitecturas. El registro de GitHub del PR #255 contiene el resultado definitivo de esos trabajos.

Relevo Android y las capturas locales permanecen separados de la publicación. No se ejecutan migraciones sobre bases de usuarios ni se publica una versión.
