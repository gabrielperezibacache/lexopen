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
2. Completar el asistente (puerto, secreto de sesión, opcionalmente cargar datos demo).
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

1. Publicar un **release** GitHub con instaladores Mac/Windows (CI o build local con `npm run desktop:dist`).
2. En el **Host**: instalar la nueva versión (el directorio de datos de Postgres **se conserva**).
3. Al arrancar, el Host ejecuta `prisma migrate deploy` automáticamente.
4. Los **clientes** solo necesitan actualizar si cambió la app de escritorio; si solo usan el navegador, no actualizan nada.

Datos del Host (no borrar al actualizar):

| SO | Ruta típica |
| --- | --- |
| macOS | `~/Library/Application Support/LexOpen/` |
| Windows | `%APPDATA%\LexOpen\` |

Ahí viven Postgres embebido, `.env` del host y la preferencia host/cliente.

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
- Actualización automática (`electron-updater`) está preparada vía releases GitHub; hay que publicar tags `v*`.
