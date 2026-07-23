# LexOpen

**LexOpen** es un **clon open-source de [Thomson Reuters HighQ](https://legal.thomsonreuters.com/en/products/highq)** para estudios jurídicos, con capa nativa para **Chile** (causas RIT/RUC, plazos procesales, jurisprudencia).

> No afiliado a Thomson Reuters. HighQ es marca de terceros.

## Módulos HighQ cubiertos

| Módulo HighQ | En LexOpen |
| --- | --- |
| **Sites / Workspaces** | Matters, VDR, knowledge, client portal, projects |
| **Files / Virtual Data Room** | Carpetas, archivos, versionado, comentarios, tags |
| **iSheets** | Tablas estructuradas con columnas tipadas y filas editables |
| **Tasks & Calendar** | Tasks por site + calendario unificado con plazos Chile |
| **Wiki / Blog** | Páginas Markdown por site + blog posts |
| **Q&A** | Hilos cliente/equipo con respuesta oficial |
| **Workflows** | Aprobaciones multi-paso (escritos, portal) |
| **People / Groups** | Usuarios, roles de site, grupos |
| **Messages & Notifications** | Mensajería interna + alertas |
| **Client portal** | Sites `isClientVisible` + docs etiquetados |
| **Search** | Índice unificado sites/causas/files/tasks/wiki/jurisprudencia |
| **Activity stream** | Feed por site y global |
| **APIs** | REST bajo `/api/*` |

### Capa Chile + integraciones
- Causas judiciales (RIT/RUC, tribunal, etapa, partes)
- **Facturación y contabilidad**: horas, gastos, tarifas, boletas/facturas (IVA/retención), pagos, cuenta corriente / provisión de fondos
- Jurisprudencia (CS, Apelaciones, TC — corpus demo)
- **Obsidian** (export vault Markdown)
- **Hermes Agent** (API OpenAI-compatible + demo)
- **Google Workspace** (OAuth Drive / Calendar / Gmail)

## Stack

Next.js 15 · TypeScript · Tailwind 4 · Prisma 5 · SQLite (Postgres-ready) · AGPL-3.0

## Inicio rápido

```bash
cp .env.example .env
npm install
npm run setup    # db push + seed HighQ/Chile
npm run dev
```

Abra http://localhost:3000 → **Entrar al estudio**.

### Usuarios demo (password `lexopen`)
| Email | Rol |
| --- | --- |
| `socio@estudio.cl` | admin / socia |
| `abogado@estudio.cl` | abogado |
| `asistente@estudio.cl` | paralegal |
| `cliente@andes.cl` | cliente (portal) |

Cambie de usuario desde el switcher inferior del sidebar.

### Sites demo
- Matter Andes · Cobro C-4521-2025 (Files, Wiki, iSheet hitos, Q&A, workflow)
- Matter Muñoz · Tutela O-1189-2025
- VDR Due Diligence Pacífico + iSheet issues log
- Knowledge · Jurisprudencia & Playbooks
- Portal Cliente · Constructora Andes

## API (muestra)

```bash
# Sites
curl localhost:3000/api/sites

# Data room
curl -X POST localhost:3000/api/sites/<id>/files \
  -H 'content-type: application/json' \
  -d '{"action":"create-file","name":"Memo.md","contenido":"# Hola"}'

# iSheets
curl localhost:3000/api/sites/<id>/isheets

# Search
curl 'localhost:3000/api/search?q=tutela'

# Obsidian sync
curl -X POST localhost:3000/api/integrations/obsidian \
  -H 'content-type: application/json' -d '{"action":"sync-all"}'
```

## Render

Use `render.yaml` (Blueprint). En producción prefiera Postgres managed; el filesystem es efímero.

## Licencia

AGPL-3.0-or-later — ver `LICENSE`.
