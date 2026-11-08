# Segunda integración local — 8 de noviembre de 2026

La revisión continúa sobre `main` en `5e7b4653`, después de la consolidación del PR #254. Se conserva el historial local pendiente hasta `735de175`: consultas literales de metadatos sin enviar el encargo al modelo, presentación del estado real de cada cuenta y requisitos de identidad para publicar instaladores.

## Alcance incorporado

- `dc7e1bc0`: las consultas de nombres de Dropbox y OneDrive se preparan como operaciones nativas. Exigen autorización, cuenta y ámbito actuales, recibo con tamaño y SHA-256 y resultado tipado. Las respuestas perdidas no se reenvían automáticamente. Una consulta pendiente impide reemplazar el encargo con otro nuevo.
- `1c03bdc2`: documentación de la validación de conexiones y de los límites y funciones pendientes. Las comprobaciones con cuentas reales comunicadas por su autor se distinguen de las pruebas ficticias de esta integración.
- `170a21c7`: las tarjetas usan el estado OAuth comprobado para el espacio actual. La publicación exige las identidades públicas de Google, GitHub y Dropbox, idénticas en las cuatro plataformas; Microsoft permanece opcional. Los artefactos de verificación no pueden publicarse como una versión.
- `735de175`: guía de preparación pública y de los requisitos de revisión de Google. No equivale a una aprobación del proveedor ni a publicar una versión.

Se preservan las versiones actuales de Actions, la ejecución paralela de CI y la edición visual de main. Los cambios locales antiguos del flujo monolítico de CI ya están cubiertos por la ejecución actual, incluyendo auditorías, navegadores y audio; no se reintroduce ese flujo.

## Validación

La comprobación usa PostgreSQL, almacenamiento y cuentas ficticias. Se ejecutan unitarias, integración completa, tipos, lint, compilación y los recorridos de conexiones, escritorio y ajustes. CI incluye expresamente las nuevas pruebas de consultas nativas, junto con la compilación y pruebas reales del gateway fijado en ambas arquitecturas.

Se corrigieron dos incompatibilidades de fixtures al consolidar: la referencia antigua de upload-artifact y un mensaje de prueba que se enviaba después de insertar autorizaciones pendientes. El escenario ahora comprueba primero el envío permitido y después su rechazo sin crear una acción nueva mientras hay una consulta pendiente. Se conserva el control de permisos de producción.

Relevo Android y las capturas locales permanecen separados de la publicación. No se ejecutan migraciones sobre bases de usuarios ni se publica una versión.
