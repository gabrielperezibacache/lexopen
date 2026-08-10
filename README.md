<p align="center">
  <img src="docs/assets/lexopen-logo.svg" width="96" alt="LexOpen logo"/>
</p>

<h1 align="center">LexOpen</h1>

<p align="center">
  <strong>Plataforma open-source para la operación diaria del estudio jurídico</strong><br/>
  Organiza causas, clientes, plazos, documentos, facturación y colaboración —
  con herramientas pensadas para la práctica en <strong>Chile</strong> y asistencia IA bajo control del abogado.
</p>

<p align="center">
  <a href="https://github.com/gabrielperezibacache/lexopen/blob/main/LICENSE"><img alt="License AGPL-3.0" src="https://img.shields.io/badge/license-AGPL--3.0-1f6f78?style=for-the-badge"/></a>
  <a href="https://nextjs.org/"><img alt="Next.js 15" src="https://img.shields.io/badge/Next.js-15-0c1c24?style=for-the-badge&logo=nextdotjs"/></a>
  <a href="https://www.postgresql.org/"><img alt="Postgres" src="https://img.shields.io/badge/Postgres-16-336791?style=for-the-badge&logo=postgresql&logoColor=white"/></a>
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white"/></a>
  <a href="#despliegue-en-render"><img alt="Deploy on Render" src="https://img.shields.io/badge/Deploy-Render-46E3B7?style=for-the-badge&logo=render&logoColor=0c1c24"/></a>
</p>

<p align="center">
  <a href="#qué-aporta-al-estudio">Qué aporta</a> ·
  <a href="#qué-hace-lexopen">Funciones</a> ·
  <a href="#asistente-ia">Asistente IA</a> ·
  <a href="#inicio-rápido">Inicio rápido</a> ·
  <a href="#contribuir">Contribuir</a>
</p>

---

<p align="center">
  <img src="docs/assets/lexopen-hero.jpg" alt="LexOpen — Legal workspaces for Chile" width="100%"/>
</p>

<p align="center">
  <img src="docs/assets/lexopen-banner.svg" alt="Banner LexOpen" width="100%"/>
</p>

---

## Qué aporta al estudio

LexOpen concentra en una sola plataforma lo que hoy suele repartirse entre planillas, WhatsApp, carpetas y herramientas caras o desconectadas. Está pensado para **abogados, paralegales y socios** que necesitan trazabilidad procesal, handoff limpio entre colegas y una relación ordenada con el cliente — sin vendor lock-in y con código auditable (AGPL-3.0).

| Situación en el estudio | Cómo ayuda LexOpen |
| --- | --- |
| El expediente vive en drives y chats dispersos | **Espacios de trabajo** con archivos, wiki, tareas, Q&A y flujos de aprobación |
| Plazos fatales se pierden entre agendas | **Plazos procesales** (hábiles/corridos), calendario y sync a Google Calendar |
| Un abogado entra a una causa “a medias” | **Minutas de handoff** post-audiencia / reunión / llamada → tareas y plazos |
| El cliente pide estado y nadie tiene el hilo | **CRM**: cliente → causas → trámites → documentos + portal cliente |
| La facturación no habla con el matter | **Horas, gastos, boletas/facturas, UF y cuenta corriente** ligados a la causa |
| La IA genérica inventa fuera del expediente | **Acciones IA** con contexto de causa/cliente y revisión humana |

```mermaid
flowchart LR
  subgraph Estudio
    A[Abogados] --> B[LexOpen]
    C[Paralegales] --> B
  end
  B --> D[(Postgres)]
  B --> E[Documentos / S3]
  B --> F[IA OpenAI-compatible]
  B --> G[Google Workspace]
  B --> H[Obsidian]
  I[Cliente] --> J[Portal]
  J --> B
```

---

## Qué hace LexOpen

<p align="center">
  <img src="docs/assets/modules.svg" alt="Mapa de módulos LexOpen" width="100%"/>
