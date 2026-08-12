# LexOpen como aplicación web en un Host local

Esta modalidad no requiere instalar Electron en los equipos cliente. Un único PC
ejecuta LexOpen y PostgreSQL; el resto accede desde Safari, Chrome o Firefox.

## Requisitos del Host

- Node.js 22.x.
- PostgreSQL 16 o compatible.
- Tailscale si habrá acceso desde otros equipos o fuera de la LAN.
- Un directorio local persistente para documentos.

El Host puede ser Windows, macOS o Linux. Los clientes solo necesitan navegador y
acceso de red al Host.

## Instalación

Desde el repositorio:

```bash
git clone https://github.com/gabrielperezibacache/lexopen.git
cd lexopen
npm ci
cp .env.example .env
```

Cree una base vacía llamada `lexopen` y configure `.env`:

```dotenv
DATABASE_URL=postgresql://lexopen:lexopen@127.0.0.1:5432/lexopen
SESSION_SECRET=<secreto-aleatorio-de-al-menos-16-caracteres>
LEXOPEN_BOOTSTRAP_TOKEN=<token-aleatorio-hexadecimal>
STORAGE_PATH=/ruta/persistente/lexopen/storage
LEXOPEN_ALLOW_LOCAL_PRODUCTION_STORAGE=1
LEXOPEN_REQUIRE_PERSISTENT_STORAGE=1
LEXOPEN_DEMO_SWITCHER=0
HERMES_ALLOW_DEMO=0
```

Genere secretos desde macOS/Linux con:

```bash
openssl rand -hex 32
```

No exponga `LEXOPEN_BOOTSTRAP_TOKEN`: solo se usa para crear el primer admin.

Prepare el schema y compile la aplicación:

```bash
npm run db:migrate
npm run build
npm run start
```

`npm run start` escucha en `0.0.0.0` y usa `PORT` (por defecto `3000`).

## Primera configuración

En el Host abra:

```text
http://127.0.0.1:3000/setup?token=<LEXOPEN_BOOTSTRAP_TOKEN>
```

Cree el administrador, inicie sesión y cree los usuarios del estudio. Después de
configurar la instalación, el token deja de ser válido.

Compruebe el estado:

```bash
curl http://127.0.0.1:3000/api/health
```

Debe mostrar `db: "up"`, `storageReady: true` y `needsSetup: false`.

## Acceso desde los clientes

Instale Tailscale en el Host y en cada equipo cliente. Con todos los equipos en el
mismo tailnet:

```bash
tailscale serve --bg 3000
tailscale serve status
```

Use en los clientes la URL HTTPS mostrada por `tailscale serve status`. Configure
esa URL exacta en `NEXT_PUBLIC_APP_URL` y `LEXOPEN_TRUSTED_ORIGINS`, reinicie
LexOpen y acceda desde el navegador.

No use port-forwarding del router. Para una LAN aislada también puede usar
`http://hostname-del-host:3000`, pero HTTPS/Tailscale es preferible.

## Operación y respaldos

- Mantenga el Host encendido y con permisos de escritura sobre `STORAGE_PATH`.
- No ejecute `npm run db:seed`, `npm run setup` ni `npm run db:reset` con datos reales.
- El menú de backup pertenece a Electron; en modo web haga un `pg_dump` y copie
  `STORAGE_PATH` con el servicio detenido, preferentemente a un disco cifrado.
- Verifique periódicamente `/api/health`, espacio libre y backups restaurables.
- Para PJUD, `CRON_SECRET` permite un scheduler externo; Render no programa este
  sync cuando se usa un Host local.
