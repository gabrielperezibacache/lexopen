# Instaladores de LexOpen

Las descargas públicas están en GitHub Releases. Para `v1.1.0`, el estudio instala primero los paquetes firmados desde un borrador de la publicación con acceso restringido y registra su identidad. Tras la aceptación, se publican los mismos archivos. [Descargas](https://github.com/gabrielperezibacache/lexopen/releases) · [Cotejo del candidato y piloto](ACEPTACION-1.1.0.md)

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
2. Elija **Guardar los datos del estudio** o **Conectar a un servidor**. Sólo el Host conserva la base y los archivos.
3. Si ya tiene una instalación, seleccione su carpeta de datos existente antes de iniciar el Host. La instalación de paquetes y la de servicio pueden usar carpetas predeterminadas diferentes. No copie `pgdata` con PostgreSQL en marcha; conserve un respaldo y cierre el otro Host antes de abrir la misma carpeta.
4. Una instalación nueva abre la creación del primer administrador; no carga expedientes de demostración automáticamente.
5. Configure integraciones y herramientas opcionales desde el estudio. La [Mesa del asistente](WORKBENCH.md) necesita su ejecutor habilitado expresamente.

La carpeta de datos se preserva al actualizar y al desinstalar. No se coloca dentro de la aplicación, del DMG ni del directorio temporal. Consulte [Desktop](DESKTOP.md) y [respaldos y recuperación](WEB-HOST.md).

## Firma, actualizaciones y alcance de validación

El [recibo del DMG para Apple Silicon de preview 10](https://github.com/gabrielperezibacache/lexopen/releases/download/v1.1.0-preview.10/lexopen-signature-darwin-arm64.json) indica que su editor no se autenticó y que carece de notarización. Si macOS bloquea esa descarga, use el DMG firmado de su arquitectura cuando esté publicado. Si la versión anterior no puede abrirse, la instalación manual de ese DMG permite volver a seleccionar la carpeta de datos del Host. Desde la preparación de preview 11, toda publicación pública de macOS, incluidas las previews, exige firma íntegra de Developer ID, notarización y aceptación de Gatekeeper. Los artefactos sin esas comprobaciones sólo sirven para verificación de CI y se identifican como no publicables. `SHA256SUMS` comprueba integridad, pero no certifica la identidad del editor.

### Credenciales protegidas de publicación

Configurar el GitHub Environment `desktop-release` con revisión requerida y acceso sólo a etiquetas de publicación. Los PR y las comprobaciones manuales utilizan `desktop-verification`, sin credenciales de firma. El workflow entrega secretos al empaquetador sólo al construir una etiqueta.

- macOS: `MAC_CSC_LINK` (certificado Developer ID Application en P12 codificado en base64), `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` y `APPLE_TEAM_ID`.
- Windows: `WIN_CSC_LINK` y `WIN_CSC_KEY_PASSWORD`, compatibles con el mecanismo de firma de electron-builder y el certificado contratado. Una versión estable exige Authenticode válido.

No añadir certificados al repositorio ni a los recursos. Sin credenciales de Apple, la construcción de una etiqueta falla antes de compilar; las pruebas de PR pueden continuar sin utilizarlas. Para cada arquitectura Mac se comprueban las aplicaciones extraídas del DMG montado en sólo lectura y del ZIP que descarga el actualizador. Cada copia temporal lleva cuarentena. El recibo incluye en `artifacts.dmg` y `artifacts.zip` el nombre, el SHA-256 y los resultados independientes de cada copia. El ensamblado compara estas huellas con los archivos finales. El recibo de firma distingue `codeSignatureValid`, `publisherAuthenticated`, `notarized` y `gatekeeperAccepted`. Configurar los secretos no acredita que el certificado o la notarización funcionen: debe pasar el recorrido nativo y la instalación real del paquete descargado.

El canal **estable** excluye versiones preliminares. **Vista previa** es una decisión explícita en Desktop. No se fuerza una versión inferior al cambiar de canal. Antes de instalar una actualización en modo Host se detienen los servicios y se crea un respaldo comprobado; un fallo impide continuar. Véase [actualizaciones](ACTUALIZACIONES.md).

Cada paquete se construye en su propio sistema y arquitectura. La prueba ejecuta su Electron como Node, arranca el servidor y PostgreSQL incluidos, crea un administrador ficticio y comprueba que base, archivo y secretos sobreviven a un reinicio. Después activa el segundo factor obligatorio del administrador y crea un documento ficticio y una configuración, detiene el Host, genera un respaldo y lo restaura en un directorio vacío. Vuelve a iniciar el Host desde esa copia y comprueba el cliente, los bytes del documento, el responsable y la fecha del plazo. Un abogado del equipo debe poder abrir la causa y el documento. Un abogado ajeno debe recibir una denegación en ambos accesos. También verifica la configuración y la huella del origen. También comprueba la recuperación ante una restauración rechazada. El recibo identifica sistema y arquitectura; la preparación de una publicación exige esos resultados. Rechaza discrepancias de versión, compilación y revisión de código. Las entradas privadas, enlaces fuera de los recursos y binarios de otra arquitectura bloquean el empaquetado.

Estas pruebas verifican el Host empaquetado en los sistemas de CI; no sustituyen instalar y usar la ventana gráfica en equipos nuevos. Quedan como puertas de distribución estable las firmas/notarización, instalación y actualización entre dos versiones en equipos de prueba, restauración manual en hardware real, permisos reales de audio, herramientas OCR y compatibilidad de librerías del sistema. AppImage también depende del soporte del sistema; DEB ofrece una vía alternativa en distribuciones compatibles.

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
