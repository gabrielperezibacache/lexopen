# Preparar el escritorio de Altazor

En el asistente de instalación del equipo principal, abre **Escritorio de Altazor** y pulsa **Comprobar escritorio**. El resultado distingue si falta Docker, si el motor está detenido o si falta el perfil de herramientas. Puedes terminar la instalación de LexOpen y preparar el escritorio después.

Cuando tu versión ofrezca un paquete de herramientas, descárgalo desde **Releases** y pulsa **Cargar paquete oficial** en el asistente. LexOpen identifica la arquitectura del motor, consulta la publicación exacta de su versión y comprueba el tamaño y la huella SHA-256 del archivo antes de cargarlo. El diálogo indica qué archivo elegir. [Descargas oficiales](https://github.com/gabrielperezibacache/lexopen/releases).

Cuando las herramientas estén disponibles, abre **Mi asistente → Computadora** y vincula el escritorio que el administrador preparó para tu espacio. El diagnóstico del instalador comprueba el motor y la imagen local. La conexión se verifica por separado en LexOpen.

| Herramientas del escritorio | Trabajo que permiten |
| --- | --- |
| LibreOffice Writer, Calc, Impress y Draw | Revisar escritos, planillas, presentaciones y documentos gráficos. La imagen incluye traducción y diccionario en español. |
| Poppler, qpdf y pypdf | Comprobar y extraer PDF, renderizar páginas y preparar copias de lectura. |
| Tesseract en español e inglés | Recuperar texto en documentos escaneados. |
| Pandoc, EbookLib y Python | Leer EPUB y convertir Markdown, procesar bibliografía, trabajar con Word y hojas de cálculo. |
| Chromium, Beautiful Soup y ripgrep | Navegar, extraer texto de HTML accesible y buscar dentro de archivos. |
| FFmpeg y FFprobe | Inspeccionar y preparar audio para transcripción, incluido WAV mono a 16 kHz. |

La transcripción necesita un proveedor configurado en LexOpen. La búsqueda de expedientes y la preparación de citas siguen usando los permisos y la evidencia conservada en la aplicación. Las notas para Obsidian pueden exportarse en Markdown desde las funciones compatibles de LexOpen.

## Preparación para el administrador del equipo principal

1. Abre un motor Docker local con contenedores Linux. La comprobación del instalador usa conexiones locales en Windows, macOS y Linux. En Linux también detecta un motor rootless en su socket habitual.
2. Prepara el ejecutable y el archivo de código desde **Construir el gateway reforzado**. Usa una carpeta nueva para ese archivo. A continuación, ejecuta desde el repositorio de LexOpen. [Guía de conexiones](ALTAZOR-CONEXIONES.md#construir-el-gateway-reforzado).

   ```sh
   node scripts/altazor/build-desktop-image.mjs /ruta/al/codigo-archivado-del-escritorio
   ```

   El programa construye la imagen y prueba las herramientas con documentos sintéticos sin red como usuario del escritorio. Al terminar imprime el identificador `sha256:…` de la imagen y registra el perfil local para que lo detecte el asistente. Los paquetes Debian de la imagen quedan inventariados en `/usr/share/lexopen-desktop/packages.tsv`.
3. Configura la instancia dedicada al profesional y al espacio con ese identificador en `containers.image`, actualizaciones automáticas de imagen desactivadas y su carpeta propia. La [guía de operación](../src/lib/altazor/computer/README.md) describe el proveedor de IA y la conexión al Host local. Vincula y comprueba el escritorio desde la aplicación.

El instalador base incluye el Host y Chromium. En esta versión, el administrador construye el perfil con los pasos anteriores. El motor de contenedores y el proveedor dedicado conservan su preparación propia. El Host puede arrancar mientras se prepara el escritorio.

## Comprobar los paquetes de escritorio

El flujo de publicación prueba el escritorio en Linux `amd64` y `arm64`. Para una etiqueta nueva, cada equipo exporta la imagen probada, retira la etiqueta local y verifica que Docker restaure la imagen con el identificador original. Las comprobaciones conservan los recibos JSON. La descarga de la imagen queda pendiente hasta ofrecer los avisos de licencia y el acceso al código fuente correspondiente de sus componentes. La publicación y el actualizador distribuyen los instaladores nativos por separado.

Para repetir el paso de exportación en el runner, indica la evidencia y una carpeta nueva. La versión de `desktop/package.json` debe corresponder a la publicación.

```sh
node scripts/altazor/pack-desktop-image.mjs /ruta/al/summary.json /ruta/a/carpeta-nueva
```

El programa empaqueta la imagen que coincide con la evidencia y genera un recibo con tamaño, huella, arquitectura y revisión. Si una versión posterior ofrece la descarga, el instalador sólo aceptará el archivo `LexOpen-<versión>-altazor-linux-<arquitectura>.tar.gz` de su publicación oficial. Comprueba su tamaño y huella y aplica un límite de 2 GB comprimidos. [Metadatos de archivos publicados](https://docs.github.com/en/rest/releases/assets) · [Runners Linux de GitHub](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

Fuentes de los paquetes principales. [LibreOffice en Debian](https://packages.debian.org/trixie/libreoffice) · [Poppler](https://packages.debian.org/trixie/poppler-utils) · [Tesseract en español](https://packages.debian.org/trixie/tesseract-ocr-spa) · [Pandoc](https://packages.debian.org/trixie/pandoc) · [FFmpeg](https://packages.debian.org/trixie/ffmpeg).
