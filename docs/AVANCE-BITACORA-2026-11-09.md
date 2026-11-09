# Avance a partir de la bitácora del 8 de noviembre

La bitácora describe una prueba histórica de conexión real de Codex y un último
retorno OJV HTTP 404. Son observaciones de esa fecha: no acreditan el estado
actual de la cuenta ni una recuperación del servicio judicial. El archivo de
código no estuvo disponible; los cambios siguientes se implementaron y probaron
contra el repositorio y el protocolo accesibles en esta revisión.

- Codex personal usa un perfil de permisos nombrado y único por sesión para una carpeta temporal
  de sólo lectura y sin red para herramientas. La inicialización negocia la API
  experimental requerida por el protocolo de la CLI comprobada. La sesión sigue
  sin herramientas y rechaza solicitudes de ejecución o aprobación. Comprueba
  el perfil y rechaza servidores MCP heredados activos antes de cada envío;
  admite entradas desactivadas. Los errores de formato RPC muestran un código
  fijo sin exponer mensajes del proveedor.
- La CLI 0.167.0-alpha.4 aceptó la configuración, inició una conversación
  efímera y aceptó un turno con texto ficticio usando una cuenta local vacía.
  No se efectuó una inferencia con una suscripción real; los dobles de prueba
  comprueban además aislamiento, cancelación y selección de cuenta. El smoke
  reproducible usa `LEXOPEN_TEST_CODEX_BIN=/ruta/a/codex npm run test:codex:real`
  y crea sus propias carpetas temporales, sin credenciales.
- En la descarga autenticada OJV, una respuesta identificada como PDF por su
  tipo o por la ruta debe empezar con la firma PDF. Cuando no coincide, se
  conserva la referencia sin adjuntar esos bytes. Se mantienen los
  límites de tamaño, las restricciones de acceso y los demás tipos admitidos.
- La ruta de descarga del documento responde con contenido no encontrado si
  falta el original y el texto alternativo no representa un PDF identificado
  por nombre o tipo. Los bytes almacenados se entregan íntegros, incluso si
  el formato está dañado; un archivo de texto vacío sigue siendo descargable.
- Se agregaron formularios de incidencias y una plantilla de PR con indicaciones
  para no publicar datos reales, en respuesta al issue #269.

Siguen pendientes el puente para entregar al escritorio documentos OJV
seleccionados y las operaciones de creación y subida de Drive desde ese
escritorio. La existencia de funciones de gestión en otro ámbito no demuestra
que estén disponibles para una sesión aislada. También permanece pendiente
comprobar la recuperación y cobertura real de OJV y la cuenta de Codex del
usuario; las pruebas locales no sustituyen esas comprobaciones.