</p>

### Operación y colaboración

| Capacidad | Para qué sirve en la práctica |
| --- | --- |
| **Espacios (matters)** | Agrupa una causa o proyecto: equipo, archivos, wiki, tareas y actividad |
| **Data room / archivos** | Comparte y versiona documentos con comentarios y etiquetas |
| **iSheets** | Tablas tipadas (hitos, issues, checklists) editables en equipo |
| **Tareas y calendario** | Asigna trabajo y ve plazos del estudio en un solo lugar |
| **Wiki y playbooks** | Documenta criterios internos; borrador asistido por IA |
| **Q&A** | Canal formal cliente ↔ equipo con respuesta oficial |
| **Flujos de aprobación** | Revisa escritos u otras piezas antes de presentar o enviar |
| **Personas y roles** | Controla quién ve qué (estudio vs portal cliente) |
| **Mensajes y notificaciones** | Coordinación interna y alertas de plazos / actividad |
| **Portal cliente** | Entrega visibilidad controlada sin abrir el back-office |
| **Búsqueda unificada** | Encuentra causas, docs, tareas, wiki, clientes y trámites |
| **API REST** | Integra LexOpen con otros sistemas del estudio |

### Litigio y práctica en Chile

- **Causas** — RIT/RUC, tribunal, materia, etapa, partes y chequeo de conflictos de interés  
- **Minutas de handoff** — wizard tras audiencia, reunión o llamada; genera tareas y plazos  
- **Plazos procesales** — cómputo hábil/corrido, fatales, recordatorios  
- **CRM de clientes** — ficha, causas, trámites pendientes/hechos, carpeta documental  
- **Documentos** — vinculados a causa o cliente; Google Drive real cuando hay OAuth  
- **Jurisprudencia** — consulta de corpus (CS / Apelaciones / TC) + brief asistido  
- **Facturación** — horas, gastos, tarifas, boletas/facturas (IVA/retención), UF, pagos, cuenta corriente / provisión  
- **Asistente IA** — acciones puntuales sobre el expediente (no un chat genérico suelto)  
- **Integraciones** — Obsidian, Google Workspace, Hermes u otro endpoint Chat Completions  

<p align="center">
  <img src="docs/assets/architecture.svg" alt="Arquitectura LexOpen" width="100%"/>
</p>

---

## Recorrido típico

| Módulo | Qué resuelve para el abogado |
| --- | --- |
| **Dashboard** | Ve causas activas, plazos y trámites pendientes al empezar el día |
| **Clientes** | Abre la carpeta del cliente: causas, trámites y chat con contexto |
| **Causas** | Trabaja RIT, partes, minutas, trámites, Drive y resúmenes IA |
| **Espacios** | Coordina el matter (archivos, wiki, Q&A, flujos) con el equipo |
| **Facturación** | Emite boleta/factura con glosa profesional asistida |
| **Configuración** | Elige el proveedor LLM y políticas del estudio |

---

## Asistente IA

LexOpen ofrece un **catálogo de acciones** con contexto del expediente. El abogado mantiene el control: borradores y sugerencias requieren revisión humana.

| Acción | Dónde | Aporte |
| --- | --- | --- |
| `causa.resumen` | Ficha de causa | Resumen procesal y próximos pasos |
| `causa.sugerir_tramites` | Causa / trámites | Checklist de pendientes |
| `causa.extraer` | Alta de causa | Autocompleta RIT, tribunal, partes… |
| `minuta.borrador` | Wizard de minuta | Prefills hechos, acuerdos y acciones |
| `documento.resumir` / `clasificar` | Documentos | Memo ejecutivo / tipo sugerido |
| `plazo.sugerir` | Plazos | Propone cómputo y fatales prudentes |
| `jurisprudencia.brief` | Jurisprudencia | Brief aplicable a la consulta |
| `factura.glosa` | Facturación | Glosa profesional chilena |
| `mensaje.borrador` | Mensajes | Asunto y cuerpo listos para editar |
| `wiki.borrador` | Wiki del espacio | Playbook Markdown accionable |

