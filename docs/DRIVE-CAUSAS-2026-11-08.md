# Google Drive en Mis Causas

Estado al 8 de noviembre de 2026: esta integración está en desarrollo. Sus pruebas utilizan un motor y cuentas ficticias sobre una base de datos desechable. La escritura con una cuenta real y la verificación pública de Google siguen pendientes.

## Una cuenta, una carpeta y sus documentos

LexOpen reutiliza la cuenta de Google que el profesional conectó a Altazor. No necesita registrar otro proyecto para organizar los documentos de sus causas.

El recorrido previsto es:

1. Conectar Google desde las aplicaciones de Altazor.
2. Abrir una causa y elegir una carpeta existente o crear una nueva.
3. Consultar e incorporar sus archivos a la causa.
4. Autorizar expresamente la gestión de Drive cuando se quiera guardar documentos.
5. Revisar el documento y su destino antes de confirmar una copia o una nueva versión.

La cuenta utilizada pertenece al profesional que la conectó. Compartir una causa no concede a otros integrantes acceso a esa cuenta personal. Los miembros autorizados pueden consultar las copias conservadas en el expediente según sus permisos de LexOpen.

## Qué autoriza Google y qué ofrece este flujo

| Autorización | Uso |
| --- | --- |
| Lectura de metadatos | Consultar información básica de archivos |
| Lectura de archivos | Consultar y descargar documentos autorizados |
| Gestión de Drive | Crear carpetas y guardar copias de documentos en los destinos revisados |

La gestión requiere el alcance `https://www.googleapis.com/auth/drive`. Google lo describe como acceso para gestionar todos los archivos de Drive disponibles para esa cuenta, e incluye capacidades de borrado. Es un permiso más amplio que las operaciones directas implementadas en este flujo.

Las herramientas aquí descritas crean carpetas, guardan copias y generan versiones separadas. No ofrecen borrar, mover, compartir ni sobrescribir archivos existentes. El alcance concedido por Google no sustituye la revisión del destino, los permisos de la causa ni los permisos efectivos del archivo en Drive.

El alcance limitado `drive.file` permite trabajar con archivos creados o concedidos a una aplicación. No garantiza acceso al contenido previo completo de cualquier carpeta elegida. Por eso no cubre por sí solo la gestión de carpetas y documentos existentes que requiere este flujo. La ampliación propuesta no añade permisos de correo ni calendario. Véase la [documentación oficial de alcances de Google](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).

## Copias, versiones y resultados verificables

Las copias salientes admiten archivos de hasta **4 MiB**. Antes del envío se fijan la cuenta, la carpeta de destino, la versión local, el tamaño y la huella SHA-256 del original.

Guardar una nueva versión crea **otro archivo** en la carpeta elegida. El archivo anterior permanece disponible. Este flujo no edita directamente el contenido de un documento nativo de Google ni reemplaza silenciosamente un archivo desaparecido o inaccesible.

Si la cuenta, la carpeta, el documento o sus permisos cambian durante la preparación, la aplicación detiene la acción o conserva su resultado como pendiente de comprobación. Si se pierde una respuesta después del envío, no repite la escritura automáticamente. «Comprobar resultado» consulta el registro de la operación y, cuando procede, verifica el objeto ya reservado; no vuelve a enviarlo.

Un fallo confirmado antes de aplicar una operación permite revisar los datos y preparar otra acción. La ausencia de una respuesta no se interpreta como prueba de que nada ocurrió.

Las credenciales persistentes de esta conexión se conservan en el computador de Altazor. No se entregan al modelo mediante la conversación ni se copian a la configuración global de Google del estudio para habilitar este recorrido.

## Actualización automática de la causa

La sincronización incorpora archivos y revisiones **desde Drive hacia LexOpen**. Conserva copias verificadas, su procedencia y las revisiones anteriores. No es una sincronización bidireccional y no sube automáticamente cambios locales a Drive.

El proceso recorre la carpeta vinculada y sus subcarpetas mediante lotes limitados. Conserva el avance entre ejecuciones, evita duplicar una revisión ya incorporada y vuelve a comprobar que las subcarpetas siguen dentro del destino elegido. Una revisión eliminada deliberadamente del expediente no reaparece automáticamente.

Cambiar de carpeta o de cuenta puede pausar la actualización. La transferencia de una sincronización activa a otro profesional exige pausar primero la del titular anterior. Las copias locales conservadas siguen sujetas a los permisos de la causa.

## Texto propuesto para la política pública

Este texto es una propuesta documental; añadirlo aquí no modifica ni publica la política del sitio:

> Con tu autorización, LexOpen puede consultar archivos de Google Drive y guardar documentos en los destinos que elijas. Para gestionar archivos existentes solicita el permiso completo de Drive. Las operaciones implementadas se limitan a las funciones descritas en la aplicación y quedan vinculadas a tu cuenta y a la causa correspondiente. Desconectar Google detiene el acceso futuro mediante esa conexión; no elimina automáticamente las copias que ya conservaste en tus expedientes.

La política y la presentación pública deben explicar tanto el alcance completo concedido por Google como las operaciones concretas disponibles. La revisión pública debe actualizarse antes de anunciar que Google ha verificado esta ampliación.

## Justificación y demostración para Google

La finalidad propuesta es gestionar el ciclo documental de causas que ya tienen carpetas y archivos en Drive: consultar antecedentes, incorporar copias al expediente y guardar documentos revisados en su destino. La necesidad de trabajar con archivos existentes debe justificarse expresamente; no basta con indicar que la aplicación crea archivos nuevos.

La demostración debe cubrir todos los clientes OAuth presentados a revisión y mostrar:

1. La identidad de LexOpen, el sitio y la política accesibles.
2. La conexión oficial y la ampliación explícita del permiso, incluyendo cualquier aviso real del proveedor.
3. La elección de una carpeta existente y la creación de una carpeta para una causa de prueba.
4. La copia de un documento y la comprobación de su destino, tamaño y huella.
5. Una nueva versión con identificador distinto, conservando el archivo anterior.
6. La incorporación de una revisión entrante sin duplicarla.
7. Los controles para revisar la conexión y desconectarla, conservando las copias locales.

Deben emplearse cuentas y documentos de prueba. Contraseñas, códigos, credenciales y documentos privados deben quedar fuera de la grabación. La revisión del proveedor y una prueba real de escritura son comprobaciones independientes de las pruebas automáticas del código.
