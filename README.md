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
- **Minutas de handoff**: flujo guiado tras audiencia, reunión o llamada (resumen, acuerdos, próximos pasos → tasks/plazos, aviso al equipo). Validación de tipo/plazos, fechas locales (Chile-safe) y creación atómica.
- **Google Drive por causa**: vincular o crear una carpeta determinada; distingue carpetas reales vs stub/demo; documentos y minutas solo se suben a carpetas reales con OAuth.
- **Facturación y contabilidad**: horas, gastos, tarifas, boletas/facturas (IVA/retención), pagos, cuenta corriente / provisión de fondos
- Jurisprudencia (CS, Apelaciones, TC — corpus demo)
- **Obsidian**: export Markdown por causa (omite confidenciales). Prefiere `OBSIDIAN_REST_URL`; en producción sin REST escribe a object storage (el FS de Render es efímero).
- **Hermes Agent**: API OpenAI-compatible con historial `AgentChat`, contexto ACL y fail-closed en prod (`HERMES_ALLOW_DEMO=0`). Demo solo si se habilita explícitamente y siempre etiquetada.
- **Google Workspace** (OAuth Drive / Calendar / Gmail)

## Stack

Next.js 15 · TypeScript · Tailwind 4 · Prisma 5 · Postgres · AGPL-3.0

## Inicio rápido

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed  # datos demo HighQ/Chile
npm run dev
```

LexOpen requiere Postgres en `DATABASE_URL`. En producción ejecute `npm run db:migrate`
al iniciar o desplegar; no ejecute seed automáticamente. Use `npm run db:seed` solo para
cargar datos demo.

Abra http://localhost:3000/login e ingrese con un usuario demo.

Variables relevantes:
- `SESSION_SECRET`: obligatorio en producción para firmar sesiones y proteger tokens OAuth.
- `HERMES_ALLOW_DEMO=1`: habilita respuestas demo cuando Hermes Agent no está disponible.
- `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT`, `S3_REGION`: opcionales para almacenar documentos fuera del filesystem local.

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

# Minuta post-audiencia
curl -X POST localhost:3000/api/minutas \
  -H 'content-type: application/json' \
  -d '{"causaId":"<id>","tipo":"audiencia","titulo":"Audiencia de prueba","resumenEjecutivo":"…","acciones":[{"descripcion":"Presentar lista de testigos","crearPlazo":true,"fechaLimite":"2026-08-01"}]}'

# Vincular carpeta Drive a una causa
curl -X POST localhost:3000/api/integrations/google \
  -H 'content-type: application/json' \
  -d '{"action":"link-causa-folder","causaId":"<id>","folderRef":"https://drive.google.com/drive/folders/…"}'
```

## Render

Use `render.yaml` (Blueprint). En producción use Postgres managed, `npm run db:migrate`
en deploy y S3/objeto compatible para documentos si necesita persistencia; el filesystem
local es efímero.

## Licencia

AGPL-3.0-or-later — ver `LICENSE`.
