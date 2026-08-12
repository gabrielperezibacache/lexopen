# LexOpen como aplicación web en un Host local

Esta modalidad no requiere instalar Electron en los equipos cliente. Un único PC
ejecuta LexOpen y PostgreSQL; el resto accede desde Safari, Chrome o Firefox.

## Requisitos del Host

- Node.js 22.x.
- Un directorio local persistente para documentos.
- Tailscale es opcional; una LAN aislada también funciona.

El Host puede ser Windows, macOS o Linux. Los clientes solo necesitan navegador y
acceso de red al Host.

## Instalación

Desde el repositorio, en el PC que será Host:

```bash
git clone https://github.com/gabrielperezibacache/lexopen.git
cd lexopen
npm ci
LEXOPEN_DATA_DIR=/ruta/persistente/lexopen npm run web:host
```

`web:host` instala el runtime desktop si falta, compila solo cuando es necesario,
inicia PostgreSQL embebido, aplica migraciones y arranca Next.js. No requiere una
instancia PostgreSQL separada ni servicios cloud.

Si no define `LEXOPEN_DATA_DIR`, la configuración queda en la carpeta de datos
predeterminada del sistema. El servidor escucha en `0.0.0.0:3000`.

## Primera configuración

El comando imprime un enlace de configuración inicial. Ábralo en el Host:

```text
http://127.0.0.1:3000/setup?token=<LEXOPEN_BOOTSTRAP_TOKEN>
```

Cree el administrador, inicie sesión y cree los usuarios del estudio. Después de
configurar la instalación, el token deja de ser válido. No comparta ese enlace.

Compruebe el estado:

```bash
curl http://127.0.0.1:3000/api/health
```

Debe mostrar `db: "up"`, `storageReady: true` y `needsSetup: false`.

Las cargas documentales no bloquean la petición: el Host conserva el original y
procesa Markdown/OCR en una cola local. Si se reinicia durante el procesamiento,
la siguiente consulta a health recupera los trabajos pendientes. La tabla
**Documentos** muestra el estado y permite reintentar.

## OCR local para PDFs escaneados

El OCR es opcional. `pdf-inspector` detecta las páginas escaneadas y LexOpen usa el
binding nativo de `pdfdown-ocr`, que requiere únicamente Tesseract y renderiza las
páginas internamente:

```bash
# Debian/Ubuntu
sudo apt install tesseract-ocr tesseract-ocr-spa

# macOS con Homebrew
brew install tesseract tesseract-lang
```

En Windows instale Tesseract y Poppler: el binding OCR nativo actual no publica
binario Windows y LexOpen usa el fallback `pdftoppm`. Configure
`OCR_TESSERACT_BIN` y `OCR_PDFTOPPM_BIN` con sus rutas completas. Puede ajustar el
idioma con `OCR_LANGUAGE=spa+eng` y limitar el consumo con `OCR_MAX_PAGES` y
`OCR_TIMEOUT_MS`. Si faltan los binarios, el original se conserva y el documento
queda marcado como `Requiere OCR`.

## Acceso desde los clientes

Para una LAN completamente local, obtenga la IP privada del Host y configure en el
`.env` del directorio de datos:

```dotenv
LEXOPEN_TRUSTED_ORIGINS=http://127.0.0.1:3000,http://IP-DEL-HOST:3000
```

Reinicie LexOpen y abra desde cada cliente:

```text
http://IP-DEL-HOST:3000
```

Tailscale sigue siendo opcional para acceso remoto; no es necesario para una red
local sin Internet.

## Arranque automático

Después de validar manualmente `npm run web:host`, puede ejecutar el Host como
servicio del sistema:

### Linux con systemd

Instale el repositorio y compile una vez en `/opt/lexopen`, cree el usuario de
servicio y prepare el directorio de datos:

```bash
sudo useradd --system --home /var/lib/lexopen --shell /usr/sbin/nologin lexopen
sudo mkdir -p /opt/lexopen /var/lib/lexopen
sudo chown -R lexopen:lexopen /opt/lexopen /var/lib/lexopen
sudo cp deploy/systemd/lexopen-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now lexopen-web
```

Logs:

```bash
journalctl -u lexopen-web -f
```

### macOS con launchd

Edite `deploy/launchd/com.lexopen.webhost.plist` para coincidir con la ruta del
repositorio y del Node instalado. Luego:

```bash
mkdir -p "$HOME/Library/LaunchAgents"
cp deploy/launchd/com.lexopen.webhost.plist "$HOME/Library/LaunchAgents/"
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.lexopen.webhost.plist"
launchctl kickstart -k "gui/$(id -u)/com.lexopen.webhost"
```

### Windows

Abra PowerShell como administrador y ejecute:

```powershell
.\deploy\windows\install-web-host.ps1 -ProjectPath C:\LexOpen
```

La tarea se ejecuta al iniciar Windows y reinicia el Host si el proceso termina.

## Operación y respaldos

- Mantenga el Host encendido y con permisos de escritura sobre `STORAGE_PATH`.
- No ejecute `npm run db:seed`, `npm run setup` ni `npm run db:reset` con datos reales.
- Para crear un respaldo web, detenga el Host y ejecute:

  ```bash
  npm run web:backup -- --output /ruta/externa/lexopen-backup
  ```

  El respaldo incluye PostgreSQL, documentos, vault y configuración. Contiene
  `.env`, por lo que debe guardarse en un disco cifrado.

- Para restaurar, mantenga el Host detenido y ejecute:

  ```bash
  npm run web:restore -- --source /ruta/externa/lexopen-backup
  npm run web:host
  ```

  La restauración conserva un rollback temporal hasta verificar el arranque.

- Verifique periódicamente `/api/health`, espacio libre y backups restaurables.
- Para PJUD, `CRON_SECRET` permite un scheduler externo; Render no programa este
  sync cuando se usa un Host local.
