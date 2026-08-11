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
2. Completar el asistente (puerto, URL Tailscale opcional, opcionalmente cargar datos demo). El `SESSION_SECRET` se genera solo en la carpeta de datos.
3. Crear usuarios reales en LexOpen (People / configuración) — roles admin, abogado, asistente, cliente.
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

Build de instaladores (en la máquina objetivo o CI con runners Mac/Windows):

```bash
npm run build
LEXOPEN_STANDALONE=1 npm run build   # genera .next/standalone
npm run desktop:dist                 # electron-builder → .dmg / .exe
```

## Seguridad

- Tailscale evita exponer LexOpen a Internet abierto; no use port-forwarding al router.
- Cambie `SESSION_SECRET` en el Host (asistente o `.env` en el directorio de datos).
- Desactive `LEXOPEN_DEMO_SWITCHER` y seeds demo en uso real.
- Backups: copie el directorio de datos del Host (o haga dump SQL) a un disco cifrado.

## Limitaciones actuales (v0.1 desktop)

- Un solo Host activo (no multi-maestro).
- Los instaladores firmados/notarizados (Apple/Windows SmartScreen) requieren certificados del estudio; el build genera artefactos sin firma.
- La actualización es **manual** (instalar el nuevo `.dmg`/`.exe` encima). No hay `electron-updater` todavía; al arrancar se reconoce la versión y se migran datos sin pisar config.
- En desarrollo (`npm run desktop:host`) se requiere Node 22 en el PATH; el instalador empaquetado lleva el runtime de Electron.
- El secreto de sesión no se pide en el asistente: se genera una vez en `.env` de la carpeta de datos.
