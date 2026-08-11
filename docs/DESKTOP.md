# LexOpen Desktop — PC principal + acceso remoto (Tailscale)

LexOpen Desktop empaqueta el estudio como aplicación instalable en **macOS** y **Windows**.  
La arquitectura es **un solo servidor local** (PC principal) y el resto de abogados/asistentes se conectan a esa instalación — no hay una base de datos por laptop.

```
┌─────────────────────────────────────────────┐
│  PC PRINCIPAL (servidor del estudio)        │
│  LexOpen Desktop · modo Host                │
│  ├─ Postgres embebido (datos del estudio)   │
│  ├─ Next.js en 0.0.0.0:PORT                 │
│  └─ Usuarios / roles / causas / docs        │
└──────────────────┬──────────────────────────┘
                   │ Tailscale (red privada)
        ┌──────────┴──────────┐
        ▼                     ▼
  Mac/Windows             Navegador
  modo Cliente            http://pc-estudio:3000
  (misma URL)             o *.ts.net
```

## Roles

| Rol | Qué hace |
| --- | --- |
| **Host** | Instala LexOpen Desktop en el PC que siempre queda encendido (o se enciende al abrir el estudio). Ahí se crean usuarios y vive la base de datos. |
| **Cliente** | En otros equipos: abre LexOpen Desktop en modo «Conectar a servidor» o un navegador con la URL Tailscale del Host. Sesión = login LexOpen (mismo usuario que en el Host). |

No se sincronizan copias locales: **siempre** se trabaja contra la instalación del PC principal.

## Requisitos

