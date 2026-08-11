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
    <a href="#-inicio-r%C3%A1pido">Empezar</a> ·
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
- [Inicio rápido](#-inicio-rápido)
- [Usuarios y datos demo](#-usuarios-y-datos-demo)
- [Configuración](#-configuración)
- [Integraciones](#-integraciones)
- [Aplicación desktop](#-aplicación-desktop)
- [API](#-api)
- [Despliegue en Render](#-despliegue-en-render)
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
| **Búsqueda e inteligencia** | Búsqueda unificada de sites, causas, archivos, tareas, wiki, minutas y jurisprudencia; consola Hermes con aprobación humana. |
| **Facturación** | Horas, gastos, tarifas horarias, cuota litis, retainers, documentos internos de cobro, pagos y provisiones. |
| **Auditoría y acceso** | Sesiones firmadas, roles `admin`/`abogado`/`asistente`/`cliente`, filtros de confidencialidad y eventos de auditoría. |

### Capa Chile

Incluye utilidades para validar RUT, RIT y RUC, catálogos de tribunales y materias,
etapas procesales, días hábiles/calendario simplificados y valores UF. El motor de
plazos es una ayuda operativa: **no reemplaza el cómputo oficial del tribunal ni la
revisión de un abogado**.

Incluye también monitoreo de causas estilo CaseTracking con semáforos, timeline
clasificado, alertas y conectores PJUD partner API o demo/CSV etiquetados. No se
realizan scrapers ocultos ni se presenta el corpus demo como fuente oficial.

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
6. Probar **Jurisprudencia**, **Agente Hermes** e **Integraciones** para distinguir
   los datos demo de las conexiones externas reales.

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
| `npm run db:migrate` | Aplica las migraciones versionadas; es el comando apropiado para despliegues. |
| `npm run db:push` | Sincroniza el schema directamente; útil para prototipos locales, no sustituye migraciones. |
| `npm run db:seed` | **Borra el contenido existente y lo reemplaza por datos demo.** |
| `npm run db:reset` | Hace `db push --force-reset` y luego carga el seed; **destructivo**. |
| `npm run setup` | Ejecuta `db:push` y el seed; **destructivo si la base ya contiene datos**. |

> [!WARNING]
> No ejecute `db:seed`, `db:reset` ni `setup` sobre una base con información real.
> En producción use migraciones, respaldos y un procedimiento de carga controlado.

### Ejecutar en modo producción local

```bash
npm run build
npm run start
```

El servidor escucha en `0.0.0.0` y usa `PORT` (por defecto `3000`), por lo que
funciona tanto localmente como detrás de un proxy o en Render.

## 👥 Usuarios y datos demo

Todos los usuarios demo utilizan la contraseña `lexopen`:

| Email | Rol | Uso recomendado |
| --- | --- | --- |
| `socio@estudio.cl` | `admin` | Configuración, aprobación y visión completa del estudio. |
| `abogado@estudio.cl` | `abogado` | Causas, estrategia, minutas, documentos y colaboración. |
| `asistente@estudio.cl` | `asistente` | Tareas, documentos, plazos y apoyo operativo. |
| `cliente@andes.cl` | `cliente` | Recorrido del portal y contenido compartido. |

El selector de usuarios demo aparece en desarrollo o cuando
`LEXOPEN_DEMO_SWITCHER=1`. Desactívelo antes de cualquier uso real.

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
| `LEXOPEN_OPEN_ACCESS` | No | Bypass de autenticación únicamente fuera de producción; no lo habilite en un entorno real. |
| `LEXOPEN_RELAX_CSRF` | No | Relaja controles para CI; no lo habilite en producción. |
| `STORAGE_PATH` | No | Directorio local para archivos cuando no se configura S3. |
| `LEXOPEN_REQUIRE_PERSISTENT_STORAGE` | No | Con `1`, `/api/health` devuelve `503` si producción no tiene storage persistente. |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` | No | Bucket y endpoint de almacenamiento S3-compatible. |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | No | Credenciales del bucket S3-compatible. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | No | OAuth de Google Drive y Calendar. |
| `HERMES_API_URL`, `HERMES_API_KEY` | No | Endpoint y credencial de la API compatible con OpenAI. |
| `HERMES_ALLOW_DEMO` | No | Permite una respuesta local claramente marcada si Hermes no está disponible. |
| `PJUD_API_URL`, `PJUD_API_KEY` | No | Conector partner para sincronizar movimientos judiciales. |
| `PJUD_ALLOW_DEMO` | No | Permite movimientos PJUD simulados y etiquetados como demo. |
| `CRON_SECRET` | No | Protege la sincronización de cartera desde un scheduler externo. |
| `OBSIDIAN_VAULT_PATH` | No | Vault local para exportaciones en desarrollo. |
| `OBSIDIAN_REST_URL`, `OBSIDIAN_REST_TOKEN` | No | Obsidian Local REST API y token Bearer. |
| `LEXOPEN_DESKTOP`, `LEXOPEN_DATA_DIR`, `LEXOPEN_DESKTOP_MODE` | Desktop | Activan y configuran el modo Host/Cliente de Electron. |

No incluya secretos reales en commits. Para producción, genere un
`SESSION_SECRET` nuevo, use HTTPS/Tailscale y desactive todas las banderas demo.

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
no confidenciales. Puede escribir en un vault local durante el desarrollo, usar
Obsidian Local REST API o conservar los objetos mediante el backend de storage.

### Hermes Agent

Envía solicitudes a `POST {HERMES_API_URL}/chat/completions` con formato compatible
con OpenAI. Las respuestas se guardan como historial de chat y requieren aprobación
humana en el flujo de la aplicación. Con `HERMES_ALLOW_DEMO=1`, una respuesta local
de demostración se identifica explícitamente como tal.

Hermes no es asesoría jurídica automática: no presente ni envíe un texto generado sin
revisión del abogado responsable.

### Almacenamiento de archivos

El adaptador usa S3-compatible cuando están configuradas las credenciales mínimas;
en desarrollo o desktop puede escribir en `STORAGE_PATH` o `./storage`. En un web
service de producción, el backend local no se usa para evitar perder documentos:
configure S3, R2 u otro object storage persistente. En Render el filesystem local
es efímero.

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
| Integraciones | `/api/integrations/google`, `/api/integrations/obsidian`, `/api/integrations/hermes` |

Para explorar contratos concretos, consulte las route handlers y los schemas Zod
junto a cada módulo. Los ejemplos mutantes necesitan cookies de sesión y, según la
ruta, validación de origen; un `curl` anónimo no es una prueba válida de autorización.

## ☁️ Despliegue en Render

El archivo [`render.yaml`](render.yaml) define un Blueprint con:

- PostgreSQL 16 administrado;
- un web service Node;
- migraciones Prisma en el build;
- `npm run start`;
- health check en `/api/health`.

Flujo recomendado:

1. Cree un Blueprint desde este repositorio.
2. Configure las credenciales opcionales de Hermes, Google y S3 en Render.
3. Mantenga `HERMES_ALLOW_DEMO=0` y `LEXOPEN_DEMO_SWITCHER=0`.
4. Use object storage persistente para documentos y configure un dominio/TLS o una
   red privada apropiada.
5. Verifique migraciones, respaldos y permisos antes de abrir el servicio a usuarios.

El plan gratuito de Render puede suspender servicios inactivos y no constituye por
sí mismo una arquitectura de alta disponibilidad. El filesystem del web service es
efímero y no debe usarse como respaldo.

## 🔐 Seguridad y límites actuales

Controles implementados en el código:

- cookies de sesión `HttpOnly`, `SameSite=Lax` y `Secure` en producción;
- tokens de sesión firmados con HMAC y contraseñas con bcrypt;
- roles de servidor y filtros de contenido confidencial;
- cifrado AES-256-GCM de tokens Google cuando existe `SESSION_SECRET`;
- validación de origen en muchas operaciones mutantes;
- registros de auditoría con actor, acción, entidad y cambios;
- aislamiento de Node en Electron mediante context isolation.

La revisión del repositorio también identifica límites que deben considerarse antes
de producción:

- la protección CSRF no está aplicada de forma uniforme a todas las mutaciones;
- el rate limit de login es por proceso y no ofrece protección distribuida;
- el portal cliente no debe presentarse como estrictamente de solo lectura sin una
  revisión adicional de permisos;
- los campos de confidencialidad no equivalen a una implementación completa de
  privilegio abogado-cliente;
- la auditoría es de mejor esfuerzo: un fallo al persistirla no necesariamente
  bloquea la operación;
- no hay topología multi-Host, alta disponibilidad ni backups automáticos incluidos;
- la jurisprudencia y los plazos son datos/ayudas de demo, no fuentes oficiales;
- los documentos de facturación son control interno y no constituyen DTE electrónico
  ni integración con el SII;
- no hay integración de datos en vivo con PJUD ni con tribunales;
- `LEXOPEN_OPEN_ACCESS`, `LEXOPEN_RELAX_CSRF`, credenciales demo, compatibilidad de
  contraseñas en texto plano y el fallback demo de Hermes no deben activarse en
  producción.

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
```

La suite actual usa scripts ejecutables con `tsx` y assertions; no existe todavía
una suite de navegador Playwright/Cypress. El workflow de GitHub Actions ejecuta
PostgreSQL 16, `npm ci`, migraciones, tests, lint y build en cada push a `main` o
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
├── docs/DESKTOP.md          # operación de la aplicación desktop
├── public/                  # assets públicos
├── render.yaml              # Blueprint de despliegue Render
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