```bash
# Listar acciones
curl localhost:3000/api/ai/actions

# Ejecutar (sesión del estudio + same-origin)
curl -X POST localhost:3000/api/ai/actions \
  -H 'content-type: application/json' \
  -d '{"action":"causa.resumen","causaId":"<id>"}'
```

Configure el proveedor en **Configuración** o vía env:

```env
LLM_API_URL=https://api.openai.com/v1
LLM_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini
LLM_ALLOW_DEMO=1   # respuestas demo si el proveedor no responde
```

Presets: **OpenAI · Azure · Groq · Ollama · Hermes · custom** (API compatible con Chat Completions).

---

## Stack

```text
Next.js 15 (App Router) · React 19 · TypeScript
Tailwind CSS 4 · Prisma 5 · PostgreSQL
Zod · bcrypt sessions · S3-compatible storage (opcional)
Deploy: Render Blueprint (render.yaml)
Licencia: AGPL-3.0-or-later
```

---

## Inicio rápido

### Requisitos

- Node.js 20+ (22 recomendado en Render)
- PostgreSQL 14+
- npm

### 60 segundos

```bash
git clone https://github.com/gabrielperezibacache/lexopen.git
cd lexopen
cp .env.example .env
# Edite DATABASE_URL y SESSION_SECRET

npm install
npm run db:migrate
npm run db:seed    # datos demo del estudio
npm run dev
```

Abra **http://localhost:3000/login**.

> En producción: `npm run db:migrate` en el deploy; **no** ejecute seed automáticamente.  
> El filesystem local es efímero en PaaS — use S3/R2/MinIO para documentos.

### Usuarios demo

Password de todos: `lexopen`

| Email | Rol |
| --- | --- |
| `socio@estudio.cl` | admin / socia |
| `abogado@estudio.cl` | abogado |
| `asistente@estudio.cl` | paralegal |
| `cliente@andes.cl` | cliente (portal) |

Cambie de usuario con el switcher inferior del sidebar (`LEXOPEN_DEMO_SWITCHER=1` en local).

### Espacios demo incluidos

- Matter Andes · Cobro `C-4521-2025`  
- Matter Muñoz · Tutela `O-1189-2025`  
- VDR Due Diligence Pacífico  
- Knowledge · Jurisprudencia & Playbooks  
- Portal Cliente · Constructora Andes  

---

## Variables de entorno

| Variable | Uso |
| --- | --- |
| `DATABASE_URL` | Postgres (obligatorio) |
| `SESSION_SECRET` | Sesiones + protección OAuth (obligatorio en prod) |
| `LLM_API_URL` / `LLM_API_KEY` / `LLM_MODEL` | Proveedor IA OpenAI-compatible |
| `LLM_ALLOW_DEMO` | `1` = fallback demo si el LLM cae |
| `HERMES_*` | Adaptador Hermes (opcional) |
| `GOOGLE_CLIENT_ID` / `SECRET` / `REDIRECT_URI` | Drive / Calendar / Gmail |
| `OBSIDIAN_VAULT_PATH` | Export Markdown |
| `S3_*` | Object storage (opcional) |
| `PORT` | Bind `0.0.0.0:$PORT` (Render) |

Ver `.env.example` para el set completo.

---

## API (muestra)

