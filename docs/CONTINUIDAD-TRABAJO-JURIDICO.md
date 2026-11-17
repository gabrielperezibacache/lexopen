# Continuidad del trabajo jurídico

Cambios de la preparación de preview 11; no equivalen a una publicación de instaladores.

## Cliente, causa y documentos

Desde la ficha de un cliente, **Nueva causa** conserva su selección. El formulario también permite buscar clientes del directorio y elegir **Sin cliente**. Una selección inexistente se rechaza; no se sustituye silenciosamente.

La creación usa la infraestructura existente de recibos (`CommandExecution`). `POST /api/causas` acepta `Idempotency-Key` opcional y conserva su respuesta de creación. Repetir la clave con los mismos datos recupera la causa actual; cambiar los datos con esa clave devuelve 409. La clave no evita crear otro asunto manual legítimo con el mismo título. Se mantienen los controles de referencia judicial y conflicto de interés. Los permisos se comprueban otra vez al recuperar el resultado; un recibo no concede acceso al expediente.

Ante un fallo de red o respuesta incierta, el formulario conserva el envío y bloquea sus campos hasta **Reintentar creación**. Los errores de validación permiten corregirlo. El navegador conserva únicamente huella y clave de operación, sin guardar el contenido del expediente en ese almacenamiento.

La ficha del cliente reúne documentos directamente asociados y documentos de sus causas actuales. Se aplican los permisos de lectura y confidencialidad existentes. Un documento asociado de ambas maneras se cuenta una sola vez; las relaciones históricas no se reescriben. La lista pagina de 50 en 50 con orden estable. Directorio, API y ficha calculan el contador con el mismo criterio. Los originales y sus versiones permanecen intactos.

Una incorporación que declara cliente y causa incompatibles se rechaza. Un documento exclusivo del cliente requiere que este exista. Los TXT y Markdown se extraen localmente: UTF-8 y UTF-16 con BOM; archivos vacíos, contenido binario o codificación inválida no se presentan como texto extraído válido.

## Audiencia, fuentes y revisión

El recorrido comprobado incorpora un original, prepara evidencia para una audiencia privada y registra una observación con cita documental. La promoción explícita y revisada a hecho del expediente permite usar esa evidencia en un escrito y asignar un segundo revisor. El revisor no obtiene acceso automático a la mesa privada. Las fuentes que conservan una procedencia privada siguen sujetas a su autorización.

La aprobación y exportación DOCX conservan el control de versión y el recibo de integridad. Exportar no significa presentar un escrito ni cumplir un plazo. El cumplimiento del plazo y el cierre de la tarea son acciones independientes, con sus validaciones y justificaciones habituales.

## Verificación reproducible

- `npm run test:clientes:integration`: concurrencia, recuperación, cambio de permisos, rollback de auditoría, coincidencias reservadas, documentos heredados, más de 100 documentos con fechas iguales y asociaciones incompatibles. Requiere una base desechable declarada explícitamente mediante `DATABASE_URL` y `E2E_DATABASE_URL`.
- `npm test`: incluye extracción de texto, UTF-16 y rechazo de binarios/codificación inválida, además de los contratos existentes.
- `E2E_SERVER_MODE=production npx playwright test e2e/legal-workflow-continuity.spec.ts --project=chromium --project=firefox --project=webkit`: recorrido con datos ficticios y handlers reales; se pierde intencionalmente la primera respuesta de creación ya confirmada para verificar su recuperación. Compara hashes de originales y DOCX, comprueba privacidad y acciones explícitas de cierre, y revisa la ficha en escritorio y móvil.

No se añaden tablas ni migraciones. Se conservan la cuenta Google compartida, el escritorio persistente y el horario automático judicial de las 08:00 y 22:00 de Chile, con actualizaciones manuales libres. Este recorrido no acredita pilotos con proveedores reales, cálculos jurídicos nuevos ni firma/notarización de instaladores.
