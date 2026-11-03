# Evidencia de la auditoría

Fecha: 1 de noviembre de 2026. Los resultados pertenecen a snapshots temporales; no se ejecutaron sobre datos del estudio. Main: 72400f9b9627cdc147ebf7c14a791c063747a686. Notificaciones: a5fcb72d41354683956c1002740ad4b7b283940e. Equipo: 0193d410a5c5aa4d59c13432227ef9886c35c153.

## Comprobaciones conservadas

| Archivo | Resultado y alcance |
| --- | --- |
| main-tests.log | npm test, exit0; no equivale a E2E ni a servicios vivos |
| main-integration.log | Integración PostgreSQL16, exit0; los errores Prisma inyectados son parte de pruebas de rollback |
| main-migrations.log | Migraciones en base nueva desechable, correctas |
| main-lint.log | ESLint, exit0 |
| main-tsc-before-build.log | tsc, exit0 antes de generar tipos de rutas Next; no basta para validar build |
| build-turbopack.log | Build incompleto por puerto auxiliar rechazado por el entorno; no atribuido como bug de producto |
| build-webpack.log | Código compilado; validación de export auxiliar TOTP falla. Build completo no aprobado |
| notify-migrations.log | Esquema203 en base nueva, correcto; no prueba migración con duplicados/datos heredados |
| notify-postgres-probe.log | Cuatro fallos de203 reproducidos contra BD ficticia; violación de unicidad esperada en el último escenario |
| egress-production.json | Turno real local_only alcanza proveedor falso con texto; fetch interceptado, cero solicitudes reales |
| checks-github.json | Checks consultados de los HEAD202/203/206; estado y URL de cada build |

La prueba de compatibilidad LAN y la de matcher prefetch están descritas en los anexos de PR; no se guardó aquí una grabación de la aplicación completa. Las pruebas de nota/undo sustituyen Prisma en memoria y no equivalen a una transacción PostgreSQL. La prueba del acuse combina ejecución de la función con inspección de autorización de ruta; no fue una petición HTTP autenticada.

## Reproducción acotada

Los archivos con sufijo .ts.txt conservan los probes usados, sin incorporarlos a la compilación ni a los tests de la aplicación. Importan los módulos originales de snapshots aislados y contienen datos ficticios. Egress e integridad usan interceptores en memoria. El probe de notificaciones requiere exclusivamente una base nueva y desechable, con el esquema de203, y no configura proveedores externos.

Para repetir, obtener los SHA indicados en carpetas temporales, instalar sus dependencias, generar su cliente Prisma y ajustar los paths de importación del probe al snapshot. Ejecutar los probes con node --import tsx; la configuración TypeScript debe resolver los alias del snapshot. No ejecutar un probe de fixture contra el data dir del Host ni reutilizar DATABASE_URL de una instalación real.

Los resultados prueban comportamientos específicos del código, no que esos fallos hayan sucedido con datos reales. El inventario y la investigación de producto son de solo lectura. No se enviaron correos, Telegram o push, ni se usaron cuentas/credenciales de Google, OJV o IA remota.