```bash
# CRM
curl localhost:3000/api/clientes
curl -X POST localhost:3000/api/causas/<id>/tramites \
  -H 'content-type: application/json' \
  -d '{"titulo":"Preparar lista de testigos","estado":"pendiente"}'

# IA sobre carpeta de cliente
curl -X POST localhost:3000/api/clientes/<id>/ai \
  -H 'content-type: application/json' \
  -d '{"prompt":"Resume los trámites pendientes"}'

# Espacios / VDR / iSheets
curl localhost:3000/api/sites
curl -X POST localhost:3000/api/sites/<id>/files \
  -H 'content-type: application/json' \
  -d '{"action":"create-file","name":"Memo.md","contenido":"# Hola"}'
curl localhost:3000/api/sites/<id>/isheets

# Búsqueda
curl 'localhost:3000/api/search?q=tutela'

# Obsidian + Drive + Minutas
curl -X POST localhost:3000/api/integrations/obsidian \
  -H 'content-type: application/json' -d '{"action":"sync-all"}'
curl -X POST localhost:3000/api/integrations/google \
  -H 'content-type: application/json' \
  -d '{"action":"link-causa-folder","causaId":"<id>","folderRef":"https://drive.google.com/drive/folders/…"}'
curl -X POST localhost:3000/api/minutas \
  -H 'content-type: application/json' \
  -d '{"causaId":"<id>","tipo":"audiencia","titulo":"Audiencia de prueba","resumenEjecutivo":"…","acciones":[{"descripcion":"Presentar lista de testigos","crearPlazo":true,"fechaLimite":"2026-08-01"}]}'
```

Healthcheck: `GET /api/health`.

---

## Despliegue en Render

El repo incluye [`render.yaml`](render.yaml):

1. New → Blueprint → seleccione este repositorio  
2. Postgres managed + web service Node  
3. Configure secretos (`LLM_*`, Google, S3…) en el Dashboard  
4. Deploy ejecuta `prisma migrate deploy` + `npm run build`  
5. Bind HTTP en `0.0.0.0:$PORT` (ya configurado en `npm start`)

```bash
# Local mirror del start productivo
npm run build && npm run start
```

---

## Scripts

| Comando | Descripción |
| --- | --- |
| `npm run dev` | Desarrollo (Turbopack) |
| `npm run build` / `start` | Producción |
| `npm test` | Suite (Chile, plazos, minutas, LLM, IA, e2e smoke) |
| `npm run db:migrate` | Migraciones Prisma |
| `npm run db:seed` | Datos demo |
| `npm run db:reset` | Reset + seed (solo local) |
| `npm run setup` | `db push` + seed rápido |

---

## Roadmap (abierto)

- [ ] Conectores a fuentes oficiales (sin scraping agresivo)  
- [ ] Plantillas de escritos y exportación DOCX  
- [ ] SSO / SAML para estudios grandes  
- [ ] Multi-tenant por estudio  
- [ ] App móvil / PWA offline para audiencias  
- [ ] Marketplace de playbooks comunitarios  

¿Ideas? Abra un [issue](https://github.com/gabrielperezibacache/lexopen/issues) o un PR.

---

## Contribuir

Lea [`CONTRIBUTING.md`](CONTRIBUTING.md).

1. Fork → rama `feat/<nombre>` o `cursor/<feature>-xxxx`  
2. `npm run setup && npm run dev`  
3. UI en **español chileno**; sin secretos en commits  
4. PR describiendo módulos tocados  

```bash
npm test
npm run build
```

---

## Licencia

**AGPL-3.0-or-later** — ver [`LICENSE`](LICENSE).

Si modifica LexOpen y lo ofrece como servicio en red, debe publicar el código fuente correspondiente bajo la misma licencia.

---

<p align="center">
  <img src="docs/assets/lexopen-logo.svg" width="48" alt=""/>
  <br/>
  <sub>Hecho para estudios y abogados en Chile · Open source · Sin vendor lock-in</sub>
  <br/><br/>
  <a href="https://github.com/gabrielperezibacache/lexopen/stargazers">⭐ Star</a>
  ·
  <a href="https://github.com/gabrielperezibacache/lexopen/fork">Fork</a>
  ·
  <a href="https://github.com/gabrielperezibacache/lexopen/issues">Issues</a>
</p>
