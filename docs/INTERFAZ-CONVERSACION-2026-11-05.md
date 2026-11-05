# Conversación primero

Esta revisión responde a la petición de trabajar con ALTAZOR hablando, sin configurar cada mensaje. Conserva MIDNIGHT y la identidad gráfica existente.

La marca visible dice **Altazor AI**, en una sola línea y con la misma tipografía, tamaño, peso y color para todo el nombre. **Tu asistente** ocupa la segunda línea. El mismo tratamiento acompaña a la mascota en Inicio y en el acceso al acompañante.

## ALTAZOR

La vista principal muestra la conversación, el mensaje, Adjuntar y Enviar. Ya no pide elegir un espacio, autorizar otra vez la IA conectada, marcar la memoria ni escoger fuentes antes de hablar. Conversaciones recupera los chats guardados; Mi asistente reúne conexión, memoria y computadora.

Enviar utiliza la conexión configurada y autorizada. La aplicación sigue comprobando el destino exacto y la política vigente; si cambia la conexión durante el envío, conserva el texto y pide reenviarlo. Abrir una pantalla, seguir un enlace o cambiar de causa no envía un mensaje. Las acciones que modifican trabajo mantienen su revisión.

El RIT/ROL, el enlace a una causa, el documento enlazado o el expediente abierto permiten reconocer el contexto. Un identificador ambiguo pide aclaración. Las conversaciones de causas diferentes mantienen su aislamiento; los adjuntos pendientes no cambian de causa silenciosamente.

ALTAZOR busca pasajes pertinentes entre fuentes accesibles, con un máximo de cuatro referencias por mensaje. Para un pedido general de una causa puede preparar ventanas de hasta tres documentos recientes; no acredita la lectura de todo el expediente. Los documentos se preparan con el verificador existente, conservando versión, original y localización. Un documento todavía no procesado se identifica como tal.

Con la memoria activada, utiliza recuerdos confirmados y puede recuperar hasta dos intercambios relevantes del mismo usuario y ámbito entre los cien más recientes. Conserva además el contexto reciente de la conversación. Un diálogo antiguo no es una fuente jurídica verificada. Retirar una fuente o perder sus permisos invalida los derivados correspondientes. No se transforman inferencias del modelo en hechos confirmados.

## Menos decisiones visibles

| Apartado | Recorrido principal | Acceso secundario conservado |
| --- | --- | --- |
| Navegación | Áreas y búsqueda | Apariencia e idioma en Mi cuenta; navegación rápida por teclado |
| Causas manuales | Expediente, referencia libre y preparación | Equipo, gestión e historial |
| PJUD · Chile | Consulta o ingreso con ClaveÚnica | Filtros, seguimiento y descargas por causa |
| Sincronización | Google Drive y carpetas vinculadas | Frecuencia y configuración de cuentas |
| Biblioteca | Libros y búsqueda | Filtros, apariencia y Mesa de escritura |
| Importación | Elegir archivos y causa | Conversión, OCR, original y privacidad |
| Documentos | Nombre, causa y estado relevante | Detalles y descarga por documento |
| Académico | Trabajo y objetivo | Tipo, destinatarios y creación de otro proyecto |
| Agenda | Eventos y edición al abrirlos | Mover fecha y eliminar en Opciones |
| Mensajes | Bandeja y Nuevo mensaje | Redacción con IA cuando se solicita |
| Honorarios | Registrar trabajo | Exportaciones en Informes; tarifas y cuenta corriente en navegación |
| Espacios | Archivos y lectura | Comentarios al solicitar su formulario |

Los avisos de conflictos, la pérdida del original y los problemas que impiden avanzar siguen visibles. Simplificar no elimina los permisos, la importación explícita de causas ni la confirmación de borrados.

## Dos modalidades de causas

Configuración → Gestión de causas permite al administrador elegir **Gestión manual** o **Poder Judicial de Chile**. Causas manuales admite referencias, órganos, materias e identificaciones de cualquier país en las dos modalidades. Poder Judicial de Chile habilita además el apartado conectado. La modalidad es una preferencia del estudio que conserva los expedientes existentes.

Las instalaciones nuevas empiezan en gestión manual. La migración conserva la modalidad conectada cuando existía una configuración judicial activa. Cambiar la modalidad conserva documentos, conexiones, credenciales cifradas y trabajos pendientes. Desactivar PJUD pausa las consultas y descargas sin convertir la pausa en un fallo. Las solicitudes ya iniciadas vuelven a comprobar la modalidad antes de cambiar de canal, importar o enviar el siguiente aviso; los pendientes pueden continuar al reactivarla.

Los endpoints judiciales comprueban también la modalidad. Ocultar un enlace no sustituye esta protección. La configuración requiere administrador, capacidad de gestión del Host, protección CSRF y registro de auditoría. La consulta y el registro por PJUD validan el formato de los identificadores judiciales. Las referencias e identificaciones del formulario manual se guardan tal como se ingresan.

## Validación

Las comprobaciones usan PostgreSQL, archivos y proveedores ficticios separados del Host del estudio. La consulta automática de fuentes es local; no acredita cuentas reales conectadas ni la ejecución de un proveedor de IA real. Los instaladores publicados y su procedencia se verifican separadamente en cada release.