- **Host:** macOS 12+ o Windows 10/11, ~2 GB libres, Node no hace falta (va empaquetado).
- **Cliente:** solo red Tailscale al Host (o LAN si están en la misma oficina).
- **Tailscale:** cuenta del estudio; todos los PCs en el mismo tailnet. [tailscale.com](https://tailscale.com)

## Flujo de instalación (estudio)

1. En el **PC principal**, instalar LexOpen Desktop y elegir **«Este PC es el servidor del estudio»**.
2. El Host abre la configuración inicial para crear el primer administrador con una contraseña propia. Cargar datos demo es opcional y solo debe usarse para una evaluación.
3. Iniciar sesión y crear usuarios reales en LexOpen (People / configuración) — roles admin, abogado, asistente, cliente.
4. Instalar **Tailscale** en el Host y en cada laptop. Anotar el hostname MagicDNS, p. ej. `pc-estudio.tailXXXX.ts.net`.
5. En cada otro equipo: instalar LexOpen Desktop → **«Conectar a un servidor»** → URL  
   `http://pc-estudio.tailXXXX.ts.net:3000`  
   (o abrir esa URL en el navegador).
6. Cada persona inicia sesión con **su** usuario LexOpen.

### Tailscale Serve (opcional, HTTPS)

En el Host, con LexOpen corriendo en el puerto 3000:

```bash
tailscale serve --bg 3000
```

La URL HTTPS del tailnet aparece con `tailscale serve status`.  
Use esa URL en los clientes. El CSRF de LexOpen acepta el `Host` de la petición; si usa HTTP y HTTPS a la vez, configure `LEXOPEN_TRUSTED_ORIGINS`.

## Actualizaciones (repo en constante cambio)

**Garantía:** publicar o instalar una versión nueva **no reescribe** configuración ni datos del usuario. Solo se reemplaza el binario de la app.

| Se actualiza (instalador) | Se preserva (fuera del .app / Program Files) |
| --- | --- |
| Código Next/Electron | `desktop-config.json` (modo Host/Cliente, URL Tailscale) |
| Migraciones Prisma (al arrancar) | `.env` (secretos, LLM, S3, Google…) — merge: solo claves *faltantes* |
| | `pgdata/` (Postgres embebido) |
| | `storage/` (documentos locales) |
| | `obsidian-vault/`, `.seeded`, `app-state.json` |

### Reconocimiento inmediato

1. Al abrir el Host tras instalar, se escribe `app-state.json` con la nueva versión **antes** de migrar.
2. `/api/health` expone `version` + `updateRecognized` con `Cache-Control: no-store`.
3. Clientes Desktop consultan el health cada 15s; si el Host cambió de versión, **recargan al momento** (`?lexopen_v=`).
4. Quien use solo el navegador ve la UI nueva en el siguiente refresh (sin reinstalar).

Flujo operativo:

1. Publicar release GitHub (`.dmg` / `.exe`) con `npm run desktop:dist`.
2. En el **Host**: instalar encima (NSIS/macOS no tocan `%APPDATA%` / Application Support).
3. Arrancar → log `Actualización reconocida: x → y` → `prisma migrate deploy` → listo.
4. Clientes: si usan Desktop, recarga automática; si usan navegador, F5.

En una instalación empaquetada, LexOpen comprueba GitHub Releases, no descarga
silenciosamente y pide confirmación antes de descargar. Tras la descarga, solicita
confirmación para cerrar ordenadamente el Host e instalar la actualización. La
carpeta de datos se conserva; releases sin firma o sin metadata válida deben
actualizarse manualmente.

Datos del Host:

| SO | Ruta típica |
| --- | --- |
| macOS | `~/Library/Application Support/LexOpen/` |
| Windows | `%APPDATA%\LexOpen\` |

> El instalador **nunca** debe apuntar `STORAGE_PATH` ni Postgres al directorio de la aplicación: van bajo esa carpeta de datos.

## Desarrollo (desde el repo)

```bash
# Dependencias del shell desktop
npm install
npm --prefix desktop install

# Host en desarrollo (Postgres embebido + next dev o start)
npm run desktop:host

# Shell Electron (tras tener el host arriba, o el propio Electron lo arranca en modo host)
npm run desktop:dev
```

Build de instaladores (en la máquina objetivo o CI):

```bash
npm run build
LEXOPEN_STANDALONE=1 npm run build   # genera .next/standalone
npm run desktop:dist                 # electron-builder → .dmg / .exe
npm run desktop:dist:linux           # electron-builder → .AppImage
```

Para releases reproducibles, cree un tag `vX.Y.Z` que coincida con las versiones
de `package.json` y `desktop/package.json`. El workflow
`.github/workflows/desktop-release.yml` ejecuta calidad, compila Linux/macOS/Windows
y publica los artefactos en GitHub Releases.

### Firma de instaladores

Electron Builder firma automáticamente cuando el workflow recibe estos secrets:

- `CSC_LINK`: certificado Windows (`.p12`) o certificado de firma macOS.
- `CSC_KEY_PASSWORD`: contraseña del certificado.
- `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`: notarización macOS.

Sin esos secrets el workflow genera artefactos válidos pero sin firma. La firma y
notarización son necesarias para evitar advertencias de SmartScreen y Gatekeeper.

## Seguridad

- Tailscale evita exponer LexOpen a Internet abierto; no use port-forwarding al router.
- Cambie `SESSION_SECRET` en el Host (asistente o `.env` en el directorio de datos).
- Desactive `LEXOPEN_DEMO_SWITCHER` y seeds demo en uso real.
- Backups: desde el menú **LexOpen → Crear respaldo…**, detenga brevemente el Host
  y genere una copia consistente de `pgdata/`, documentos, vault y configuración.
  El respaldo contiene secretos (`.env`): guárdelo en un disco cifrado.
- Restauración: use **LexOpen → Restaurar respaldo…**. La aplicación conserva el
  estado anterior temporalmente y lo revierte si el Host restaurado no puede arrancar.

## Limitaciones actuales (v0.1 desktop)

- Un solo Host activo (no multi-maestro).
- La firma/notarización depende de los certificados del estudio y secrets del workflow.
- Durante desarrollo (`electron .`) no se consulta el canal de actualizaciones.
