<div align="center">
  <h1>⚖️ LexOpen</h1>
  <p><strong>Operaciones jurídicas open source para estudios de abogados en Chile</strong></p>
  <p>
    Workspaces · causas · plazos · colaboración · facturación · integraciones
  </p>
  <p>
    <a href="https://github.com/gabrielperezibacache/lexopen/actions/workflows/ci.yml">
      <img src="https://github.com/gabrielperezibacache/lexopen/actions/workflows/ci.yml/badge.svg" alt="CI">
    </a>
    <a href="LICENSE">
      <img src="https://img.shields.io/badge/license-AGPL--3.0--or--later-blue.svg" alt="Licencia AGPL-3.0-or-later">
    </a>
    <a href="package.json">
      <img src="https://img.shields.io/badge/version-0.1.4-orange.svg" alt="Versión 0.1.4">
    </a>
    <a href="https://nodejs.org/">
      <img src="https://img.shields.io/badge/Node.js-22.x-339933.svg?logo=nodedotjs&logoColor=white" alt="Node.js 22">
    </a>
    <a href="https://www.postgresql.org/">
      <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1.svg?logo=postgresql&logoColor=white" alt="PostgreSQL 16">
    </a>
  </p>
  <p>
    <a href="#-empezar-gu%C3%ADa-sencilla">Empezar</a> ·
    <a href="#-qu%C3%A9-resuelve">Qué resuelve</a> ·
    <a href="docs/DESKTOP.md">Desktop</a> ·
    <a href="CONTRIBUTING.md">Contribuir</a>
  </p>
</div>

> [!IMPORTANT]
> **Estado del proyecto:** LexOpen está en la versión `0.1.4` y debe considerarse un
> prototipo funcional / base para pilotos e iteraciones. Antes de cargar información
> real, revise seguridad, permisos, respaldos, cumplimiento y fuentes jurídicas según
> las necesidades de su organización.

