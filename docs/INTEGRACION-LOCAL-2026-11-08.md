# Integración del trabajo local — 8 de noviembre de 2026

La consolidación se publica en [PR #254](https://github.com/gabrielperezibacache/lexopen/pull/254). Conserva el historial local de Altazor académico, docencia, conexiones, escritorio y archivos verificados, junto con las correcciones de la auditoría, el modo sin conexión cifrado, WhatsApp, Clientes, tareas, causas, plazos, notas, minutas, documentos y adjuntos. La sincronización mantiene las comprobaciones actuales de permisos, versiones y claves de idempotencia.

## Revisión de pull requests

| PR | Decisión técnica |
| --- | --- |
| #231 | Integrado directamente: setup-node 7. |
| #232, #233, #234 | Incorporados en #254: checkout 7, download-artifact 8 y upload-artifact 7. |
| #235, #253 | Dependencias compatibles incorporadas en #254; se conservan Prisma 5.22 y las versiones locales superiores cuando corresponde. |
| #216 | Accesibilidad del equipo incorporada; carga separada por acción, errores recuperables y permisos conservados. |
| #241 | Estado de carga de tareas incorporado junto con las claves de idempotencia y la versión esperada del trabajo local. |
| #251 | Incorporada la implementación local posterior de conexiones/configuración, que amplía el trabajo original a Google, GitHub, Dropbox y Microsoft. |

Los PR originales cubiertos por la consolidación se cierran después de integrar #254. No se necesita aplicar sus parches de nuevo.

## Trabajo local y separación de proyectos

Se revisaron las 42 ramas locales. Las diferencias sin publicar de `codex/audit-consolidation` tienen el mismo árbol que la auditoría ya publicada; el texto del chungungo de `codex/altazor-desktop-and-case-workspace` ya está presente. Los tres commits de `codex/mac-private-editorial-8` son integraciones privadas de la edición 8 y las mismas funciones posteriores incluidas en la consolidación. No requieren reintroducir versiones anteriores.

Relevo Android conserva su Git independiente y se excluye de LexOpen por decisión del usuario. Las capturas y vídeos de QA quedan en el equipo y en el respaldo verificado; se publican los recursos usados por la aplicación y los informes de texto. Las configuraciones privadas, credenciales y almacenamiento de usuarios quedan fuera de la publicación.

## Correcciones durante la consolidación

- Resolución de solapamientos manteniendo las funciones locales más recientes, los permisos y la sincronización idempotente.
- Simulaciones del gateway actualizadas al contrato de autorizaciones, sin conceder permisos de uso del computador por defecto.
- Reintentos acotados con espera para transacciones serializables de Altazor; regresión con doce preparaciones simultáneas que convergen en una conversación.
- Limpieza de fixtures después de finalizar todas las operaciones concurrentes, conservando el error original.
- Pruebas de navegación adaptadas a la restauración del panel de memoria y al rechazo de orígenes externos.
- Fechas de Agenda en la zona del navegador después de la hidratación, sin diferencias entre el HTML inicial del servidor y el cliente.
- Formulario de Agenda bloqueado hasta que sus controles están preparados, para conservar las entradas durante la carga inicial.
- Simulaciones de fallos de red aisladas del service worker; las pruebas sin conexión continúan usándolo.
- Actualización de dependencias transitivas vulnerables de escritorio y de minimatch en los dos consumidores afectados, manteniendo electron-builder actual.
- Separación de la regresión general y de las pruebas sin conexión: estas últimas usan el servidor compilado y CSRF activo en Chromium, Firefox y WebKit.
- Corrección del texto largo del selector de transcripción en WebKit a 360 px, sin ocultar el desbordamiento de la página.

## Validación

Se usan PostgreSQL, almacenamiento y cuentas ficticias en copias aisladas. La revisión incluye pruebas unitarias, integración completa, migraciones y comparación del esquema, tipos, lint, compilación, regresión de navegador y CI con instaladores nativos. Los resultados finales y los checks corresponden al estado del PR #254. Estas pruebas no acreditan el funcionamiento con cuentas externas reales ni implican publicar una versión o ejecutar migraciones sobre datos de usuarios.
