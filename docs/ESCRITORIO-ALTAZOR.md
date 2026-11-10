# Preparar el escritorio de Altazor

Al preparar el equipo principal, LexOpen comprueba el motor Docker local e inicia la preparación de las herramientas de Altazor si puede usarlo. El asistente muestra el avance y permite reintentar. Si falta Docker, está detenido o usa contenedores Windows, el estado indica qué debes resolver. Puedes iniciar LexOpen mientras se preparan las herramientas.

LexOpen identifica la arquitectura del motor y comprueba la huella SHA-256 antes de cargar un paquete oficial de su versión. Cuando no hay un paquete publicado, utiliza la receta verificada incluida en el instalador para construir el perfil local. Esa primera preparación necesita conexión y espacio para las herramientas. La receta comprueba la conversión de documentos, la lectura de PDF, el OCR y el audio antes de marcar el perfil como listo.

Cuando las herramientas estén disponibles, abre **Mi asistente → Computadora** y vincula el escritorio que el administrador preparó para tu espacio. El diagnóstico del instalador comprueba el motor y la imagen local. La conexión se verifica por separado en LexOpen.

| Herramientas del escritorio | Trabajo que permiten |
| --- | --- |
| LibreOffice Writer, Calc, Impress y Draw | Revisar escritos, planillas, presentaciones y documentos gráficos. La imagen incluye traducción y diccionario en español. |
| Poppler, qpdf y pypdf | Comprobar y extraer PDF, renderizar páginas y preparar copias de lectura. |
| Tesseract en español e inglés | Recuperar texto en documentos escaneados. |
| Pandoc, EbookLib y Python | Leer EPUB y convertir Markdown, procesar bibliografía, trabajar con Word y hojas de cálculo. |
| Chromium, Beautiful Soup y ripgrep | Navegar, extraer texto de HTML accesible y buscar dentro de archivos. |
| Lector semántico de Altazor | Leer la pestaña activa, enlaces y controles sin valores de formulario; buscar y paginar texto de PDF/Word/planillas antes de recurrir a imágenes u OCR. |
| FFmpeg y FFprobe | Inspeccionar y preparar audio para transcripción, incluido WAV mono a 16 kHz. |

La transcripción necesita un proveedor configurado en LexOpen. La búsqueda de expedientes y la preparación de citas siguen usando los permisos y la evidencia conservada en la aplicación. Las notas para Obsidian pueden exportarse en Markdown desde las funciones compatibles de LexOpen.

La lectura del navegador omite contraseñas, valores de formularios y parámetros de URL. Los documentos se leen únicamente dentro del directorio de trabajo del contenedor; no se admiten rutas absolutas, ocultas ni enlaces simbólicos. Se devuelve una ventana de texto de hasta 12.000 caracteres, con búsqueda y continuación. Los PDF sin capa de texto requieren usar el visor o pedir OCR expresamente. El contenido recuperado es material de trabajo, nunca instrucciones para el asistente.

## Un puesto de trabajo persistente

El escritorio nuevo no caduca a los veinte minutos ni tiene un máximo de dos horas. Conserva su contenedor, aplicaciones, archivos y conversación, aunque cierres LexOpen o reinicies el Host. El motor debe estar disponible y su servicio dedicado debe iniciarse con el equipo. Docker conserva la política de reinicio `unless-stopped`; LexOpen desactiva el apagado por inactividad de ese escritorio.

- **Conexiones:** antes de abrirlo puedes seleccionar juntas las cuentas disponibles y autorizadas. El acceso conserva el ámbito del profesional y de la causa. Los servicios que aún no estén conectados se preparan desde Conexiones; no se copian cookies ni credenciales silenciosamente.
- **Trabajo en segundo plano:** una tarea aceptada sigue ejecutándose en el gateway sin mantener abierto el chat. La supervisión rota entre los escritorios para no dejar otros sin revisión cuando un puesto queda inactivo o bajo control manual. Las consultas y solicitudes de ayuda se conservan; el worker y ntfy/WhatsApp requieren la configuración y preferencias de segundo plano del usuario.
- **Detener y reanudar:** Detener cancela el trabajo actual y apaga la máquina sin eliminarla. Reanudar utiliza la misma máquina y conversación, tras revisar nuevamente permisos y disponibilidad. No repite un encargo anterior.
- **Escritorios anteriores:** Conservar escritorio persistente convierte la sesión temporal seleccionada, incluso después del antiguo plazo máximo, con comprobación de su identidad. Los registros anteriores no se activan automáticamente durante la migración.
- **Conservación y respaldo:** mantén la carpeta de datos del gateway, el workspace dedicado y los datos del motor Docker. El perfil del navegador y las aplicaciones también viven en el contenedor conservado. Eliminarlo manualmente, limpiar Docker o perder el disco puede destruir ese estado; el motor puede reconstruir un contenedor eliminado a partir del workspace, pero no se garantiza recuperar el perfil del navegador ni sus cookies sin un respaldo adecuado.

