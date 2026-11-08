# Actualizar LexOpen y sus dependencias

En Windows, el Host inicia y detiene PostgreSQL mediante `pg_ctl`, con espera de disponibilidad y cierre, registro privado y entorno limitado a las funciones del sistema. Esta utilidad aplica el inicio con permisos restringidos previsto por [PostgreSQL](https://github.com/postgres/postgres/blob/REL_17_STABLE/src/bin/pg_ctl/pg_ctl.c), en lugar de ejecutar directamente el servidor bajo una cuenta elevada. La instalación no crea cuentas del sistema ni necesita un servicio privilegiado nuevo.

La aplicación de escritorio empaquetada y el Host ejecutado desde un clon tienen actualizadores distintos. Ambos conservan la carpeta de datos. Descargar código o un instalador no acredita que el Host haya reiniciado con la versión nueva.

Esta entrega incorpora comprobaciones, preparación y recibos. Las pruebas descritas al final usan datos ficticios, componentes reales del actualizador y sustitutos de servicios nativos; no acreditan una actualización firmada real en todos los sistemas.

## Escritorio empaquetado

En el menú **LexOpen → Actualizaciones** puede elegir:

- Comprobar automáticamente al abrir y cada seis horas, o desactivar esas comprobaciones. **Buscar actualizaciones** sigue disponible manualmente.
- **Estable**, que consulta el canal `latest`, o **Vista previa**, que compara `preview` y `latest` y ofrece la versión posterior. Así, una preliminar puede actualizarse a su versión estable sin cambiar de preferencia. Una versión de prueba no se ofrece como estable.
- **Descargar instalador oficial**, para revisar los paquetes disponibles si el actualizador no está disponible.

La comprobación y la descarga reintentan hasta tres llamadas cuando falla la red, con esperas acotadas. Una firma o huella inválida no se trata como un fallo transitorio. La descarga muestra progreso en el estado y, cuando el sistema lo admite, en el icono de la aplicación. **Versión y estado** permite consultar el último mensaje.

La descarga y la instalación requieren decisiones separadas. No se instala automáticamente al cerrar la aplicación. Los cambios de canal esperan a que termine una actualización pendiente. Una versión inferior se bloquea, incluso después de cambiar de canal. En un paquete, la versión se obtiene de su propio `package.json`, sin aceptar una sustitución desde variables de entorno.

### Instalar en modo Host

1. Guarde los escritos y detenga grabaciones. La confirmación explica que los clientes perderán conexión durante el mantenimiento.
2. LexOpen detiene el Host antes de copiar sus datos. Espera la salida del proceso y comprueba PID conocido de PostgreSQL y puertos HTTP/base; una señal enviada o un timeout no cuentan como parada confirmada. Un fallo de `pg.stop()` bloquea el respaldo y la instalación.
3. Crea un respaldo fuera de la carpeta de datos, en el directorio hermano de respaldos, con nombre `pre-update-…`.
4. Comprueba el manifiesto, PostgreSQL y almacenamiento requeridos, y compara tamaño y SHA-256 de los archivos copiados. Si falla una comprobación, no llama al instalador e intenta reanudar el Host anterior.
5. Sólo después solicita al actualizador instalar y reiniciar. La versión se reconoce como aplicada en el runtime después de migraciones y comprobación del arranque.

La copia conserva datos y configuración de esa carpeta. Si la instalación utiliza almacenamiento externo, enlaces o una base remota, requiere preparación específica; el actualizador no simula un respaldo completo ni mueve esos servicios automáticamente. El respaldo contiene información y secretos de la instalación: conservarlo en un destino protegido forma parte de la operación del estudio. La copia no añade cifrado por sí sola.

En modo **Cliente** se actualiza el shell de ese equipo; no se crea un respaldo de la base del Host remoto ni se detiene ese servidor.

### Firmas y paquetes de prueba

La verificación de firma no se desactiva para resolver errores. El actualizador de macOS necesita una aplicación firmada; una construcción de prueba sin firma puede necesitar instalación manual de un paquete de procedencia comprobada. El mensaje ofrece ese camino y no promete que una descarga sin firma constituya una actualización verificada.

Publicar un paquete, firmarlo, notarizarlo e instalarlo son comprobaciones distintas. La disponibilidad de certificados y credenciales de publicación se documenta en la entrega de distribución. No se almacena ninguna credencial de firma en el repositorio.

## Elegir una carpeta de datos anterior

El asistente Desktop permite **Elegir carpeta existente**. Puede ser una carpeta vacía dedicada o la carpeta de datos de una instalación LexOpen anterior. La elección se guarda como un puntero en la configuración del lanzador; no copia, mueve ni reinicializa archivos.

La validación rechaza carpetas generales o de instalación, enlaces, una carpeta ocupada por otro PostgreSQL activo, configuración con archivos externos no cubiertos por el respaldo y bases remotas. En una instalación anterior recupera puerto y URL configurados para evitar conectar con otro servicio por usar los valores por defecto. No se muestran contraseñas ni cadenas de conexión.

Si la validación pide una recuperación supervisada, conserve la instalación anterior y sus respaldos. Cambiar de carpeta no es un procedimiento de migración de servicios externos.

## Host desde un clon

La actualización desde Configuración requiere ejecutar el clon mediante `npm run web:host`. Un proceso HTTP iniciado sin ese coordinador no puede detenerse, respaldarse y comprobar su propio reemplazo de forma segura; el panel explica que la actualización integrada no está disponible en ese modo.

El coordinador usa solicitudes y bloqueos con identificador y propietario. La antigüedad de un bloqueo no autoriza eliminar el de un proceso vivo. La limpieza sólo afecta al recibo correspondiente; no borra un trabajo diferente.

### Secuencia de actualización

1. Detener el programador de respaldos y esperar un respaldo que estuviera en curso; detener el Host.
2. Comprobar raíz del clon, rama elegida y ausencia de cambios o archivos locales sin registrar, **antes de descargar referencias**. No ejecutar `stash`, `reset --hard` ni cambiar de rama automáticamente.
3. Descargar la referencia y fijar su SHA; exigir avance compatible y bloquear versiones inferiores. Un mismo número de versión con una revisión posterior puede actualizarse en el clon, pero debe producir su propia identidad de compilación.
4. Crear y comprobar el respaldo antes de aplicar el avance.
5. Aplicar únicamente el avance rápido a la revisión fijada.
6. Ejecutar `npm ci` en la raíz y `npm --prefix desktop ci`: ambos instalan las versiones de sus lockfiles. Preparar después el runtime Electron mediante su `install.js`, necesario para el flujo Desktop desde clon. No ejecutar `npm update` en producción.
7. Compilar el Host y obtener `.next/BUILD_ID` **antes** de iniciar migraciones.
8. Guardar `awaiting_restart`. El coordinador reinicia; el runtime aplica las migraciones correspondientes a esa compilación.
9. Comprobar salud, versión, identidad de compilación y revisión de fuente exactas. Sólo esa comprobación permite guardar `done` con `ok=true`. Un servidor anterior que responde correctamente no basta.

El canal del clon puede configurarse con `LEXOPEN_UPDATE_CHANNEL=preview` en el entorno del Host o con la preferencia correspondiente en su configuración de datos. El valor por defecto es estable. La referencia de código sigue siendo la rama configurada; el canal no convierte un checkout arbitrario en un paquete publicado.

El recibo `self-update-status.json` conserva fase, revisiones anterior/destino, versiones, identidad esperada, ubicación del respaldo y necesidad de recuperación. No registra las salidas completas de Git/npm, porque pueden contener URLs o configuración privada. Un administrador puede usar el diagnóstico local del paso fallido sin compartir secretos.

### Fallos y recuperación

- **Fallo antes de aplicar código:** los datos y la revisión anterior permanecen; el coordinador intenta reanudar el Host anterior.
- **Fallo de dependencias o compilación después del avance:** queda el respaldo y la revisión anterior identificada. No se reinicia automáticamente hacia migraciones con una compilación fallida. El Host permanece detenido para recuperación supervisada.
- **Fallo al reiniciar o al comprobar identidad:** no se declara éxito ni se revierte automáticamente la base. El recibo informa que el estado de migración después del intento necesita revisión.
- **Solicitud antigua o bloqueo de otro proceso:** no se descartan silenciosamente. Revisar su identidad, proceso y estado antes de volver a solicitar mantenimiento.

No hay rollback automático de código o de base en esta entrega. El SHA anterior y el respaldo son evidencia para recuperar, no una promesa de reversión ya ejecutada.

Para una recuperación de **código**, un operador debe comprobar primero que no se iniciaron migraciones y que el respaldo es válido. Puede preparar un checkout separado de la revisión anterior, conservando intacto el clon fallido y cualquier cambio del usuario. Ejemplo orientativo, sustituyendo las rutas y el SHA por los del recibo:

```bash
git worktree add --detach ../lexopen-recuperacion <SHA_ANTERIOR_COMPROBADO>
cd ../lexopen-recuperacion
npm ci
npm --prefix desktop ci
npm run desktop:build
```

Antes de arrancarlo contra datos existentes, revisar compatibilidad de esquema y la carpeta de datos explícita. Si se iniciaron migraciones o su estado es incierto, no ejecutar simplemente el binario anterior sobre esa base: utilizar el [procedimiento de restauración](WEB-HOST.md), aceptando conscientemente el punto temporal del respaldo. La intervención no debe descartar trabajo posterior sin revisarlo.

Después de una recuperación manual, conservar el recibo hasta comprobar instalación, fuentes y permisos; el bloqueo de nuevas actualizaciones puede requerir revisión del estado anterior. No borrar archivos de estado mientras otro coordinador esté activo.

## Dependencias incluidas y opcionales

Las dependencias JavaScript y ejecutables incluidos se actualizan mediante un nuevo paquete o las versiones fijadas de los lockfiles del clon. Un cambio mayor de PostgreSQL exige su propio procedimiento de migración y restauración; no se resuelve reemplazando un ejecutable.

El adaptador nativo `pdfdown-ocr` es opcional y admite macOS y Linux; su ausencia no impide instalar LexOpen en Windows. Allí, el OCR local utiliza Tesseract y Poppler cuando el usuario los ha instalado y configurado (`OCR_TESSERACT_BIN` y `OCR_PDFTOPPM_BIN`). Si no están disponibles, el diagnóstico informa que el OCR está ausente; no descarga herramientas ni acredita procesamiento por detectar sólo una versión. La lectura de un PDF con texto y el OCR de páginas escaneadas son capacidades distintas.

**LexOpen → Comprobar herramientas opcionales** consulta localmente las versiones de Poppler, Tesseract y Codex cuando están disponibles. Las comprobaciones:

- Tienen tiempo y salida acotados, sin shell.
- No reciben credenciales de base, sesión, cuenta o modelo.
- Distinguen herramienta ausente, versión detectada y resultado no comprobado.
- No instalan, actualizan ni conectan cuentas.

La detección de una versión no certifica compatibilidad funcional. PDF/OCR se prueba con un archivo ficticio; Codex requiere su autorización explícita y prueba de modelo; Chromium/OJV se diagnostica desde PJUD. El entorno aislado tiene su propio preflight: no se instala Docker automáticamente como dependencia incidental.

Dependabot propone semanalmente actualizaciones para la raíz, Desktop y GitHub Actions. Las propuestas no se despliegan ni fusionan automáticamente. Los cambios mayores de npm quedan fuera de esa actualización rutinaria y se planifican por separado; las actualizaciones compatibles necesitan superar las pruebas de aplicación y paquetes antes de distribuirse. Los avisos de seguridad que exijan un cambio mayor requieren revisión explícita, no quedan resueltos por el calendario semanal.

## Comprobación y límites de esta entrega

Pruebas reproducibles de esta implementación:

```bash
node desktop/update-policy.test.cjs
node desktop/main-updater.test.cjs
node desktop/release-provider.test.cjs
node desktop/appimage-updater.test.cjs
node desktop/mac-updater.test.cjs
node desktop/config.test.cjs
node desktop/renderer.test.cjs
node scripts/web-self-update.test.mjs
node scripts/web-host.integration.test.mjs
node --import tsx src/lib/self-update.test.ts
```

El test de main ejecuta el entrypoint real dentro de un proceso Electron simulado: comprueba preferencias, intervalo, progreso y orden de mantenimiento, copiando y verificando datos ficticios. El test del clon crea repositorios Git temporales locales; no descarga actualizaciones reales ni ejecuta npm/migraciones sobre la instalación del estudio. Se comprueban también el fallo de build, identidad antigua rechazada, cambios locales preservados y bloqueo de otro propietario.

La prueba del proveedor usa GitHubProvider real con respuestas HTTP simuladas. La de AppImage verifica descarga, SHA-512, sustitución y relanzamiento de ejecutables ficticios en Linux. La de MacUpdater sustituye el servicio nativo de Electron; no instala una aplicación de macOS. La integración del Host ejecuta el coordinador, Git, npm, procesos y HTTP locales, con un Host y migraciones ficticios.

En el ensayo del DEB publicado, el Host no superó la comprobación de salud en Linux con OpenSSL 3 porque faltaba su motor Prisma. Tras añadir ese motor a una extracción temporal, pasó la prueba de arranque y persistencia. El empaquetado debe incluir y comprobar motores para OpenSSL 1.1 y 3; falta construir, probar y publicar un nuevo paquete con esa corrección. El parche temporal no modifica la descarga publicada ni acredita una actualización completa entre versiones.

Windows y macOS siguen pendientes de una instalación y actualización firmadas en sus sistemas nativos; los paquetes preliminares publicados carecen de firma de editor y notarización. Las pruebas con sustitutos no resuelven ese requisito.

Estos resultados no sustituyen un ensayo de actualización firmada, permisos del sistema operativo, pérdida de energía, volumen real ni actualización mayor de PostgreSQL. La entrega de distribución debe registrar por separado los paquetes construidos e instalados, sus huellas, plataformas y limitaciones.
