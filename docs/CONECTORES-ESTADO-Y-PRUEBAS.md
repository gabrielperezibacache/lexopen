# Conexiones de Altazor: disponibilidad y pruebas

El catálogo contiene 48 adaptadores. Esto permite explorar las aplicaciones compatibles; no significa que existan 48 cuentas conectadas. Cada escritorio recibe únicamente las conexiones elegidas por su propietario.

## Qué significa cada estado

| Estado | Qué se comprobó | Siguiente paso |
| --- | --- | --- |
| Disponibilidad sin comprobar | Aún no se obtuvo el inventario del escritorio | Preparar el escritorio o comprobar su estado |
| No disponible | Falta el adaptador, el sistema compatible o una protección necesaria | Revisar la preparación del escritorio |
| Disponible para configurar | El escritorio ofrece el adaptador | Conectar la cuenta o completar su configuración |
| Guardada · sin comprobar | Existe una configuración; sus claves no se muestran | Probar el acceso |
| Falta iniciar sesión | El servicio necesita autorización | Iniciar sesión en la página oficial |
| Acceso comprobado | La última prueba solicitada confirmó el acceso | Elegir esa conexión para el encargo |
| Revisar acceso | La prueba no confirmó el acceso | Revisar autorización y configuración |
| Sin prueba automática | El servicio no ofrece una comprobación automática | Comprobarlo con una operación concreta y revisable |

La comprobación del catálogo y la del acceso son operaciones distintas. Volver a cargar el inventario o cambiar la configuración elimina la comprobación temporal de la pantalla: no se presenta una prueba anterior como un resultado actual. Si hay varias cuentas, comprobar una no marca todas como verificadas.

## Qué funciona y qué preparación necesita

| Grupo | Alcance implementado | Preparación y límites |
| --- | --- | --- |
| Google, GitHub y Dropbox | Ingreso guiado, comprobación de identidad y acceso según los permisos concedidos | La identidad de la aplicación debe estar preparada. No se concede acceso por mostrar un botón |
| Dropbox | Listar, buscar y recuperar archivos; renovación del acceso autorizado | Aplicación propia del administrador; permisos `account_info.read`, `files.metadata.read` y `files.content.read`; escritorio con las protecciones de lectura y renovación |
| RSS | Consultar noticias de fuentes RSS o Atom configuradas | Direcciones de fuentes; no necesita cuenta para fuentes públicas. No equivale a importar convocatorias ni a suscribir automáticamente el apartado Académico |
| CalDAV y CardDAV | Consultar calendarios/contactos y proponer operaciones admitidas | Dirección del servicio y credenciales o contraseña de aplicación según el proveedor. Guardar el conector no sincroniza automáticamente la Agenda de LexOpen |
| API HTTP | Peticiones a un servicio configurado | Configuración avanzada. Cada petición requiere su propia revisión; no se añade una autorización general para otras aplicaciones |
| Apple, Things y OmniFocus | Acceso a las aplicaciones correspondientes en un gateway nativo de macOS | No están disponibles en un escritorio Linux por el solo hecho de utilizar un Mac como equipo personal |
| Mensajería, productividad, oficina, redes y otros adaptadores | Acciones enumeradas en el catálogo fijado y ofrecidas por el escritorio | Pueden requerir aplicación propia, token, webhook o permisos del sistema; hay que comprobar cada cuenta. No se han validado 48 cuentas reales |
| Programa en el Host | Bloqueado desde este catálogo | No habilita ejecución de programas del equipo personal |

La sesión web que una persona inicia dentro del navegador del escritorio y una conexión por API son accesos diferentes. Iniciar sesión en una página no configura automáticamente su adaptador ni transfiere sus credenciales a otros servicios. Las contraseñas y códigos se introducen en la página oficial o en los campos protegidos; no en la conversación.

## Recuperar un archivo de Dropbox

El flujo guiado conserva la autorización de lectura en el escritorio dedicado. La aplicación de Dropbox se prepara una vez desde Configuración; después cada persona inicia sesión y revisa los permisos. Este recorrido no utiliza el ingreso OAuth genérico del catálogo.

El contrato de acciones disponible para el asistente es:

```json
{"action":"list"}
{"action":"search","query":"syllabus"}
{"action":"read","path":"/Docencia/Curso.pdf"}
```

La recuperación entrega el nombre y los bytes completos del archivo como artefacto. El límite es de 4 MiB por archivo. Una respuesta parcial, un tamaño declarado que no coincide, una interrupción de lectura o un archivo que supera ese límite producen un error; no se presenta el fragmento como una descarga completa.

Dropbox admite exclusivamente los endpoints oficiales de cuenta, listado, búsqueda y descarga. No se ofrece una petición API genérica, subida, borrado, movimiento ni creación de enlaces compartidos en este adaptador. Las rutas con caracteres como tildes se codifican correctamente en su cabecera de descarga.

## Aprobaciones y evidencia

Consultar las operaciones pendientes no las ejecuta. Una aprobación pertenece al escritorio, conversación y conexión seleccionados, y autoriza una sola operación. Aprobar una lectura no autoriza después crear un evento o enviar un mensaje. Los detalles ocultos por contener credenciales o por exceder los límites de revisión impiden la aprobación.

Validación de esta revisión:

- Pruebas unitarias de estados: una configuración guardada, claves presentes o una sesión autorizada no acreditan acceso comprobado; se distinguen fallo y ausencia de prueba automática.
- Pruebas con gateway ficticio para RSS, API HTTP, CalDAV y Dropbox: lecturas revisables, aislamiento de conversación/conexión, rechazo individual y ausencia de aprobación automática de escrituras; una petición con credenciales ocultas no se autoriza.
- Pruebas Go del adaptador Dropbox con `-race` sobre la fuente de escritorio preparada: consultas y descarga por endpoints permitidos, rutas Unicode, límite exacto de 4 MiB, cuerpos incompletos y operaciones no admitidas. No usan cuentas ni archivos personales.
- ESLint de los archivos de esta revisión y detector de interfaz sin hallazgos. La revisión general de TypeScript del checkout detecta cambios pendientes ajenos en Minutas y sus tipos de Prisma; no se presenta como una comprobación global aprobada.

Estas pruebas acreditan contratos y protecciones del código. No sustituyen el consentimiento manual ni una prueba con la cuenta real de cada proveedor, un instalador publicado o la ejecución de todos los servicios en producción.

## Continuidad

1. Completar la identidad y la verificación necesarias del proveedor antes de anunciar una conexión lista para todos los usuarios.
2. Validar una lectura con cada cuenta autorizada y un archivo de prueba; conservar los errores de permisos, renovación y tamaño como estados recuperables.
3. Validar la apertura del navegador oficial desde los instaladores, separando la sesión de la aplicación de la del proveedor.
4. Ofrecer sincronización con Agenda o Académico sólo cuando exista una importación explícita, con origen, permisos y deduplicación propios.

Implementación: `src/lib/altazor/connectors/catalog.ts`, `availability.ts`, `presentation.ts`, políticas de aprobación y adaptadores del escritorio; interfaz en `src/components/altazor/AltazorConnectorCatalog.tsx`.
