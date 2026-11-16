# Cumplimiento e historial de plazos

En **Plazos**, «Registrar cumplimiento» permite seleccionar un documento o comprobante de la misma causa, o escribir una justificación manual. Es un registro interno del estudio: no afirma que el tribunal haya recibido o aceptado una presentación.

Un PDF sin original recuperable no se sustituye por su texto extraído: el cierre se rechaza y permite seleccionar otro documento o escribir una justificación.

El respaldo documental conserva la versión seleccionada y la huella SHA-256 de sus bytes. «Ver historial del plazo» permite descargar esa versión aunque el documento haya tenido ediciones posteriores. Cada consulta y descarga comprueba de nuevo los permisos del plazo, la causa y el documento, incluidas sus restricciones históricas. Si el documento se retira o se mueve a otra causa, el historial indica que el respaldo no está disponible.

Reabrir un plazo añade otro evento y reactiva sus avisos pendientes; conserva el cumplimiento y su respaldo anteriores. Los cierres anteriores a esta función aparecen como históricos sin inventar autor, fecha ni comprobante.

## Minutas, Altazor y trabajo sin conexión

Una acción de minuta vinculada a un plazo pide el mismo respaldo al marcarla como hecha. La minuta, el documento generado, las tareas, el plazo, el historial y la auditoría se confirman juntos. Un fallo revierte la operación completa.

Altazor dispone de `plazo.listar` para consultar versiones y `plazo.actualizar` para proponer un cambio con justificación o documento explícitos. La vista previa incluye el respaldo propuesto. Se comprueban el ámbito de la conversación y los permisos actuales también al confirmar o repetir una operación.

La copia offline conserva la justificación o selección documental dentro de la bóveda cifrada. Para usar un documento, prepare antes una copia de su versión confirmada desde la causa. Si no está preparada, puede registrar una justificación manual. Sincronizar vuelve a comprobar permisos, versiones y respaldo. Los rechazos conservan el texto local para corregirlo; un conflicto exige comparar las copias. Una respuesta perdida se reintenta con la misma identidad y no duplica el historial.

## Listas y contrato API

Las vistas mensual y «Mis vencidos pendientes» recorren páginas de 100 registros, ordenados por fecha e identificador. El total respeta el filtro y los permisos. Los selectores permiten buscar causas fuera de las primeras 100 y elegir responsables de todos los roles internos; asignar no concede acceso a una causa.

`GET /api/plazos` conserva su respuesta como array. Admite `causaId`, `q`, `estado`, `mes`, `vista=mis-vencidos`, `limit` y `after`; devuelve `X-Total-Count`, `X-Next-Cursor` y `expectedVersion` por plazo. Un cursor vacío indica fin de la lista. `PATCH` requiere la versión consultada para cambios de estado. Un cumplimiento sin respaldo devuelve 422; un cambio concurrente devuelve 409. Envíe una `Idempotency-Key` estable para reintentar una misma operación.

El historial está en `/api/plazos/{id}/history`, con cursor `after` por revisión. Las respuestas y descargas son privadas y no se almacenan en la caché del service worker. La migración es aditiva y no modifica los cumplimientos antiguos. No activa reglas procesales ni altera los horarios de actualización judicial.
