# Instaladores de LexOpen

La serie `1.1.0-preview` prepara la distribución nativa de LexOpen. Las descargas se publican en [GitHub Releases](https://github.com/gabrielperezibacache/lexopen/releases) únicamente cuando terminan las comprobaciones. Una configuración de construcción o un job pendiente no acredita una descarga disponible.

| Equipo | Arquitectura | Archivos |
| --- | --- | --- |
| Windows | Intel/AMD 64 bits | Instalador `.exe` y paquete `.zip` |
| macOS Intel | x64 | `.dmg` y `.zip` |
| macOS Apple Silicon | arm64 | `.dmg` y `.zip` |
| Linux | Intel/AMD 64 bits | `.AppImage` y `.deb` |

Windows ARM y Linux ARM no forman parte de esta matriz. Los paquetes incluyen Electron/Node, PostgreSQL, Prisma, el servidor y Chromium nativos del destino. No requieren Node, Git o npm externos para arrancar. PDF/OCR, modelos, transcripción, Codex personal y Docker tienen requisitos propios: no se instalan silenciosamente junto al programa.

En el asistente del equipo principal, **Escritorio de Altazor → Comprobar escritorio** indica si el motor local y el perfil de oficina, PDF, OCR y audio están presentes. El Host puede arrancar mientras se prepara el escritorio dedicado. [Guía de preparación](ESCRITORIO-ALTAZOR.md).

En macOS Intel el inspector PDF utilizado no publica un binding nativo para esta arquitectura. LexOpen conserva el resto de la aplicación disponible y utiliza `pdfinfo`/`pdftotext` de Poppler para obtener páginas físicas; sin esas herramientas informa que falta el motor. El OCR en Windows usa el camino Tesseract/Poppler; la dependencia OCR exclusiva de macOS/Linux es opcional. No se inventan números de página ni se da una cita por verificada cuando falta la extracción.

## Primer uso y datos existentes

1. Descargue el archivo correspondiente a su equipo y revise el estado de firma en `release-manifest.json`.
2. Elija **Este PC es el servidor del estudio** o **Conectar a un servidor**. Sólo el Host conserva la base y los archivos.
3. Si ya tiene una instalación, seleccione su carpeta de datos existente antes de iniciar el Host. La instalación de paquetes y la de servicio pueden usar carpetas predeterminadas diferentes. No copie `pgdata` con PostgreSQL en marcha; conserve un respaldo y cierre el otro Host antes de abrir la misma carpeta.
4. Una instalación nueva abre la creación del primer administrador; no carga expedientes de demostración automáticamente.
5. Configure integraciones y herramientas opcionales desde el estudio. La [Mesa del asistente](WORKBENCH.md) necesita su ejecutor habilitado expresamente.

La carpeta de datos se preserva al actualizar y al desinstalar. No se coloca dentro de la aplicación, del DMG ni del directorio temporal. Consulte [Desktop](DESKTOP.md) y [respaldos y recuperación](WEB-HOST.md).

## Firma, actualizaciones y alcance de validación

Los paquetes preliminares pueden carecer de firma de editor y notarización. El sistema puede impedir su apertura o mostrar avisos; no se recomienda desactivar sus protecciones. macOS necesita firma compatible para su actualización automática. `SHA256SUMS` comprueba integridad del archivo, pero no certifica la identidad del editor.

El canal **estable** excluye versiones preliminares. **Vista previa** es una decisión explícita en Desktop. No se fuerza una versión inferior al cambiar de canal. Antes de instalar una actualización en modo Host se detienen los servicios y se crea un respaldo comprobado; un fallo impide continuar. Véase [actualizaciones](ACTUALIZACIONES.md).

Cada paquete se construye en su propio sistema y arquitectura. La prueba ejecuta su Electron como Node, arranca el servidor y PostgreSQL incluidos, crea un administrador ficticio y comprueba que base, archivo y secretos sobreviven a un reinicio. Rechaza discrepancias de versión, compilación y revisión de código. Las entradas privadas, enlaces fuera de los recursos y binarios de otra arquitectura bloquean el empaquetado.

Estas pruebas verifican el Host empaquetado en los sistemas de CI; no sustituyen instalar y usar la ventana gráfica en equipos nuevos. Quedan como puertas de distribución estable las firmas/notarización, instalación y actualización entre dos versiones en equipos de prueba, restauración, permisos reales de audio, herramientas OCR y compatibilidad de librerías del sistema. AppImage también depende del soporte del sistema; DEB ofrece una vía alternativa en distribuciones compatibles.

## Construcción reproducible por plataforma

Use un clon limpio del repositorio público, sin `.env`, expedientes, carpetas de datos ni credenciales. Node 22.12 o posterior es una dependencia de construcción. El programa distribuido utiliza su propio Node.

```sh
npm ci
npm run desktop:install
```

Antes de crear los instaladores, prepara la receta del escritorio con el repositorio fuente en la revisión indicada en `desktop/altazor-desktop-profile.json`. Usa un directorio de salida nuevo. El flujo de GitHub prepara este recurso una vez y lo utiliza para probar el escritorio y construir los instaladores de esa publicación.

```sh
python3 scripts/altazor/prepare-desktop-source.py /ruta/al/checkout-fijado desktop/.release/altazor-desktop-source
```

Instale Chromium en un caché nuevo y exclusivo de construcción, **no** en el perfil habitual:

```sh
# macOS/Linux; en Windows configure esta misma variable con PowerShell.
export PLAYWRIGHT_BROWSERS_PATH="$PWD/desktop/.release/playwright-browsers"
npx --no-install playwright install chromium
npm run desktop:dist
npm run desktop:smoke
node desktop/scripts/signature-report.mjs
```

En PowerShell:

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = "$PWD/desktop/.release/playwright-browsers"
npx --no-install playwright install chromium
npm run desktop:dist
npm run desktop:smoke
node desktop/scripts/signature-report.mjs
```

En Linux, el constructor también necesita las librerías requeridas por Chromium y los formatos elegidos. El workflow instala esas dependencias en su máquina de pruebas. Los scripts `desktop:dist:mac`, `desktop:dist:win` y `desktop:dist:linux` comprueban que se ejecutan en su plataforma real; no simulan una distribución multiplataforma desde un solo equipo. Los resultados quedan en `desktop/dist`, los recursos intermedios en `desktop/.release`.

El workflow [Desktop installers](../.github/workflows/desktop-release.yml) ensambla los cuatro destinos, une los dos feeds de macOS sin perder arquitecturas y comprueba los hashes de cada entrada. Sólo una etiqueta que coincida exactamente con ambas versiones de `package.json`, y supere todas las pruebas de aplicación, puede publicar. Una versión estable exige además firma de editor en Windows y firma/notarización en macOS; la configuración preliminar actual no proporciona esas credenciales y bloquea esa publicación.

Referencias: [construcciones multiplataforma de electron-builder](https://github.com/electron-userland/electron-builder/blob/master/website/docs/features/multi-platform-build.md), [actualización de electron-builder 26](https://github.com/electron-userland/electron-builder/blob/v26.0.12/pages/auto-update.md) y [sistemas de GitHub Actions](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).
