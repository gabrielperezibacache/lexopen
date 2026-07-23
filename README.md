# LexOpen

**LexOpen** es un clon open-source de [Thomson Reuters HighQ](https://legal.thomsonreuters.com/en/products/highq) orientado a **estudios jurídicos en Chile**: gestión de causas judiciales, plazos, documentos, portal de cliente, consulta de jurisprudencia e integraciones con **Obsidian**, **Hermes Agent** y **Google Workspace**.

> No está afiliado a Thomson Reuters. HighQ es marca de terceros; LexOpen es una implementación independiente y libre.

## Características

| Módulo | Qué hace |
| --- | --- |
| **Causas** | RIT/RUC, tribunal, materia, etapa procesal, partes, carátula |
| **Plazos** | Procesales, audiencias, internos — sync a Google Calendar |
| **Documentos** | Data room colaborativo, versionado simple, rutas Obsidian/Drive |
| **Jurisprudencia** | Búsqueda por rol, tribunal, materia y doctrina (corpus demo Chile) |
| **Portal cliente** | Vista HighQ-like del estado de causas y documentos compartidos |
| **Obsidian** | Export Markdown por causa (`Index.md`, Notas, Documentos) |
| **Hermes Agent** | Cliente OpenAI-compatible + modo demo con aprobación humana |
| **Google Workspace** | OAuth Drive / Calendar / Gmail |

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS 4
- Prisma 5 + SQLite (local / demo) — listo para Postgres en producción
- Render Blueprint (`render.yaml`)

## Inicio rápido

```bash
cp .env.example .env
npm install
npm run setup    # prisma db push + seed Chile
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) → **Entrar al estudio**.

### Usuarios demo (seed)

- `socio@estudio.cl` — María Paz Contreras (admin)
- `abogado@estudio.cl` — Andrés Valenzuela
- `asistente@estudio.cl` — Camila Rojas

## Integraciones

### Obsidian

```bash
# Desde la UI: Integraciones → Sincronizar vault
# O por API:
curl -X POST http://localhost:3000/api/integrations/obsidian \
  -H 'content-type: application/json' \
  -d '{"action":"sync-all"}'
```

Genera `./obsidian-vault/LexOpen/Causas/<RIT>/…`. Ábralo como vault en Obsidian. Opcionalmente use [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) con `OBSIDIAN_REST_URL` / `OBSIDIAN_REST_API_KEY`.

### Hermes Agent

Configure el [API server](https://hermes-agent.nousresearch.com/docs/developer-guide/programmatic-integration) de Hermes:

```env
HERMES_API_URL=http://localhost:8642/v1
HERMES_API_KEY=
```

Si Hermes no está disponible, LexOpen responde en **modo demo** y registra la actividad con flag de aprobación humana.

### Google Workspace

1. Cree credenciales OAuth en Google Cloud (tipo Web).
2. Redirect URI: `http://localhost:3000/api/integrations/google/callback`
3. Configure:

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/integrations/google/callback
```

4. En **Integraciones → Conectar Google**.

## Despliegue en Render

```bash
# Con Blueprint
# Dashboard → New → Blueprint → seleccione este repo (render.yaml)
```

Bind a `0.0.0.0:$PORT` (ya configurado en `npm start`). Para producción real use Postgres managed y un disco persistente (SQLite en filesystem efímero se pierde al redeploy).

## Estructura

```
src/app/(app)/          # UI autenticada del estudio
src/app/api/            # REST API
src/lib/integrations/   # Obsidian, Hermes, Google
prisma/                 # Schema + seed Chile
```

## Licencia

AGPL-3.0-or-later — ver `LICENSE`.