La persistencia del puesto no convierte en permanentes las autorizaciones de una contraseña ni la toma de control del teclado. Cada petición sigue comprobando los permisos actuales; una revocación bloquea el acceso y el trabajo nuevos. Los presupuestos por tarea limitan el consumo, sin caducar el escritorio.

## Preparación para el administrador del equipo principal

1. Abre un motor Docker local con contenedores Linux. La comprobación del instalador usa conexiones locales en Windows, macOS y Linux. En Linux también detecta un motor rootless en su socket habitual.
2. Prepara el ejecutable y el archivo de código desde **Construir el gateway reforzado**. Usa una carpeta nueva para ese archivo. A continuación, ejecuta desde el repositorio de LexOpen. [Guía de conexiones](ALTAZOR-CONEXIONES.md#construir-el-gateway-reforzado).

   ```sh
   node scripts/altazor/build-desktop-image.mjs /ruta/al/codigo-archivado-del-escritorio
   ```

   El programa construye la imagen y prueba las herramientas con documentos sintéticos sin red como usuario del escritorio. Al terminar imprime el identificador `sha256:…` de la imagen y registra el perfil local para que lo detecte el asistente. Los paquetes Debian de la imagen quedan inventariados en `/usr/share/lexopen-desktop/packages.tsv`.
3. Configura la instancia dedicada al profesional y al espacio con ese identificador en `containers.image`, actualizaciones automáticas de imagen desactivadas y su carpeta propia. La [guía de operación](../src/lib/altazor/computer/README.md) describe el proveedor de IA y la conexión al Host local. Vincula y comprueba el escritorio desde la aplicación.

El instalador incluye el Host, Chromium y la receta del perfil. Los pasos manuales anteriores sirven también para diagnóstico y para instalaciones sin el asistente de Desktop. El motor de contenedores y el servicio dedicado de cada profesional conservan su preparación propia. Comprueba la conexión en **Mi asistente → Computadora** antes de enviar archivos o encargos.

## Comprobar los paquetes de escritorio

El flujo de publicación prueba el escritorio en Linux `amd64` y `arm64`. Para una etiqueta nueva, cada equipo exporta la imagen probada, retira la etiqueta local y verifica que Docker restaure la imagen con el identificador original. Las comprobaciones conservan los recibos JSON. La descarga de la imagen queda pendiente hasta ofrecer los avisos de licencia y el acceso al código fuente correspondiente de sus componentes. La publicación y el actualizador distribuyen los instaladores nativos por separado.

Para repetir el paso de exportación en el runner, indica la evidencia y una carpeta nueva. La versión de `desktop/package.json` debe corresponder a la publicación.

```sh
node scripts/altazor/pack-desktop-image.mjs /ruta/al/summary.json /ruta/a/carpeta-nueva
```

El programa empaqueta la imagen que coincide con la evidencia y genera un recibo con tamaño, huella, arquitectura y revisión. Si una versión posterior ofrece la descarga, el instalador sólo aceptará el archivo `LexOpen-<versión>-altazor-linux-<arquitectura>.tar.gz` de su publicación oficial. Comprueba su tamaño y huella y aplica un límite de 2 GB comprimidos. [Metadatos de archivos publicados](https://docs.github.com/en/rest/releases/assets) · [Runners Linux de GitHub](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

Fuentes de los paquetes principales. [LibreOffice en Debian](https://packages.debian.org/trixie/libreoffice) · [Poppler](https://packages.debian.org/trixie/poppler-utils) · [Tesseract en español](https://packages.debian.org/trixie/tesseract-ocr-spa) · [Pandoc](https://packages.debian.org/trixie/pandoc) · [FFmpeg](https://packages.debian.org/trixie/ffmpeg).
