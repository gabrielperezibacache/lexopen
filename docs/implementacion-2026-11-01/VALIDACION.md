# Validación del incremento

Fecha: 2026-11-01. Node 22+, Next 16.3.0, Prisma 5.22 y PostgreSQL 16.14. Base Git: `72400f9`; PR incorporados: `202@0193d410` y `203@a5fcb72d`. Todas las bases y cuentas usadas son ficticias y locales. El código de aplicación se identifica en `code-sha256.json`; los logs de migración registran el esquema del árbol de trabajo antes de consolidar el commit.

| Comprobación | Resultado | Evidencia |
| --- | --- | --- |
| Instalación limpia de dependencias | PASS, `npm ci` y Prisma generate | Validación preparatoria; lockfile de la combinación conservado |
| Suite unitaria completa | PASS, exit 0 | [units.log](units.log) |
| Lint completo | PASS, exit 0, sin advertencias | [lint.log](lint.log) |
| Compilación de producción | PASS, exit 0; incluye validación de TypeScript/rutas | [build.log](build.log) |
| Integración PostgreSQL | PASS, exit 0, todas las suites encadenadas | [integration.log](integration.log) |
| Navegador Chromium completo | PASS, exit 0, **28 pruebas** en 4 minutos | [browser.log](browser.log) |
| Respuesta perdida y reintento de pago/plazo desde UI | PASS, un registro por operación y misma clave tras recarga | [response-loss.json](response-loss.json) |
| Servidor `next start`, `NODE_ENV=production` | PASS, exit 0; login visual compilado, CSRF y 2FA sin relajación, 12 grupos de aserciones | [production-smoke.log](production-smoke.log), [runtime.json](runtime.json) |
| Upgrade real desde esquema `main` | PASS; 14 filas originales en 12 tablas, hashes de 56 tablas históricas, un espejo nuevo esperado; 30 migraciones completas y cero drift | [upgrade.log](upgrade.log) |
| Respaldo/restauración lógica | PASS; primera vuelta 597 filas/8 objetos; segunda 601 filas/10 objetos e identidad de hashes de evidencia | [restore.log](restore.log) |
| Independencia de TRIFOLIA | Ninguna referencia en código runtime, dependencias ni esquema; fuentes propias no requieren IA; transporte local_only probado sin red | `rg -i trifolia src package.json prisma/schema.prisma` sin coincidencias; pruebas de egress en units.log |

El build usa la opción oficial Webpack. La limitación ambiental previa de Turbopack no se interpreta como defecto del producto. Permanece una advertencia de `createRequire` en el scraper público PJUD, que no impide compilar; el acceso externo vivo sigue sin verificar.

Los logs de integración incluyen errores deliberados de rollback y carreras de PostgreSQL. La suite comprueba la recuperación o la reversión y termina con exit 0; esas líneas no son fallos omitidos.

Los logs guardados normalizan códigos de color, la ruta absoluta del checkout y espacios finales; no sustituyen valores ni resultados. Las migraciones originales de los PR se conservaron byte a byte, incluido un salto vacío final en la migración outbox de PR 203 para mantener su checksum.

La repetición de navegador sobre la misma base detectó que una prueba antigua usaba el título fijo «prueba e2e». Se aisló con un identificador único para verificar la audiencia creada en esa ejecución. No se relajó la comprobación mediante `.first()`. En el ensayo productivo, el ajuste de cuenta usa el permiso que corresponde al abogado; el tipo provisión continúa requiriendo `ledger.provision`.

La navegación Causa → Espacio respondió 200 tras cinco segundos de compilación en desarrollo, agotando el límite de cinco segundos de la prueba. Se conserva el mismo destino exigido y se permite hasta quince segundos para la compilación inicial. El servidor productivo usa las rutas ya compiladas.

La pasada siguiente reprodujo un envío nativo GET del login antes de su hidratación, con las credenciales ficticias en la URL y sin solicitud a la API. Se corrigió el formulario: controles deshabilitados hasta estar interactivo y método POST explícito. La regresión sin JavaScript comprueba el HTML inicial y la suite autenticada comprueba el acceso una vez listo; no se añadió una pausa artificial al helper.

Los dos escenarios de acceso que recorren varias páginas y numerosas API disponen de noventa segundos totales para las compilaciones de desarrollo. Las expectativas de permisos, respuestas y contenido se mantienen. El smoke del servidor compilado conserva los controles reales y completa sus aserciones sin ese coste de compilación.

## Repetición

Preparar PostgreSQL local y una base nueva cuyo nombre incluya `test` o `e2e`. Fijar `E2E_DATABASE_URL` explícita y `DATABASE_URL` al mismo valor, aplicar migraciones y usar un `SESSION_SECRET` exclusivo de pruebas.

```sh
npm ci
npm run lint
npm test
npm run test:integration
npm run build -- --webpack
```

Para Chromium, `scripts/e2e-server.mjs` migra/reinicia exclusivamente la base E2E indicada y carga fixtures. `E2E_BUNDLER=webpack` permite usar el mismo compilador de la validación local.

El smoke productivo exige servidor compilado en loopback, una base desechable separada y las variables de la misma instancia. No usa el modo E2E para relajar controles:

```sh
NODE_ENV=production LEXOPEN_E2E=0 LEXOPEN_RELAX_CSRF=0 \
  PROD_TEST_BASE_URL=http://127.0.0.1:3211 npm run test:production:smoke
```

El script crea y limpia sus propias filas. Una URL con nombre de prueba no sustituye la decisión de usar realmente datos desechables.

## Límites de la evidencia

- No hubo despliegue en la instalación del estudio, ni migración de sus datos.
- La prueba de restauración cubre dump/restore lógico de PostgreSQL y copia local de archivos. No acredita restauración física del Host, vault/configuración, S3 o medios cifrados.
- Chromium móvil emulado cubre los flujos nuevos a 360 × 800; no acredita iOS/Android físicos ni uso por dos equipos en LAN.
- Los transportes externos se simularon. Se verificaron sus políticas y recuperación, sin enviar correo, mensajes ni documentos reales.
- El benchmark de salas no se ejecutó contra una cartera. Se corrigieron su guarda y alcance.
- Las capturas contienen exclusivamente fixtures.

## Capturas revisadas

- Fuentes propias: [escritorio](capturas/fuentes-escritorio.png) y [móvil](capturas/fuentes-movil.png).
- Reconciliación de avisos: [escritorio](capturas/avisos-escritorio.png) y [móvil](capturas/avisos-movil.png).

La revisión visual independiente del lector cerró los tres hallazgos de contraste/recuperación de error sin cambiar su composición.
