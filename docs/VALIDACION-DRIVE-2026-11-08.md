# Validación de Drive y conexiones — 8 de noviembre de 2026

## Entrega instalada

La integración de carpetas de causas y guardado de documentos está instalada en el Host privado de validación, `http://localhost:3366`. Conserva el diseño de preview.8, la única cuenta administrativa con 2FA, los archivos y la configuración existente.

- Commit de implementación: `6d4f8d4e43fecf30610430dd47a4d8fb3fe5cb58`, 60 archivos acotados. Los cambios locales ajenos se conservaron.
- Fuente de la compilación aislada con el diseño aprobado: `568c9d30e1a96d010727e661ef462b37ffa8b768`.
- Build instalado: `HH_XKGPNiZ4Ne2kEtzlIP`.
- Motor instalado: `v1.1.0-lexopen-files.17`, con `lexopen_drive_management:v1`.
- Huella del binario del motor: `1881a2392524df1b79463dac458b43a375cfde5e5b790b65662b9cb39a2aae8c`.
- Actualización con respaldo, cero escritorios activos y configuración conservada; no se ejecutaron migraciones ni cambios de paquetes.

## Comprobaciones

| Comprobación | Resultado y alcance |
| --- | --- |
| TypeScript y compilación de producción | PASS, incluidas las dos rutas nuevas de comandos de causa y vista previa de documento |
| Lint final | PASS, 50 archivos de fuentes, scripts y pruebas del cambio |
| Contratos unitarios finales | 20 PASS: disponibilidad, permisos, nombres, recibos, capacidad del motor y clasificación del encargo |
| Integración PostgreSQL | OAuth, causas, importación, recepción automática, conexión personal y herramientas conversacionales PASS; base desechable y proveedores simulados |
| Navegador | 26 recorridos del grupo de conexiones, configuración y Drive PASS. Los seis recorridos finales de Drive pasaron con la última compilación de rutas, incluyendo peticiones HTTP reales al servidor desechable y rechazo del usuario de portal |
| Midnight y móvil | Cinco recorridos de Drive repetidos en oscuro PASS, con capturas revisadas a 360 px y escritorio, sin desbordamiento |
| Motor nativo | 219 casos con detector de carreras PASS, sin omitidos; reproducción idéntica de 287 archivos Go desde la revisión fijada |
| Actualizador del motor | Seis escenarios simulados PASS; actualización real Go16→Go17 completada con respaldo y comprobación de capacidades |
| Cuentas reales | Google, GitHub y Dropbox confirmaron acceso de lectura después de actualizar motor y Host; cero nuevos inicios de sesión para esa comprobación |
| Identidad de Drive | El puente nuevo verificó que la cuenta del motor coincide con la prueba OAuth guardada en LexOpen; lectura disponible y escritura aún no concedida |

La primera revisión del paquete detectó dos rutas nuevas ausentes del parche. Se corrigió la exportación de rutas dinámicas, se comprobó la lista completa de diez archivos del backend y se añadió una prueba directa contra las rutas compiladas. Las pantallas simuladas no se utilizaron como prueba de acceso real al proveedor.

El flujo fija cuenta, causa, carpeta, versión y huella del documento. Rechaza documentos reservados, cambios de destino y acceso revocado. Una respuesta incierta no se reenvía; la comprobación consulta el registro o el objeto remoto. La cancelación antes del envío impide la mutación y libera el registro cuando está demostrado que el envío no salió.

## Estado que requiere intervención del titular

La cuenta real de Google conserva **lectura**, sin ampliación automática. Se abrió el consentimiento oficial para que el titular decida autorizar gestión de Drive. La escritura real no está acreditada mientras ese consentimiento y la operación de prueba no se completen. El permiso completo de Google incluye eliminación; las herramientas actuales crean carpetas y copias o versiones separadas, conservando los originales. Las copias salientes tienen un límite de 4 MiB.

Se preparó la [actualización de privacidad](DRIVE-CAUSAS-2026-11-08.md#texto-propuesto-para-la-política-pública) y se solicitó revisión antes de publicarla. La política pública no se cambió durante esta ampliación.

Google sigue sin verificación pública. La consola indicó esperar hasta el 8 de noviembre a las 20:45 de Chile continental por la acreditación del dominio; cumplir el plazo no equivale a aprobación. Faltan incorporar el alcance nuevo, su justificación, la política coherente y una demostración real de todos los clientes OAuth. No se ha creado ni subido un video de verificación.

Dropbox conserva el piloto Development de hasta 500 usuarios, con retornos locales registrados y perfil público preparado; la solicitud de producción aún necesita el icono y los requisitos del proveedor. Microsoft permanece pendiente por indicación expresa del usuario.

Estos commits son locales. Esta validación no acredita integración de estos cambios en `main` ni publicación de instaladores nuevos. La [guía de publicación](CONEXIONES-PUBLICACION-2026-11-08.md) conserva el detalle del perfil distribuible de Google, GitHub y Dropbox.