> [!NOTE]
> LexOpen está inspirado en el modelo de workspaces de
> [HighQ](https://legal.thomsonreuters.com/en/products/highq), pero no es un producto
> de Thomson Reuters ni está afiliado a esa empresa. HighQ es una marca de terceros.

## Índice

- [Qué es LexOpen](#-qué-es-lexopen)
- [Qué resuelve](#-qué-resuelve)
- [Recorrido de la demo](#-recorrido-de-la-demo)
- [Arquitectura](#-arquitectura)
- [Empezar (guía sencilla)](#-empezar-guía-sencilla)
- [Inicio rápido](#-inicio-rápido)
- [Instalación web 100% local](#-instalación-web-100-local)
- [Usuarios demo y pasar a producción](#-usuarios-demo-y-pasar-a-producción)
- [Configuración](#-configuración)
- [Integraciones](#-integraciones)
- [Aplicación desktop](#-aplicación-desktop)
- [API](#-api)
- [Producción en Host local](#-producción-en-host-local)
- [Cómo actualizar la aplicación](#-cómo-actualizar-la-aplicación)
- [Seguridad y límites actuales](#-seguridad-y-límites-actuales)
- [Desarrollo y pruebas](#-desarrollo-y-pruebas)
- [Estructura del repositorio](#-estructura-del-repositorio)
- [Contribuir](#-contribuir)
- [Licencia](#-licencia)

## 🧭 Qué es LexOpen

LexOpen reúne en una sola aplicación las operaciones que normalmente quedan
repartidas entre carpetas, hojas de cálculo, correo, notas y herramientas de
seguimiento:

- **Espacios de trabajo tipo site:** matters, VDR/data rooms, conocimiento, proyectos y
  portales de clientes.
- **Gestión de causas chilenas:** RIT/RUC, tribunal, carátula, partes, etapas,
  movimientos, documentos, notas y conflictos de interés.
- **Colaboración trazable:** tareas, calendario, plazos, minutas, comentarios, Q&A,
  workflows, mensajes, notificaciones y actividad.
- **Operación económica interna:** horas, gastos, tarifas, facturas/boletas,
  retenciones, pagos y cuenta corriente de clientes.
- **Puentes hacia otras herramientas:** Google Drive/Calendar, exportación Markdown a
  Obsidian, almacenamiento S3-compatible y un agente Hermes con API compatible con
  OpenAI.

La propuesta no es reemplazar el criterio profesional ni las fuentes oficiales:
es ofrecer una base abierta, extensible y centrada en el trabajo diario de un estudio.

## ✨ Qué resuelve

| Área | Capacidades incluidas |
| --- | --- |
| **Sites / Workspaces** | Matters, VDR, knowledge, client portal y proyectos; miembros, grupos, feed de actividad y navegación por espacio. |
| **Archivos** | Carpetas, metadata, etiquetas, comentarios, versionado y contenido Markdown/texto; almacenamiento local o S3-compatible. |
| **Causas** | RIT/RUC, tribunal, materia, etapa, partes, abogado responsable, movimientos, notas, documentos y revisión de conflictos. |
| **Minutas** | Flujos guiados para audiencias, reuniones y llamadas; resumen, acuerdos, próximos pasos y acciones que pueden generar tareas/plazos. |
| **Plazos y calendario** | Seguimiento de plazos procesales, tareas con vencimiento, calendario unificado y conversión UF/CLP. |
| **iSheets** | Tablas estructuradas por espacio con columnas tipadas, opciones y filas editables. |
| **Wiki, blog y Q&A** | Base de conocimiento en Markdown, publicaciones, preguntas por espacio y respuestas oficiales. |
| **Workflows** | Aprobaciones manuales multi-paso para escritos y publicación de información en portales. |
| **Portal cliente** | Sites visibles para clientes, documentos compartidos y comunicación contextual por Q&A. |
| **Búsqueda e inteligencia** | Búsqueda unificada (incluye documentos por causa); copiloto con alcance de carpeta investigativa, ranking documental y aprobación humana. |
| **Facturación** | Horas, gastos, tarifas horarias, cuota litis, retainers, documentos internos de cobro, pagos y provisiones. |
| **Auditoría y acceso** | Sesiones firmadas, roles `admin`/`abogado`/`asistente`/`cliente`, filtros de confidencialidad y eventos de auditoría. |

### Capa Chile

Incluye utilidades para validar RUT, RIT y RUC, catálogos de tribunales y materias,
etapas procesales, días hábiles/calendario simplificados y valores UF. El motor de
plazos es una ayuda operativa: **no reemplaza el cómputo oficial del tribunal ni la
revisión de un abogado**.

Incluye también monitoreo de causas PJUD: semáforos, cuadernos, receptor,
escritos, cola de fallidos, scrape OJV opt-in (CAPTCHA) o sidecar, ClaveÚnica
cifrada → Mis Causas, timeline clasificado y alertas. Conectores: partner API,
scraper, webhook, demo o CSV. El scrape y ClaveÚnica van desactivados por
defecto (kill switches); no se presentan como API oficial de PJUD.

**Copiloto IA:** entiende la petición, recuerda el hilo, busca en
causas/documentos del estudio y responde con fuentes del host. Utilidades:
briefing, Q&A documental, borradores, plazos, investigación y casos similares.
Todo como ayuda operativa con revisión humana — no asesoría automática.

Sin proveedor externo, la alternativa local es exportar el CSV desde la consulta
oficial e importarlo en la ficha de la causa. El importador acepta
`titulo,detalle,fecha,referencia,id,cuaderno,folio,etapa,tramite,receptor,documento`
(compatible con el encabezado corto), clasifica los movimientos y omite
reimportaciones determinísticamente; la ficha ofrece plantilla y exportación
compatible para respaldo local, además de una vista previa que no modifica la
base de datos.

La jurisprudencia incluida en el seed es un **corpus de demostración**. No es una
fuente oficial, exhaustiva ni necesariamente actualizada.

## 🎬 Recorrido de la demo

Después de ejecutar el seed, una primera exploración útil es:

1. Entrar a `/login` como `socio@estudio.cl`.
2. Abrir el dashboard y revisar las causas, tareas, notificaciones y minutas
   pendientes.
3. Entrar al site **Andes · Cobro de pesos C-4521-2025** para ver archivos
   versionados, wiki, iSheet de hitos, Q&A y workflow de aprobación.
4. Cambiar al usuario `cliente@andes.cl` para observar la navegación del portal y
   el contenido compartido.
5. Revisar **Facturación** para ver horas, gastos, facturas, pagos y provisiones en
   pesos chilenos.
6. Probar **Documentos** (Incorporar → Carpeta), la ficha de causa C-4521 y el
   **copiloto** en `/agente`: acote la carpeta investigativa `Escritos/` o reanude
   el chat demo «Montos reclamados en Escritos».
7. Probar **Jurisprudencia** e **Integraciones** para distinguir los datos demo
   de las conexiones externas reales (Google Drive, Obsidian, Hermes).

El seed crea cinco sites, tres causas, cuatro usuarios, jurisprudencia demo y datos
de facturación. Todos los datos son ficticios y están pensados para mostrar los
flujos principales.

## 🏗️ Arquitectura

```text
┌───────────────────────────────┐
│ Navegador / Electron Client   │
└───────────────┬───────────────┘
                │ HTTP
┌───────────────▼───────────────┐
│ Next.js App Router            │
│ UI React + REST /api/*        │
│ Auth, RBAC, CSRF, auditoría   │
└───────────────┬───────────────┘
                │ Prisma
┌───────────────▼───────────────┐       ┌─────────────────────────────┐
│ PostgreSQL 16                 │       │ Integraciones opcionales    │
│ causas, sites, usuarios, etc. │──────▶│ Google · Obsidian · Hermes  │
└───────────────────────────────┘       │ S3-compatible storage       │
                                        └─────────────────────────────┘
```

En el modo desktop, un único **Host** ejecuta LexOpen y PostgreSQL embebido. Los
equipos restantes actúan como clientes contra esa misma instalación, normalmente a
través de Tailscale o de una LAN privada. No se crea una base de datos separada por
laptop.

## 🌐 Instalación web 100% local

Esta es la opción recomendada si no desea instalar Electron en cada equipo.
Un único PC ejecuta LexOpen y PostgreSQL embebido; los demás equipos usan el
navegador. No requiere Render, S3, Tailscale ni servicios externos durante la
ejecución.

### Requisitos del Host

- Node.js 22.x y npm.
- Git.
- Un directorio local con espacio para PostgreSQL y documentos.
- Red LAN si habrá clientes en otros equipos.

### Instalación

```bash
git clone https://github.com/gabrielperezibacache/lexopen.git
cd lexopen
npm ci
npm run web:host
```

`web:host` instala el runtime local si falta, compila solo cuando es necesario,
inicia PostgreSQL embebido, aplica migraciones y arranca la web en
`0.0.0.0:3000`.

Para elegir dónde guardar todos los datos:

```bash
# macOS / Linux
LEXOPEN_DATA_DIR=/ruta/lexopen-data npm run web:host

# Windows PowerShell
$env:LEXOPEN_DATA_DIR="$HOME\LexOpenData"; npm run web:host
```

### Primer acceso

El comando imprime un enlace `/setup?token=...`. Ábralo en el Host, cree el
administrador e inicie sesión. Después cree los usuarios del estudio desde
**Personas**.

En el Host:

```text
http://127.0.0.1:3000
```

Desde otro equipo de la LAN:

```text
http://IP-PRIVADA-DEL-HOST:3000
```

Para acceso LAN, agregue el origen exacto al `.env` dentro de
`LEXOPEN_DATA_DIR` y reinicie:

```dotenv
LEXOPEN_TRUSTED_ORIGINS=http://127.0.0.1:3000,http://IP-PRIVADA-DEL-HOST:3000
```

### Datos y operación

- Los datos quedan en `LEXOPEN_DATA_DIR` o en la carpeta predeterminada del sistema.
- No configure S3, Google, Hermes o PJUD si necesita una instalación completamente local.
- Detenga el Host con `Ctrl+C` antes de copiar el directorio de datos como respaldo.
- Para activar backups locales con rotación, configure
  `LEXOPEN_BACKUP_INTERVAL_MINUTES`, `LEXOPEN_BACKUP_DIR` y
  `LEXOPEN_BACKUP_KEEP` en el `.env` del Host. El scheduler detiene brevemente
  PostgreSQL para copiarlo de forma consistente y conserva los últimos respaldos.
- No ejecute `npm run db:seed`, `npm run setup` ni `npm run db:reset` con datos reales.

Guía ampliada: [`docs/WEB-HOST.md`](docs/WEB-HOST.md).

## 🏁 Empezar (guía sencilla)

Hay **dos caminos**. Elija uno:

| Camino | Para qué | Resultado |
| --- | --- | --- |
| **A · Probar la demo** | Conocer LexOpen con datos de ejemplo | Usuarios `*@estudio.cl` / contraseña `lexopen` |
| **B · Estudio real (producción)** | Empezar la base de datos del estudio desde cero | Sin datos ficticios; usted crea el primer admin |

### A · Probar la demo (5 minutos)

```bash
git clone https://github.com/gabrielperezibacache/lexopen.git
cd lexopen
cp .env.example .env

# PostgreSQL (ejemplo con Docker)
docker run --name lexopen-postgres \
  -e POSTGRES_USER=lexopen -e POSTGRES_PASSWORD=lexopen \
  -e POSTGRES_DB=lexopen -p 5432:5432 -d postgres:16

npm ci
npm run db:migrate
npm run db:seed          # carga datos ficticios (destructivo)
npm run dev
```

Abra `http://localhost:3000/login` e ingrese con `socio@estudio.cl` / `lexopen`.

### B · Estudio real desde cero (sin demo)

**Opción B1 — instalación limpia (recomendado si aún no cargó el seed):**

```bash
git clone https://github.com/gabrielperezibacache/lexopen.git
cd lexopen
cp .env.example .env
# Edite .env: SESSION_SECRET fuerte, LEXOPEN_DEMO_SWITCHER=0,
# HERMES_ALLOW_DEMO=0, PJUD_ALLOW_DEMO=0

docker run --name lexopen-postgres \
  -e POSTGRES_USER=lexopen -e POSTGRES_PASSWORD=lexopen \
  -e POSTGRES_DB=lexopen -p 5432:5432 -d postgres:16

npm ci
npm run setup:production   # solo migraciones, sin seed demo

# Token de una sola vez para crear el primer administrador
export LEXOPEN_BOOTSTRAP_TOKEN="$(openssl rand -hex 24)"
echo "Abra: http://localhost:3000/setup?token=$LEXOPEN_BOOTSTRAP_TOKEN"

npm run dev
# o producción: npm run build && npm run start
```

En `/setup?token=…` cree el admin del estudio (nombre, email, contraseña ≥12).
Luego configure la organización en **Configuración** y agregue abogados/clientes reales.

**Opción B2 — ya probó la demo y quiere borrar todo para producción:**

```bash
# Conserva catálogos Chile (tribunales, UF, plantillas)
npm run db:purge-demo -- --yes

# En .env desactive banderas demo:
#   LEXOPEN_DEMO_SWITCHER=0
#   HERMES_ALLOW_DEMO=0
#   PJUD_ALLOW_DEMO=0

export LEXOPEN_BOOTSTRAP_TOKEN="$(openssl rand -hex 24)"
npm run dev
# Abra /setup?token=$LEXOPEN_BOOTSTRAP_TOKEN
```

También puede hacerlo desde la UI: inicie sesión como admin demo →
**Configuración** → panel *Eliminar datos demo (pasar a producción)* →
escriba `ELIMINAR DATOS DEMO`.

> [!WARNING]
> `db:purge-demo` y el panel de Configuración borran **causas, clientes, usuarios
> y todo el contenido operativo**. Haga respaldo antes si hay algo que quiera conservar.
> El schema/migraciones no se tocan.

Detalle ampliado: [Usuarios demo y pasar a producción](#-usuarios-demo-y-pasar-a-producción).

## 🚀 Inicio rápido

### Requisitos

- Node.js 22.x y npm.
- PostgreSQL 16 (o una versión compatible) accesible mediante `DATABASE_URL`.
- Git.
- Opcional: Docker para levantar PostgreSQL localmente, y credenciales de Google,
  Hermes, Obsidian o S3 para las integraciones.

### 1. Obtener el código

```bash
git clone https://github.com/gabrielperezibacache/lexopen.git
cd lexopen
cp .env.example .env
```

### 2. Preparar PostgreSQL

Si no tiene una instancia local, puede usar PostgreSQL 16 con Docker:

```bash
docker run --name lexopen-postgres \
  -e POSTGRES_USER=lexopen \
  -e POSTGRES_PASSWORD=lexopen \
  -e POSTGRES_DB=lexopen \
  -p 5432:5432 \
  -d postgres:16
```

El `DATABASE_URL` incluido en `.env.example` coincide con ese contenedor.

### 3. Instalar, migrar y cargar la demo

```bash
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

Abra `http://localhost:3000/login`. Para una experiencia de demostración, el seed
crea usuarios y contenido ficticio; consulte [Usuarios y datos demo](#-usuarios-y-datos-demo).

### Comandos de base de datos
| Comando | Uso |
| --- | --- |
| `npm run db:migrate` / `setup:production` | Aplica migraciones; **sin** cargar demo. Use esto en producción. |
| `npm run db:push` | Sincroniza el schema directamente; útil para prototipos locales. |
| `npm run db:seed` | **Borra el contenido y carga datos demo.** Solo desarrollo. |
| `npm run db:purge-demo -- --yes` | **Borra datos operativos/demo** y deja la BD lista para `/setup`. |
| `npm run db:reset` | `db push --force-reset` + seed; **destructivo**. |
| `npm run setup` | `db:push` + seed; **destructivo** si ya hay datos. |

> [!WARNING]
> No ejecute `db:seed`, `db:reset`, `setup` ni `db:purge-demo` sobre una base con
> información real sin respaldo. En producción use migraciones + `/setup` con
> `LEXOPEN_BOOTSTRAP_TOKEN`.

### Ejecutar en modo producción local

La vía recomendada es el Host web local (PostgreSQL embebido + datos en disco):

```bash
LEXOPEN_DATA_DIR=/ruta/persistente/lexopen npm run web:host
```

Si ya tiene un Postgres propio en la máquina:

```bash
npm run setup:production   # migraciones, sin seed demo
npm run build
npm run start
```

El servidor escucha en `0.0.0.0` y usa `PORT` (por defecto `3000`).

## 👥 Usuarios demo y pasar a producción

### Usuarios del seed (solo demo)

Todos usan la contraseña `lexopen`:

| Email | Rol | Uso recomendado |
| --- | --- | --- |
| `socio@estudio.cl` | `admin` | Configuración, aprobación y visión completa del estudio. |
| `abogado@estudio.cl` | `abogado` | Causas, estrategia, minutas, documentos y colaboración. |
| `asistente@estudio.cl` | `asistente` | Tareas, documentos, plazos y apoyo operativo. |
| `cliente@andes.cl` | `cliente` | Recorrido del portal y contenido compartido. |

El selector de usuarios demo aparece en desarrollo o cuando
`LEXOPEN_DEMO_SWITCHER=1`. **Desactívelo antes de cualquier uso real.**

### Cómo pasar de demo a base del estudio

1. **Respalde** si necesita conservar algo (CSV de causas, documentos externos).
2. **Purgue** los datos ficticios:
   - CLI: `npm run db:purge-demo -- --yes`
   - UI (admin): Configuración → *Eliminar datos demo* → frase `ELIMINAR DATOS DEMO`
3. **Apague banderas demo** en `.env`:
   ```dotenv
   LEXOPEN_DEMO_SWITCHER=0
   HERMES_ALLOW_DEMO=0
   PJUD_ALLOW_DEMO=0
   ```
4. **Cree el primer administrador real:**
   ```bash
   export LEXOPEN_BOOTSTRAP_TOKEN="$(openssl rand -hex 24)"
   # Abra /setup?token=$LEXOPEN_BOOTSTRAP_TOKEN
   ```
5. Configure el estudio en **Configuración** (razón social, RUT, emisor) y cree
   los usuarios del equipo.

Por defecto la purga **conserva** catálogos Chile (tribunales, UF, plantillas de
minuta). Para borrarlos también: `npm run db:purge-demo -- --yes --wipe-catalogs`.

## 🔧 Configuración

La referencia completa está en [`.env.example`](.env.example). Estas son las
variables más relevantes:

| Variable | Requerida | Propósito |
| --- | --- | --- |
| `DATABASE_URL` | Sí | Conexión PostgreSQL. |
| `SESSION_SECRET` | Producción | Firma de sesiones y cifrado de tokens Google; use un secreto aleatorio de al menos 16 caracteres. |
| `PORT` | No | Puerto HTTP; por defecto `3000`. |
| `NEXT_PUBLIC_APP_URL` | No | URL canónica de la aplicación. |
| `LEXOPEN_TRUSTED_ORIGINS` | No | Orígenes adicionales permitidos para validaciones CSRF, separados por coma. |
| `LEXOPEN_TRUSTED_PROXY` | No | Permite usar `X-Forwarded-For` para rate limiting solo detrás de un proxy confiable. |
| `LEXOPEN_DEMO_SWITCHER` | No | Habilita el cambio entre usuarios demo; solo desarrollo/demo. |
| `LEXOPEN_BOOTSTRAP_TOKEN` | Setup limpio | Token de un uso para crear el primer admin en `/setup` tras instalación o `db:purge-demo`. |
| `LEXOPEN_OPEN_ACCESS` | No | Bypass de autenticación únicamente fuera de producción; no lo habilite en un entorno real. |
| `LEXOPEN_RELAX_CSRF` | No | Relaja controles para CI; no lo habilite en producción. |
| `STORAGE_PATH` | No | Directorio local para archivos cuando no se configura S3. |
| `LEXOPEN_ALLOW_LOCAL_PRODUCTION_STORAGE` | Host web local | `1` permite almacenamiento en disco local en producción (`web:host`). |
| `LEXOPEN_REQUIRE_PERSISTENT_STORAGE` | No | Con `1`, `/api/health` devuelve `503` si no hay storage persistente listo. |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` | No | Bucket y endpoint de almacenamiento S3-compatible. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | No | Credenciales del bucket S3-compatible. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | No | OAuth de Google Drive y Calendar. |
| `HERMES_API_URL`, `HERMES_API_KEY` | No | Compat: endpoint Hermes Agent (fallback si no hay `LLM_*`). |
| `HERMES_ALLOW_DEMO` | No | Compat: permite demo si el proveedor no está disponible. |
| `LLM_API_URL`, `LLM_API_KEY`, `LLM_MODEL` | No | Endpoint multi-proveedor OpenAI-compatible (OpenAI, Azure, Groq, Ollama, Hermes, custom). Prioridad sobre `HERMES_*`. |
| `LLM_ALLOW_DEMO` | No | Demo etiquetado si el proveedor IA no responde (`0` = fail-closed). |
| `PJUD_API_URL`, `PJUD_API_KEY` | No | Conector partner para sincronizar movimientos judiciales. |
| `PJUD_SCRAPER_URL`, `PJUD_SCRAPER_KEY` | No | Sidecar scrape (lookup + Mis Causas). |
| `PJUD_PUBLIC_SCRAPE` | No | `1` = scrape OJV in-process (Playwright + CAPTCHA). |
| `CAPTCHA_SOLVER_PROVIDER`, `CAPTCHA_SOLVER_API_KEY` | No | `nopecha` (free tier) \| `2captcha` \| `capsolver` \| `anticaptcha` \| `capmonster`. Key opcional solo en `nopecha`. |
| `PJUD_CLAVEUNICA_SCRAPE` | No | `1` = permite login ClaveÚnica automatizado (Mis Causas). |
| `PJUD_SECRETS_KEY` | No | Clave AES para vault ClaveÚnica (fallback SESSION_SECRET). |
| `PJUD_SCRAPER_ALLOW_PRIVATE` | No | `1` = permite sidecar en localhost / red privada del Host. |
| `PJUD_MIS_CAUSAS_INTERVAL_MINUTES` | No | Scheduler local Mis Causas (Host web). |
| `PJUD_ALLOW_DEMO` | No | Permite movimientos PJUD simulados y etiquetados como demo. |
| `PJUD_WEBHOOK_SECRET` | No | Firma HMAC de webhooks asíncronos de un proveedor PJUD. |
| `PJUD_SYNC_INTERVAL_MINUTES` | No | Intervalo del próximo sync (default 240 = 4h). |
| `CRON_SECRET` | No | Protege la sincronización de cartera desde un scheduler externo. |
| `OBSIDIAN_VAULT_PATH` | No | Vault local para exportaciones en desarrollo. |
| `OBSIDIAN_REST_URL`, `OBSIDIAN_REST_TOKEN` | No | Obsidian Local REST API y token Bearer. |
| `LEXOPEN_DESKTOP`, `LEXOPEN_DATA_DIR`, `LEXOPEN_DESKTOP_MODE` | Desktop | Activan y configuran el modo Host/Cliente de Electron. |

No incluya secretos reales en commits. Para producción, genere un
`SESSION_SECRET` nuevo, use HTTPS/Tailscale y desactive todas las banderas demo.

Los proveedores PJUD que trabajan de forma asíncrona pueden usar
`POST /api/integrations/pjud/webhook` con `x-pjud-timestamp` y
`x-pjud-signature`. Consulte [`docs/PJUD.md`](docs/PJUD.md) y
[`docs/WEB-HOST.md`](docs/WEB-HOST.md) para el contrato firmado, cuadernos /
receptor, la ventana anti-replay y el formato normalizado de movimientos.

## 🔌 Integraciones

### Google Workspace

El flujo OAuth almacena tokens cifrados con `SESSION_SECRET` y permite:

- crear o vincular carpetas reales de Drive por causa;
- subir documentos y minutas a una carpeta real;
- crear eventos de Calendar a partir de plazos.

Sin OAuth, el entorno de desarrollo puede mostrar **stubs locales**. Esos marcadores
no son carpetas de Drive y nunca deben confundirse con archivos reales. Aunque la
configuración solicita el scope de Gmail, el repositorio no implementa actualmente
un flujo de envío o sincronización de Gmail.

### Obsidian

Exporta una causa a Markdown con índice, partes, plazos, notas, minutas y documentos
no confidenciales (prioriza `extractedMarkdown` y respeta subcarpetas
`Documentos/<ruta>/…`). Puede escribir en un vault local durante el desarrollo, usar
Obsidian Local REST API o conservar los objetos mediante el backend de storage.

### Hermes Agent / IA multi-proveedor

El copiloto usa cualquier API compatible con OpenAI Chat Completions. Configure el
proveedor en **Configuración → Endpoints de IA** (`LlmSettingsForm`, con prueba de
conexión y CSRF) o con variables de entorno:

- `LLM_API_URL` / `LLM_API_KEY` / `LLM_MODEL` (prioridad)
- o `HERMES_API_URL` / `HERMES_API_KEY` (compat)

Presets: OpenAI, Azure OpenAI, Groq, Ollama (local), Hermes Agent, o URL custom.
Las solicitudes van a `POST {apiUrl}/chat/completions`. La consola **Copiloto IA**
(`/agente`) ofrece utilidades (briefing, plazos, documentos, borradores,
investigación con wiki/jurisprudencia) con fuentes ancladas del estudio. El context
pack ancla la respuesta a la causa, la **carpeta investigativa** (`ruta` /
`documentoId`), documentos rankeados por la pregunta, VDR/wiki del espacio
vinculado y plazos. En `/agente` se puede acotar por carpeta o documentos; el
alcance y las fuentes se restauran al reanudar el chat, y el asistente propone
próximos pasos sugeridos (crear tarea, calcular plazo, etc.).

Las respuestas se guardan como historial de chat y requieren aprobación humana:
un borrador puede **descartarse** o **aprobarse y guardarse como minuta** de la
causa (`approve-to-minuta`), quedando enlazado al chat para evitar aprobaciones
duplicadas. Con `LLM_ALLOW_DEMO=1` (o `HERMES_ALLOW_DEMO=1`), una respuesta local
de demostración se identifica explícitamente como tal y su aprobación como minuta
exige una confirmación explícita adicional.

No es asesoría jurídica automática: no presente ni envíe un texto generado sin
revisión del abogado responsable.

### Procesamiento documental local

LexOpen integra localmente:

- [`@firecrawl/anydoc`](https://github.com/firecrawl/anydoc) para convertir Word,
  PowerPoint, Excel, OpenDocument, RTF, EPUB, CSV y PDFs a Markdown.
- [`@firecrawl/pdf-inspector`](https://github.com/firecrawl/pdf-inspector) para
  clasificar PDFs como texto, mixtos o escaneados y detectar páginas que requieren
  OCR.

Desde **Documentos** o la ficha de causa puede incorporar archivos o una **carpeta
investigativa** completa (se preserva `ruta`). LexOpen conserva el original y genera
Markdown extraído cuando es posible; ese texto alimenta el copiloto y la exportación
a Obsidian/Drive. Los PDFs escaneados usan Tesseract local mediante un binding nativo
que renderiza internamente; `pdftoppm` solo queda como fallback para plataformas sin
ese binding. Si falta OCR, el documento queda marcado como `Requiere OCR`. Ningún
archivo se envía a Firecrawl.
Ambas dependencias y el fallback OCR se ejecutan localmente; los bindings nativos
se cargan según la plataforma del Host.
El procesamiento se ejecuta en una cola local en segundo plano: la carga no espera
al OCR, los trabajos pendientes se recuperan tras reiniciar y Documentos ofrece
reintento cuando faltan binarios o el procesamiento falla.

### Almacenamiento de archivos

El adaptador usa S3-compatible cuando están configuradas las credenciales mínimas;
en el Host local / desktop escribe en `STORAGE_PATH` dentro de `LEXOPEN_DATA_DIR`
(persistente en disco del PC). No hace falta object storage en la nube para
producción local.

## 🖥️ Aplicación desktop

LexOpen Desktop empaqueta el Host local y un cliente remoto:

```text
PC principal / Host
  Electron + Next.js + PostgreSQL embebido
            │
            └── Tailscale o LAN privada
                  ├── LexOpen Desktop / Cliente
                  └── Navegador
```

Guía detallada: [`docs/DESKTOP.md`](docs/DESKTOP.md).
Para usar solo navegador sin instalar Electron en clientes, consulte
[`docs/WEB-HOST.md`](docs/WEB-HOST.md).

```bash
npm install
npm run desktop:install
npm run desktop:test
npm run desktop:dev
```

En una instalación Host limpia, LexOpen abre `/setup` para crear el primer
administrador con una contraseña propia; el seed demo es opcional y no es necesario
para iniciar el estudio.

Requiere Node 22 (ver [`.nvmrc`](.nvmrc)). Las actualizaciones del instalador no
borran `Application Support` / `%APPDATA%\LexOpen` (config, Postgres, documentos).

Variables relevantes y completas: [`.env.example`](.env.example).

El menú desktop incluye **Crear respaldo…** y **Restaurar respaldo…**. El respaldo
detiene brevemente el Host para copiar de forma consistente PostgreSQL embebido,
documentos, vault y configuración; contiene secretos y debe guardarse cifrado.
Si se pierde la contraseña del administrador, **Recuperar contraseña admin…** abre
un flujo local protegido por token y revoca las sesiones anteriores.

Para generar instaladores de macOS y Windows:

```bash
LEXOPEN_STANDALONE=1 npm run build
npm run desktop:dist
npm run desktop:dist:linux  # Linux AppImage
```

La guía documenta macOS 12+ y Windows 10/11 como plataformas principales. El
builder contiene un target AppImage para Linux. Los tags `vX.Y.Z` activan
`.github/workflows/desktop-release.yml`, que compila los tres sistemas y publica
los artefactos. La firma/notarización requiere certificados configurados como
secrets; sin ellos los instaladores son unsigned. En builds empaquetados, LexOpen
consulta releases, pide confirmación para descargar y detiene el Host de forma
ordenada antes de instalar; durante desarrollo no se consulta el canal.

El Host conserva configuración y datos fuera del directorio de la aplicación; los
clientes desktop detectan cambios de versión del Host y recargan la interfaz. La
descarga e instalación automática de nuevas versiones no debe asumirse como una
capacidad operativa ya disponible.

## 🔗 API

La aplicación expone rutas REST bajo [`src/app/api`](src/app/api). La mayoría de
las rutas de negocio requiere una sesión válida y las mutaciones deben respetar los
controles de origen de la aplicación.

Comprobación básica de salud:

```bash
curl http://localhost:3000/api/health
```

Principales grupos de endpoints:

| Grupo | Ejemplos |
| --- | --- |
| Auth y salud | `/api/auth/*`, `/api/health` |
| Causas y plazos | `/api/causas`, `/api/plazos`, `/api/uf`, `/api/conflict-check` |
| Sites | `/api/sites/*`, `/api/tasks`, `/api/workflows` |
| Documentos y búsqueda | `/api/documentos`, `/api/search`, `/api/jurisprudencia` |
| Minutas | `/api/minutas`, `/api/minutas/plantillas` |
| Colaboración | `/api/messages`, `/api/notifications`, `/api/people` |
| Facturación | `/api/billing/*` |
| Integraciones | `/api/integrations/google`, `/api/integrations/obsidian`, `/api/integrations/llm`, `/api/integrations/hermes` |

Para explorar contratos concretos, consulte las route handlers y los schemas Zod
junto a cada módulo. Los ejemplos mutantes necesitan cookies de sesión y, según la
ruta, validación de origen; un `curl` anónimo no es una prueba válida de autorización.

## 🏠 Producción en Host local

LexOpen en producción corre **en su PC/servidor local**, no en Render ni otro
SaaS de hosting. Un único Host guarda Postgres, documentos y secretos en disco.

```bash
git clone https://github.com/gabrielperezibacache/lexopen.git
cd lexopen
npm ci
LEXOPEN_DATA_DIR=/ruta/persistente/lexopen npm run web:host
```

1. Abra el enlace `/setup?token=…` que imprime el Host y cree el admin del estudio
   (sin seed demo).
2. Compruebe `curl http://127.0.0.1:3000/api/health` → `db: "up"`, `storageReady: true`.
3. Opcional: active arranque automático con `deploy/systemd`, `deploy/launchd` o
   `deploy/windows` (ver [`docs/WEB-HOST.md`](docs/WEB-HOST.md)).
4. Respalde con `npm run web:backup` hacia un disco externo cifrado.

Demos deben permanecer apagadas (`LEXOPEN_DEMO_SWITCHER=0`, `HERMES_ALLOW_DEMO=0`,
`PJUD_ALLOW_DEMO=0`). El sidecar PJUD y los crons de sync/digest también son
locales (`npm run pjud:host` + intervalos en el `.env` del data dir).

## 🔄 Cómo actualizar la aplicación

Cuando GitHub Releases publica una versión más nueva que la del Host, el personal
del estudio ve un **aviso en la aplicación** con los pasos de actualización (se
puede descartar por versión). También puede desactivar la consulta con
`LEXOPEN_UPDATE_CHECK=0`.

Actualizar LexOpen reemplaza el **código** (y aplica migraciones de base de datos).
La carpeta de datos (`LEXOPEN_DATA_DIR`, Application Support / `%APPDATA%\LexOpen`)
**no se borra**: PostgreSQL, documentos, vault y `.env` se conservan.

### Antes de actualizar

1. Avise a quienes usen el Host (la app estará unos minutos fuera de línea).
2. Cree un respaldo con el Host **detenido**:

   ```bash
   # Host web
   npm run web:backup -- --output /ruta/externa/lexopen-backup

   # Desktop: menú LexOpen → Crear respaldo…
   ```

3. **No ejecute** `npm run db:seed`, `npm run setup`, `npm run db:reset` ni
   `npm run db:purge-demo` sobre una instalación con datos reales.

### Host web (recomendado)

En el PC que ejecuta LexOpen:

```bash
# 1) Detenga el Host (Ctrl+C o systemctl/launchd/tarea programada)
cd /ruta/al/repo/lexopen

# 2) Traiga el código nuevo
git fetch origin
git checkout main
git pull origin main

# 3) Dependencias
npm ci

# 4) Arranque de nuevo (web:host aplica migraciones Prisma al iniciar)
LEXOPEN_DATA_DIR=/ruta/persistente/lexopen npm run web:host
```

Si usa servicio automático, reinicie el servicio después de `npm ci` (por ejemplo
`sudo systemctl restart lexopen-web`). Detalle en [`docs/WEB-HOST.md`](docs/WEB-HOST.md).

Compruebe:

```bash
curl -s http://127.0.0.1:3000/api/health
```

Debe mostrar `db: "up"`, `storageReady: true` y la nueva `version`. Los clientes
con navegador ven la UI nueva con un refresh (F5).

### Desarrollo o Postgres externo

Si corre `next dev` / `next start` contra un PostgreSQL propio (no el embebido de
`web:host`):

```bash
git pull origin main
npm ci
npm run db:migrate          # o: npm run setup:production
npm run build               # si usa next start en producción
npm run start               # o npm run dev
```

### Aplicación desktop

1. Descargue el instalador nuevo desde [GitHub Releases](https://github.com/gabrielperezibacache/lexopen/releases)
   (o acepte la actualización que ofrece el Host empaquetado).
2. Instale **encima** en el PC Host: no se tocan `%APPDATA%\LexOpen` /
   `~/Library/Application Support/LexOpen/`.
3. Arranque el Host: aplicará migraciones y registrará la versión nueva.
4. Clientes Desktop recargan solos al detectar el cambio; el navegador necesita F5.

Detalle del flujo y límites del auto-update: [`docs/DESKTOP.md`](docs/DESKTOP.md).

### Si algo falla

1. Detenga el Host.
2. Restaure el respaldo:

   ```bash
   npm run web:restore -- --source /ruta/externa/lexopen-backup
   npm run web:host
   ```

   En desktop: **Restaurar respaldo…**.
3. Abra un issue en GitHub con la versión anterior, la nueva y el error de
   `/api/health` o de la consola del Host.

## 🔐 Seguridad y límites actuales

Controles implementados en el código:

- cookies de sesión `HttpOnly`, `SameSite=Lax` y `Secure` en producción;
- tokens de sesión firmados con HMAC y contraseñas con bcrypt;
- roles de servidor y filtros de contenido confidencial;
- cifrado AES-256-GCM de tokens Google / ClaveÚnica cuando existe `SESSION_SECRET`
  (o `PJUD_SECRETS_KEY`);
- CSRF Origin/Referer en mutaciones de API (incluido login) más double-submit
  (`lexopen_csrf` + `x-csrf-token`) en producción con sesión; en producción el
  header `Host` no amplía la allowlist si hay `NEXT_PUBLIC_APP_URL` /
  `LEXOPEN_TRUSTED_ORIGINS`;
- cookies `Secure` según URL canónica / `LEXOPEN_COOKIE_SECURE` (no solo
  `NODE_ENV`), compatibles con Desktop Host por HTTP;
- headers de seguridad progresivos (`X-Frame-Options`, `nosniff`, HSTS si la
  URL es https) y CSP por request con nonce (`script-src` + `strict-dynamic`
  vía `src/proxy.ts`);
- salida HTTP endurecida (`redirect: error` / `fetchSafeOutbound`) para PDF PJUD,
  Hermes y Obsidian;
- `instrumentation` falla al arrancar si flags peligrosas están en producción;
- registros de auditoría con actor, acción, entidad y cambios;
- aislamiento de Node en Electron mediante context isolation.
- atajos demo del login ocultos en builds de producción.

La revisión del repositorio también identifica límites que deben considerarse antes
de producción:

- el rate limit de login usa lockout progresivo y store local
  (`LEXOPEN_DATA_DIR/rate-limit.json`); en multi-instancia configure
  `REDIS_URL` / `RATE_LIMIT_REDIS_URL` o Upstash REST;
- Desktop Host enlaza `127.0.0.1` por defecto (LAN solo con URL pública),
  genera contraseña aleatoria de Postgres en instalaciones nuevas y rota el
  default legacy `lexopen` al arrancar;
- logout invalida la sesión (`sessionVersion`); descargas fuerzan `attachment`
  salvo MIME seguros; listados/búsqueda no devuelven cuerpos de archivo;
- el portal cliente no debe presentarse como estrictamente de solo lectura sin una
  revisión adicional de permisos;
- los campos de confidencialidad no equivalen a una implementación completa de
  privilegio abogado-cliente;
- la auditoría es de mejor esfuerzo: un fallo al persistirla no necesariamente
  bloquea la operación;
- no hay topología multi-Host ni alta disponibilidad; los backups automáticos
  locales son opcionales, requieren almacenamiento separado y no sustituyen una
  copia externa cifrada;
- la jurisprudencia y los plazos son datos/ayudas de demo, no fuentes oficiales;
- los documentos de facturación son control interno y no constituyen DTE electrónico
  ni integración con el SII;
- la integración live con PJUD es opt-in (partner API, sidecar scrape o
  Playwright+CAPTCHA / ClaveÚnica) y no es una API oficial del Poder Judicial;
- `LEXOPEN_OPEN_ACCESS`, `LEXOPEN_RELAX_CSRF`, `LEXOPEN_DEMO_SWITCHER`,
  `LEXOPEN_ALLOW_PLAINTEXT_PASSWORDS` y fallbacks demo de Hermes/PJUD no deben
  activarse en producción (varias de estas flags ya hacen fallar el arranque).

Estas limitaciones son parte del estado `0.1.4`, no un sustituto de un análisis de
seguridad, privacidad o cumplimiento para una organización concreta.

## 🧪 Desarrollo y pruebas

Scripts principales:

```bash
npm run dev            # Next.js con Turbopack
npm run lint           # ESLint
npm test               # pruebas de utilidades, contratos, smoke y desktop
npm run build          # Prisma generate + next build
npm run start          # servidor Next en modo producción
npm run desktop:test   # configuración del cliente Electron
npm run e2e:install    # descarga Chromium para las pruebas de navegador
E2E_DATABASE_URL=postgresql://lexopen:lexopen@127.0.0.1:5432/lexopen_e2e npm run e2e
```

`npm run e2e` reinicia y siembra la base indicada por `E2E_DATABASE_URL`; el
script rechaza hosts remotos y nombres de base que no incluyan `e2e` o `test`.
Use siempre una base local desechable. Playwright inicia un Next.js de prueba,
valida login staff, redirección del portal cliente y protección de rutas. El
workflow de GitHub Actions instala Chromium con sus dependencias y ejecuta
PostgreSQL 16, migraciones, tests, lint, build y E2E en cada push a `main` o
ramas `cursor/**`, y en pull requests.

Para cambios que afecten datos, permisos o integraciones:

1. agregue o actualice una prueba de contrato o integración;
2. ejecute `npm test`, `npm run lint` y `npm run build`;
3. revise manualmente los permisos de `admin`, `abogado`, `asistente` y `cliente`;
4. documente variables nuevas en `.env.example`.

## 🗂️ Estructura del repositorio

```text
.
├── src/
│   ├── app/                 # páginas Next.js y route handlers REST
│   ├── components/          # UI y formularios por dominio
│   └── lib/                 # dominio, auth, RBAC, integraciones y pruebas
├── prisma/
│   ├── schema.prisma        # modelo PostgreSQL
│   ├── migrations/          # migraciones versionadas
│   └── seed.ts              # corpus y usuarios demo
├── desktop/                 # shell Electron Host/Cliente
├── deploy/                  # systemd / launchd / Windows del Host local
├── docs/DESKTOP.md          # operación de la aplicación desktop
├── docs/WEB-HOST.md         # Host web 100% local
├── public/                  # assets públicos
├── .env.example             # configuración local de referencia
└── .github/workflows/ci.yml # validación continua
```

## 🤝 Contribuir

Las contribuciones son bienvenidas. Consulte [`CONTRIBUTING.md`](CONTRIBUTING.md)
antes de abrir un pull request.

En resumen:

1. cree una rama descriptiva;
2. mantenga en español la UI orientada al estudio;
3. no incluya secretos ni datos reales;
4. cubra cambios de dominio con pruebas;
5. describa en el PR los módulos afectados y las decisiones relevantes.

Para reportar un problema, incluya pasos reproducibles, entorno, logs sin secretos y
si el problema afecta a web, desktop, base de datos o una integración.

## 📄 Licencia

LexOpen se distribuye bajo [`AGPL-3.0-or-later`](LICENSE).
