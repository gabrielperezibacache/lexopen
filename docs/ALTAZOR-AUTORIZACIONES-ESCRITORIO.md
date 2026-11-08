# Autorizaciones de uso del escritorio

Estas autorizaciones controlan lo que Altazor puede hacer con el ratón, el teclado, el navegador y las aplicaciones del escritorio de trabajo. Se aplican en el servicio nativo antes de ejecutar cada acción. Una instrucción del modelo o una etiqueta de riesgo no concede permisos.

La elección pertenece a la persona y al espacio de trabajo. Para una sesión abierta, sólo se muestra como aplicada cuando el servicio nativo confirma el escritorio, la revisión, las categorías y los límites exactos. Leer Configuración no guarda ni activa permisos. Sin una elección confirmada, no se ejecutan acciones que puedan cambiar el escritorio.

## Modos

| Modo | Comportamiento |
| --- | --- |
| **Supervisar cada acción** | Consulta antes de las acciones que pueden cambiar el escritorio y antes de ejecutar una lectura local. El monitor, las observaciones reconocidas y la espera siguen disponibles. |
| **Consultas inteligentes** | Avanza con observaciones y lecturas locales verificadas. Consulta antes de clics, escritura, navegación, apertura de aplicaciones y otras acciones cuyo efecto no puede comprobar de antemano. |
| **Trabajo autónomo** | Puede ejecutar las categorías que hayas autorizado expresamente, dentro de sus límites. Elegir el modo por sí solo no autoriza ninguna categoría. |

El estado inicial es **Supervisar cada acción**, con todas las categorías desactivadas. Las lecturas locales reconocidas exigen un archivo importado cuya ubicación y hash se verifican; no equivalen a ejecutar cualquier comando que afirme leer un documento.

## Categorías del trabajo autónomo

Las tres categorías se eligen por separado y empiezan desactivadas:

- **Ratón y teclado:** clics, movimiento, arrastre, desplazamiento, escritura, teclas, interacción con campos de una página y cambio de foco entre ventanas.
- **Abrir páginas web:** navegación a direcciones válidas del navegador. Abrir una dirección también puede provocar efectos en el servicio visitado.
- **Abrir aplicaciones locales:** apertura de un conjunto acotado de aplicaciones de documentos y visualización, con argumentos permitidos. Un intérprete, una terminal o una aplicación desconocida requiere consulta.

**Permitir ratón y teclado puede pulsar Enviar o Eliminar en las aplicaciones abiertas. El sistema no determina automáticamente el significado o el efecto de cada clic o tecla.** Este permiso requiere reconocer expresamente ese alcance. Tampoco se garantiza que una dirección web sea una operación de sólo lectura.

Ejecutar comandos arbitrarios, instalar programas o apagar la máquina sigue requiriendo una consulta, incluso en Trabajo autónomo. Estas opciones no amplían el acceso a la red ni las carpetas compartidas con el equipo principal.

## Consultas y límites

Una consulta presenta la acción real y sus argumentos antes de aceptarla. La aprobación se vincula a esa acción, su escritorio, su conversación, el espacio de trabajo y la revisión de permisos. Aprobar ejecuta esa acción una sola vez; no crea una regla permanente ni autoriza otra acción posterior. Rechazarla no la ejecuta.

Los límites iniciales son **100 acciones** y **20 consultas** por revisión aplicada. Se pueden configurar entre 1 y 1000 acciones y entre 1 y 100 consultas. Las observaciones reconocidas del monitor y la espera no consumen el límite de acciones. Reservar una consulta consume su cupo; no se devuelve por cancelar la tarea. Al agotar un límite, el trabajo se detiene y solicita intervención; nunca se amplían permisos automáticamente.

No se cambia la política mientras hay una tarea en curso o una consulta pendiente. Primero termina, cancela o rechaza ese trabajo. Una revisión nueva sólo se aplica mediante una elección explícita y confirmada.

## Pausa, control humano y resultados sin confirmar

El monitor y el control manual siguen disponibles. Mientras la persona controla el escritorio, el asistente no inicia nuevas acciones automáticas. Esto no suspende un proceso que ya haya comenzado. Una aprobación anterior no puede saltarse esa pausa.

Antes de una posible modificación, el servicio guarda una reserva con la acción exacta. Sólo la cierra cuando el resultado nativo y su registro quedan confirmados. Si la ejecución falla, se interrumpe o queda sin confirmar, la sesión conserva ese estado aunque el servicio se reinicie. No vuelve a ejecutar la acción, no delega la tarea para sortear el bloqueo y no permite borrar la incertidumbre guardando otros permisos.

En ese caso, revisa el monitor y lo ocurrido en la aplicación, detén ese escritorio y abre uno nuevo para continuar con una tarea nueva. Una sesión nueva no reproduce automáticamente la tarea anterior. Un resultado nativo confirmado acredita que terminó la acción solicitada; no demuestra por sí solo que se consiguió el objetivo de la tarea.

## Secretos y conexiones

Estos permisos son de uso del escritorio. No crean nuevas credenciales ni amplían los permisos de los conectores, el acceso a archivos del equipo principal o a otros espacios de trabajo. El ratón y el teclado sí pueden operar las cuentas que ya estén abiertas en el escritorio, incluso pulsar Enviar o Eliminar, con el alcance que hayas confirmado.

Las acciones de secretos conservan su autorización separada y no pueden aprobarse mediante una consulta genérica de uso del escritorio. Las conexiones y sus lecturas mantienen sus propios permisos y confirmaciones. Para introducir datos sensibles o resolver una comprobación personal, utiliza el control humano y el flujo correspondiente de Secretos.
