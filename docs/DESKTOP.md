# LexOpen Desktop — PC principal + acceso remoto (Tailscale)

La instalación soportada es **clonar este repositorio** (como en el
[README](../README.md#-empezar-guía-sencilla)), no un `.dmg` / `.exe`.
LexOpen Desktop es el shell Electron opcional sobre el mismo Host local:
un solo PC guarda los datos y el resto se conecta por Tailscale o el navegador.

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
| **Host** | En el PC que queda encendido: `git clone` + `npm ci` + `npm run web:host` o `npm run desktop:dev`. Ahí se crean usuarios y vive la base de datos. |
| **Cliente** | En otros equipos: navegador con la URL Tailscale/LAN del Host, o `npm run desktop:dev` en modo «Conectar a servidor». Sesión = login LexOpen. |

No se sincronizan copias locales: **siempre** se trabaja contra la instalación del PC principal.

## Requisitos

- **Host:** macOS 12+, Windows 10/11 o Linux; Node.js 22 (ver [`.nvmrc`](../.nvmrc)); Git; ~2 GB libres.
- **Cliente:** red Tailscale al Host (o LAN si están en la misma oficina) y un navegador. Electron en los clientes es opcional.
- **Tailscale:** cuenta del estudio; todos los PCs en el mismo tailnet. [tailscale.com](https://tailscale.com)

## Flujo de instalación (estudio)

1. En el **PC principal**, clone el repo y arranque el Host:

   ```bash
   git clone https://github.com/gabrielperezibacache/lexopen.git
   cd lexopen
   npm ci
   npm run desktop:install
   npm run desktop:dev
   ```

   O, sin Electron, el camino recomendado del README: `npm run web:host` y abra
   `http://127.0.0.1:3000` en el navegador.
2. En Desktop, elija **«Este PC es el servidor del estudio»**. El Host abre `/setup`
   para crear el primer administrador. Cargar datos demo es opcional. El
   `SESSION_SECRET` se genera solo en la carpeta de datos.
3. Iniciar sesión y crear usuarios reales en LexOpen (People / configuración) — roles admin, abogado, asistente, cliente.
   Cada usuario puede cambiar su contraseña desde **Mi cuenta**.
4. Instalar **Tailscale** en el Host y en cada laptop. Anotar el hostname MagicDNS, p. ej. `pc-estudio.tailXXXX.ts.net`.
5. En cada otro equipo: abra en el navegador  
   `http://pc-estudio.tailXXXX.ts.net:3000`  
   (o, si usa el shell Electron, `npm run desktop:dev` → **«Conectar a un servidor»**).
6. Cada persona inicia sesión con **su** usuario LexOpen.

### Tailscale Serve (opcional, HTTPS)

En el Host, con LexOpen corriendo en el puerto 3000:

```bash
tailscale serve --bg 3000
```

La URL HTTPS del tailnet aparece con `tailscale serve status`.  
Use esa URL en los clientes. El CSRF de LexOpen acepta el `Host` de la petición; si usa HTTP y HTTPS a la vez, configure `LEXOPEN_TRUSTED_ORIGINS`.

## Actualizaciones (repo en constante cambio)

**Garantía:** un `git pull` **no reescribe** configuración ni datos del usuario.
Solo cambia el código del clon. Los datos viven fuera del repo.

| Se actualiza (`git pull` + `npm ci`) | Se preserva (`LEXOPEN_DATA_DIR` / Application Support / %APPDATA%) |
| --- | --- |
| Código Next/Electron del clon | `desktop-config.json` (modo Host/Cliente, URL Tailscale) |
| Migraciones Prisma (al arrancar) | `.env` (secretos, LLM, S3, Google…) — merge: solo claves *faltantes* |
| | `pgdata/` (Postgres embebido) |
| | `storage/` (documentos locales) |
| | `obsidian-vault/`, `.seeded`, `app-state.json` |

### Reconocimiento inmediato

1. Al abrir el Host tras un `git pull`, se escribe `app-state.json` con la nueva versión **antes** de migrar.
2. `/api/health` expone `version` + `updateRecognized` con `Cache-Control: no-store`.
3. Clientes Desktop consultan el health cada 15s; si el Host cambió de versión, **recargan al momento** (`?lexopen_v=`).
4. Quien use solo el navegador ve la UI nueva en el siguiente refresh.

Flujo operativo:

1. En el **Host**: `git pull origin main && npm ci`.
2. Arrancar de nuevo (`npm run web:host` o `npm run desktop:dev`) → log `Actualización reconocida: x → y` → `prisma migrate deploy` → listo.
3. Clientes: si usan Desktop, recarga automática; si usan navegador, F5.

Datos del Host:

| SO | Ruta típica |
| --- | --- |
| macOS | `~/Library/Application Support/LexOpen/` |
| Windows | `%APPDATA%\LexOpen\` |

> `STORAGE_PATH` y Postgres **nunca** deben apuntar al clon del repo (se mezclarían con `git pull`). Van bajo esa carpeta de datos o `LEXOPEN_DATA_DIR`.

## Desarrollo (desde el repo)

```bash
git clone https://github.com/gabrielperezibacache/lexopen.git
cd lexopen
npm install
npm --prefix desktop install

# Host (Postgres embebido + next)
npm run desktop:host

# Shell Electron (tras tener el host arriba, o el propio Electron lo arranca en modo host)
npm run desktop:dev
```

El Host Desktop (`desktop/host-runtime.mjs`) puede programar sync PJUD, digest y
alertas de plazos contra su propio endpoint cuando el `.env` del directorio de
datos define `CRON_SECRET` y los intervalos (`PJUD_*_INTERVAL_MINUTES`,
`PLAZOS_ALERTAS_INTERVAL_MINUTES`). Detalle en [`WEB-HOST.md`](./WEB-HOST.md).

El canal soportado de distribución es el clon Git. No se publican instaladores
`.dmg` / `.exe` / `.AppImage`; los binarios de Releases anteriores fueron
retirados para no confundirlos con el flujo de instalación.

## Seguridad

- Tailscale evita exponer LexOpen a Internet abierto; no use port-forwarding al router.
- Cambie `SESSION_SECRET` en el Host (asistente o `.env` en el directorio de datos).
- Desactive `LEXOPEN_DEMO_SWITCHER` y seeds demo en uso real.
- Backups: desde el menú **LexOpen → Crear respaldo…**, detenga brevemente el Host
  y genere una copia consistente de `pgdata/`, documentos, vault y configuración.
  El respaldo contiene secretos (`.env`): guárdelo en un disco cifrado.
- Restauración: use **LexOpen → Restaurar respaldo…**. La aplicación conserva el
  estado anterior temporalmente y lo revierte si el Host restaurado no puede arrancar.
- Recuperación: use **LexOpen → Recuperar contraseña admin…** solo con acceso físico
  al Host. El token local no debe compartirse; al restablecer se invalidan las sesiones.

## Limitaciones actuales (v0.1 desktop)

- Un solo Host activo (no multi-maestro).
- La instalación soportada es el clon Git + Node 22; no se distribuye un instalador.
- Durante `npm run desktop:dev` no se consulta el canal de actualizaciones empaquetado.
