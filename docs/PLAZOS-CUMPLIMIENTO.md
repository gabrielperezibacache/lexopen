# Cumplimiento e historial de plazos

En **Plazos**, «Registrar cumplimiento» permite seleccionar un documento o comprobante de la misma causa, o escribir una justificación manual. Es un registro interno del estudio: no afirma que el tribunal haya recibido o aceptado una presentación.

Un PDF sin original recuperable no se sustituye por su texto extraído: el cierre se rechaza y permite seleccionar otro documento o escribir una justificación.

El respaldo documental conserva la versión seleccionada y la huella SHA-256 de sus bytes. «Ver historial del plazo» permite descargar esa versión aunque el documento haya tenido ediciones posteriores. Cada consulta y descarga comprueba de nuevo los permisos del plazo, la causa y el documento, incluidas sus restricciones históricas. Si el documento se retira o se mueve a otra causa, el historial indica que el respaldo no está disponible.

Reabrir un plazo añade otro evento y reactiva sus avisos pendientes; conserva el cumplimiento y su respaldo anteriores. Los cierres anteriores a esta función aparecen como históricos sin inventar autor, fecha ni comprobante.

## Elegir el vencimiento

El formulario empieza en **Fecha revisada por el estudio**. Para Chile también ofrece una estimación interna y el perfil **CPC chileno · término individual en días**. El perfil civil está pendiente de aprobación. El Host comprueba su vigencia al crear el plazo aunque la petición llegue directamente a la API.

La edición candidata cubre notificaciones y vencimientos entre el 1 de noviembre de 2026 y el 28 de febrero de 2027. Considera el día siguiente a la notificación efectiva, los sábados ordinarios, los domingos y un calendario nacional acotado. Las fechas con hora requieren zona explícita y se interpretan en Santiago. Un término común, un procedimiento especial, una suspensión, una habilitación, una ampliación territorial o un feriado regional aplicable requieren fijar la fecha manualmente.

Para aprobar una edición, el profesional responsable debe cotejar el texto vigente, el calendario y el efecto de la notificación, resolver independientemente cada caso de referencia y registrar el fundamento de cada respuesta. En una revisión del repositorio se incorpora a `publishedCivilReview` la identidad profesional, fecha de revisión, vigencia confirmada, fecha de la versión consultada para cada norma de LeyChile en `sourceVersions`, resultados y huella de la edición. Un caso ausente o discrepante mantiene la edición bloqueada. La guía y los casos están junto al [perfil versionado](../src/lib/deadlines/civil-profile.ts). Las fuentes para el cotejo son el [CPC, arts. 59, 64–66](https://www.bcn.cl/leychile/navegar?idNorma=22740), el [Código Civil, arts. 48–49](https://www.bcn.cl/leychile/navegar?idNorma=172986) y la [Ley 2.977 y sus modificaciones](https://www.bcn.cl/leychile/navegar?idNorma=23639).

`POST /api/plazos` admite `calculationProfile` con los valores `manual`, `internal` o `civil`. El civil requiere fecha efectiva, número de días, `notificationConfirmed` y `civilScopeConfirmed`. El servidor conserva las entradas, regla, revisión y resultado de cada cálculo civil aceptado. Las lecturas históricas usan la fecha guardada. Una rectificación manual conserva la base original y retira el régimen activo. Los clientes anteriores que omiten el perfil conservan su contrato de fecha directa o estimación interna.

## Minutas, Altazor y trabajo sin conexión

Una acción de minuta vinculada a un plazo pide el mismo respaldo al marcarla como hecha. La minuta, el documento generado, las tareas, el plazo, el historial y la auditoría se confirman juntos. Un fallo revierte la operación completa.

Altazor dispone de `plazo.listar` para consultar versiones y `plazo.actualizar` para proponer un cambio con justificación o documento explícitos. La vista previa incluye el respaldo propuesto. Se comprueban el ámbito de la conversación y los permisos actuales también al confirmar o repetir una operación.

La copia offline conserva la justificación o selección documental dentro de la bóveda cifrada. Para usar un documento, prepare antes una copia de su versión confirmada desde la causa. Si no está preparada, puede registrar una justificación manual. Sincronizar vuelve a comprobar permisos, versiones y respaldo. Los rechazos conservan el texto local para corregirlo; un conflicto exige comparar las copias. Una respuesta perdida se reintenta con la misma identidad y no duplica el historial.

## Listas y contrato API

Las vistas mensual y «Mis vencidos pendientes» recorren páginas de 100 registros, ordenados por fecha e identificador. El total respeta el filtro y los permisos. Los selectores permiten buscar causas fuera de las primeras 100 y elegir responsables de todos los roles internos; asignar no concede acceso a una causa.

`GET /api/plazos` conserva su respuesta como array. Admite `causaId`, `q`, `estado`, `mes`, `vista=mis-vencidos`, `limit` y `after`; devuelve `X-Total-Count`, `X-Next-Cursor` y `expectedVersion` por plazo. Un cursor vacío indica fin de la lista. `PATCH` requiere la versión consultada para cambios de estado. Un cumplimiento sin respaldo devuelve 422; un cambio concurrente devuelve 409. Envíe una `Idempotency-Key` estable para reintentar una misma operación.

El historial está en `/api/plazos/{id}/history`, con cursor `after` por revisión. Las respuestas y descargas son privadas y no se almacenan en la caché del service worker. La migración es aditiva y no modifica los cumplimientos antiguos. No activa reglas procesales ni altera los horarios de actualización judicial.
