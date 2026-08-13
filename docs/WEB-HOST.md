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
predeterminada del sistema. Por defecto el Host enlaza **solo loopback**
(`127.0.0.1:3000`). Para LAN o Tailscale debe publicar una URL y/o
`LEXOPEN_BIND` (ver [Acceso desde los clientes](#acceso-desde-los-clientes)).

## Primera configuración

`web:host` **no imprime** el token en logs. Abra en el Host:

```text
http://127.0.0.1:3000/setup
```

Pegue `LEXOPEN_BOOTSTRAP_TOKEN` desde `$LEXOPEN_DATA_DIR/.env` (o Application
Support / `%APPDATA%\LexOpen\.env`). En la app Desktop el flujo abre `/setup`
con cookie automáticamente.

Cree el administrador, inicie sesión y cree los usuarios del estudio. Después de
configurar la instalación, el token deja de ser válido. No comparta ese valor.

Compruebe el estado:

```bash
curl http://127.0.0.1:3000/api/health
```

Debe mostrar `db: "up"`, `storageReady: true` y `needsSetup: false`.
Desde fuera del Host (o sin sesión staff) el JSON público solo incluye `ok`,
`db` y `time`; los campos de setup/storage quedan fuera de la superficie pública.

Las cargas documentales no bloquean la petición: el Host conserva el original y
procesa Markdown/OCR en una cola local. Si se reinicia durante el procesamiento,
la siguiente consulta a health recupera los trabajos pendientes. La tabla
**Documentos** muestra el estado y permite reintentar.

## Checklist de producción

Validación automática del `.env` del Host (y health opcional):

```bash
LEXOPEN_DATA_DIR=/ruta/persistente/lexopen npm run prod:check
# Con Host en marcha:
npm run prod:check -- --health http://127.0.0.1:3000
```

Use esta lista antes de cargar información real del estudio:

1. **Datos persistentes:** `LEXOPEN_DATA_DIR` apunta a un disco local con backups
   posibles (no a una carpeta temporal ni al clon de git).
2. **Sin demo ni relajaciones CI:** en el `.env` del data dir,
   `LEXOPEN_DEMO_SWITCHER=0`, `HERMES_ALLOW_DEMO=0`, `LLM_ALLOW_DEMO=0`,
   `PJUD_ALLOW_DEMO=0`, y también `LEXOPEN_RELAX_CSRF=0`,
   `LEXOPEN_OPEN_ACCESS=0`, `LEXOPEN_ALLOW_PLAINTEXT_PASSWORDS=0`.
   `web:host` fuerza demos a `0` si venía un `.env` copiado con `=1`
   (salvo `LEXOPEN_KEEP_*_DEMO=1`) y **siempre** apaga las flags de
   seguridad prohibidas aunque el shell del operador las tenga en `1`
   (p. ej. CI). El `.env` del data dir también gana sobre un `DATABASE_URL`
   / secretos del shell (evita migrar contra otra base de CI). No use
   `npm run db:seed` / `setup` / `db:reset` con datos reales.
3. **Primer admin:** abra `/setup?token=…` una sola vez; elimine o rote
   `LEXOPEN_BOOTSTRAP_TOKEN` después.
4. **Health:** `curl http://127.0.0.1:3000/api/health` → `db: "up"` y, en
   loopback/staff, `storageReady: true`, `needsSetup: false`.
5. **Secretos:** `SESSION_SECRET` y, si usa PJUD/cron,
   `PJUD_SECRETS_KEY` + `CRON_SECRET` aleatorios (≥16 caracteres).
6. **Schedulers (opcionales, recomendados en operación diaria):**
   `PJUD_SYNC_INTERVAL_MINUTES=240`, `PLAZOS_ALERTAS_INTERVAL_MINUTES=60`,
   `LEXOPEN_BACKUP_INTERVAL_MINUTES` + `LEXOPEN_BACKUP_DIR` **fuera** del data dir.
7. **OCR (opcional):** Tesseract instalado si procesará PDFs escaneados.
8. **PJUD scrape:** solo con consentimiento del estudio (ToS); preferir sidecar
   `npm run pjud:host` + CAPTCHA BYOK. Ver `docs/PJUD.md` y el aviso en LICENSE.
9. **Arranque automático:** `deploy/systemd`, `deploy/launchd` o
   `deploy/windows` tras validar el Host a mano.
10. **Respaldo restaurable:** al menos un `npm run web:backup` hacia medio
    externo cifrado y una prueba de `web:restore` en un entorno de ensayo.
11. **Evite `cp .env.example` + `npm start`** para el estudio: ese ejemplo deja
    demos/secretos de desarrollo y el boot de producción falla a propósito.
    Use `web:host` (Postgres embebido, secretos, schedulers). Si usa Postgres
    externo + `npm start`, defina `SESSION_SECRET` aleatorio fuerte (≥16, no
    placeholder), demos en `0` y `LEXOPEN_ALLOW_LOCAL_PRODUCTION_STORAGE=1`
    (o S3) para documentos.
12. **URLs privadas:** `OBSIDIAN_ALLOW_PRIVATE_URL=1` y
    `PJUD_SCRAPER_ALLOW_PRIVATE=1` son normales en loopback del Host. Si publica
    el servicio fuera de la máquina, revise que el sidecar Obsidian/PJUD no
    quede expuesto sin autenticación.

## OCR local para PDFs escaneados

El OCR es opcional. `pdf-inspector` detecta las páginas escaneadas y LexOpen usa el
binding nativo de `pdfdown-ocr`, que requiere únicamente Tesseract y renderiza las
páginas internamente:

```bash
# Debian/Ubuntu
sudo apt install tesseract-ocr tesseract-ocr-spa

# macOS con Homebrew (el Host busca /opt/homebrew/bin aunque no esté en PATH)
brew install tesseract tesseract-lang
```

En Windows instale Tesseract y Poppler: el binding OCR nativo actual no publica
binario Windows y LexOpen usa el fallback `pdftoppm`. Configure
`OCR_TESSERACT_BIN` y `OCR_PDFTOPPM_BIN` con sus rutas completas. Puede ajustar el
idioma con `OCR_LANGUAGE=spa+eng` y limitar el consumo con `OCR_MAX_PAGES` y
`OCR_TIMEOUT_MS`. Si faltan los binarios, el original se conserva y el documento
queda marcado como `Requiere OCR`.

## Acceso desde los clientes

Por defecto el Host solo escucha en `127.0.0.1`. Para LAN o Tailscale, configure
en el `.env` del directorio de datos (ejemplo con IP privada):

```dotenv
NEXT_PUBLIC_APP_URL=http://IP-DEL-HOST:3000
LEXOPEN_TRUSTED_ORIGINS=http://127.0.0.1:3000,http://IP-DEL-HOST:3000
LEXOPEN_BIND=0.0.0.0
HOSTNAME=0.0.0.0
```

Con una URL Tailscale no loopback (`http://pc-estudio.tailXXXX.ts.net:3000`)
como `NEXT_PUBLIC_APP_URL`, el Host ya enlaza `0.0.0.0` automáticamente.

Reinicie LexOpen y abra desde cada cliente la URL pública configurada.

Recuperación de admin (si pierde la contraseña): abra `/recovery` y pegue
`LEXOPEN_RECOVERY_TOKEN` desde el mismo `.env` del data dir. Un reset exitoso
**rota** ese token: copie el nuevo valor del `.env` (o regenerado por el Host)
antes del siguiente uso.

### Rate limit en Host

El login usa un store local (`$LEXOPEN_DATA_DIR/rate-limit.json`). Un único
proceso Host es el caso normal. Si ejecuta varias instancias contra el mismo
data dir, configure `REDIS_URL`, `RATE_LIMIT_REDIS_URL` o Upstash REST para
compartir el contador.

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
sudo mkdir -p /opt/lexopen /var/lib/lexopen /var/lib/lexopen-backups
sudo chown -R lexopen:lexopen /opt/lexopen /var/lib/lexopen /var/lib/lexopen-backups
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
- Para pasar de demo a producción: `npm run db:purge-demo -- --yes`, luego
  `LEXOPEN_BOOTSTRAP_TOKEN` y `/setup` (o el panel en Configuración).
  Vea el README («Empezar» / «Usuarios demo y pasar a producción»).
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
- Para activar el scheduler PJUD local, configure en el `.env` del directorio de datos:

  ```dotenv
  CRON_SECRET=<secreto-aleatorio>
  PJUD_SYNC_INTERVAL_MINUTES=240
  PJUD_SYNC_CONCURRENCY=5
  # Opcional: alertas de plazos (in-app; email si PLAZOS_ALERTAS_EMAIL=1)
  PLAZOS_ALERTAS_INTERVAL_MINUTES=60
  PLAZOS_ALERTAS_DAYS=3
  # PLAZOS_ALERTAS_EMAIL=1
  ```

  Los schedulers PJUD / digest / plazos los arranca el runtime del Host
  (`desktop/host-runtime.mjs`), también usado por Electron. `web:host` solo
  orquesta el proceso y los backups. LexOpen corre en **su host**; puede usar
  APIs externas (OJV, CAPTCHA, `PJUD_API_URL`).

  **Setup recomendado PJUD:** `npm run pjud:chromium` (una vez) → configure
  `CAPTCHA_SOLVER_*` → `npm run pjud:host` (sidecar `:8787`) → en otra terminal
  `npm run web:host` (o `npm run pjud:host -- --with-web`). El web necesita
  `PJUD_SCRAPER_URL=http://127.0.0.1:8787`, `PJUD_SCRAPER_ALLOW_PRIVATE=1` y la
  misma `PJUD_SCRAPER_KEY`. Si el sidecar no está corriendo, el Host cae a
  scrape in-process (`PJUD_PUBLIC_SCRAPE=1` + CAPTCHA) al sincronizar Mis Causas.
  Detalle en `docs/PJUD.md`. Si no hay ingest y
  `PJUD_ALLOW_DEMO=0`, no se inventan datos (importe CSV si hace falta).

Sin proveedor configurado, exporte el CSV desde la consulta oficial y use el
importador de movimientos de la ficha de la causa **o** el CSV de cartera en
`/causas/monitoreo`. El formato de movimientos es
`titulo,detalle,fecha,referencia,id,cuaderno,folio,etapa,tramite,receptor,documento`
(el encabezado corto `titulo,detalle,fecha,referencia,id` sigue siendo válido);
LexOpen clasifica las filas, fuerza `fuente=import` y omite reimportaciones con
la misma clave determinista. La ficha incluye enlaces para descargar la plantilla
exacta y exportar hasta 1.000 movimientos del timeline. La vista previa valida el
archivo antes de escribir en PostgreSQL.

#### Webhook de un proveedor PJUD

Los proveedores que entregan resultados de forma asíncrona pueden enviar un
webhook a:

```text
POST /api/integrations/pjud/webhook
```

Configure `PJUD_WEBHOOK_SECRET`. El request debe incluir:

```text
x-pjud-timestamp: <Unix timestamp en segundos>
x-pjud-signature: sha256=<HMAC-SHA256(PJUD_WEBHOOK_SECRET, timestamp + "." + cuerpo)>
```

El cuerpo mínimo identifica la causa y contiene movimientos:

```json
{
  "operationId": "provider-operation-id",
  "rit": "C-4521-2025",
  "tribunal": "1º Juzgado Civil de Santiago",
  "status": "ok",
  "movimientos": [
    {
      "id": "provider-movement-id",
      "titulo": "Resolución: proveído",
      "detalle": "Texto recibido del proveedor",
      "fecha": "2026-08-12",
      "referencia": "R-1",
      "cuaderno": "Principal",
      "folio": "3",
      "esReceptor": false
    }
  ]
}
```

La firma solo se acepta durante cinco minutos, el endpoint deduplica por ID
externo y no requiere sesión de usuario. El webhook no inventa una fuente PJUD:
requiere un proveedor autorizado, sus credenciales y el contrato de payload
correspondiente.

### Backups automáticos con rotación

El Host web puede crear respaldos locales periódicos sin depender de la nube.
Configure estas variables en el `.env` de `LEXOPEN_DATA_DIR`:

```dotenv
LEXOPEN_BACKUP_INTERVAL_MINUTES=360
LEXOPEN_BACKUP_DIR=/ruta/externa/lexopen-backups
LEXOPEN_BACKUP_KEEP=14
```

`LEXOPEN_BACKUP_INTERVAL_MINUTES=0` desactiva la función. Si
`LEXOPEN_BACKUP_DIR` queda vacío, LexOpen usa un directorio hermano de
`LEXOPEN_DATA_DIR` con sufijo `-backups`; nunca guarda los respaldos dentro de los
datos activos. La retención admite entre 1 y 365 respaldos.

Cada ejecución detiene brevemente Next.js y PostgreSQL embebido, copia el estado
de forma consistente, conserva los últimos respaldos válidos y vuelve a iniciar
el Host. Una ejecución en curso no se duplica gracias a un bloqueo del directorio
de backups. Si el reinicio posterior falla, revise los logs y no elimine el último
respaldo válido. Los respaldos contienen `.env`, PostgreSQL y documentos: deben
guardarse en un disco con acceso restringido y, para recuperación ante desastre,
copiarse además a un medio externo cifrado.

Los templates de `deploy/systemd`, `deploy/launchd` y `deploy/windows` ejecutan
`scripts/web-host.mjs`, por lo que esta configuración también funciona cuando el
Host se inicia como servicio del sistema. Para una ejecución manual de rotación,
mantenga el Host detenido y use:

```bash
npm run web:backup -- --rotate \
  --backup-dir /ruta/externa/lexopen-backups \
  --keep 14
```

El comando manual también valida que no exista `postmaster.pid`; no copie
`pgdata` mientras PostgreSQL esté activo.
