# Consulta de causas OJV y seguimiento PJUD

## Consulta pública y Mis Causas

En **Causas → Cartera PJUD → Consultar en OJV**, escriba el RIT/ROL completo y el tribunal concreto. **Consultar movimientos** sólo lee: no crea una causa ni activa monitoreo. El resultado identifica la consulta, su fecha, el canal utilizado y una muestra con cuadernos. El número indica movimientos recuperados, sin certificar que la historia esté completa. Cambiar los criterios retira el resultado anterior.

**Agregar a mi cartera** es una acción independiente: crea o vincula el expediente existente, activa monitoreo y solicita sincronización. **Registrar sin consulta previa** conserva la alternativa de guardar los datos sin consultar la OJV. Revise la cartera antes de repetir un registro cuya respuesta se haya perdido. La búsqueda por RUT devuelve candidatos del alcance disponible en el formulario; actualmente está limitada por año y filtros, y no representa toda la cartera de una persona.

En **Causas → ClaveÚnica**, el ingreso manual permite entrar personalmente en la página oficial, consultar Mis Causas y elegir qué incorporar al estudio. Consultar el listado no registra causas. El acceso guardado del estudio permanece en un apartado desplegable separado: guardar esas credenciales y sincronizar siguen siendo acciones distintas, y guardarlas no prueba que la OJV las acepte. Los permisos efectivos del profesional controlan ambas vías; las respuestas privadas no se almacenan en caché. Un fallo inicial ofrece reintento, una lista vacía no se presenta como «todo al día» y las sincronizaciones parciales conservan su advertencia.

La configuración del canal y su disponibilidad real son estados diferentes. Los límites y comprobaciones de esta mejora están en la [entrega OJV del 3 de noviembre de 2026](ojv-2026-11-03/README.md), con capturas ficticias y pruebas reproducibles.

La [nueva comprobación de accesos oficiales](ojv-accesos-oficiales-2026-11-03/README.md) consiguió consultar un expediente público real y buscar en Mis Causas tras el ingreso manual del profesional. Documenta el cuaderno y la materia verificados, sus límites y la diferencia con una ejecución del conector automático. La [primera comprobación](ojv-validacion-real-2026-11-03/README.md) conserva los fallos observados anteriormente.

La [validación de sincronización automática](ojv-sincronizacion-automatica-2026-11-03/README.md) completó el conector, la cola y el guardado en una base temporal, tanto en la consulta pública real como en Mis Causas después del ingreso manual. La repetición de ambos recorridos confirmó que no se duplicaron movimientos, con el cuaderno y la materia documentados.

La [ampliación de interfaz y cuadernos](ojv-interfaz-2026-11-03/README.md) documenta el nuevo recorrido manual, sus capturas ficticias, una lectura pública real de tres cuadernos y la importación desde la interfaz pública en una base aislada: 510 movimientos y una repetición sin nuevos duplicados. El nuevo puente de ingreso privado desde la interfaz todavía requiere su comprobación; las validaciones anteriores del conector no la sustituyen.

## Ingreso manual desde la interfaz

Esta vía requiere abrir LexOpen desde el propio **Host**, mediante `localhost`, `127.0.0.1` o `::1`. Para el Host web active `PJUD_MANUAL_SESSION=1`; Desktop en modo Host también la habilita. Requiere `PJUD_PUBLIC_SCRAPE=1`, Playwright/Chromium y un navegador con ventana visible. En Linux necesita `DISPLAY` o `WAYLAND_DISPLAY`. `PJUD_CLAVEUNICA_SCRAPE=0` impide el ingreso manual aunque los demás requisitos estén presentes. Acceder desde otro equipo por LAN o Tailscale no habilita esta ventana local.

1. Pulse **Ingresar con ClaveÚnica** y complete personalmente la identificación y las confirmaciones del portal en la ventana oficial.
2. En LexOpen, consulte **Mis Causas**, para todas las materias disponibles o una materia concreta. Revise el listado, busque y seleccione hasta **20 causas por grupo**. La selección se conserva al filtrar o cambiar de página.
3. Pulse **Importar**. LexOpen vuelve a comprobar la selección en OJV, crea o vincula las causas elegidas y consulta sus cuadernos. El resultado distingue causas creadas o vinculadas, lecturas completas, parciales y fallidas.
4. **Continuar con otras causas** vuelve al paso de revisión y conserva el recibo anterior en un desplegable. Puede importar varios grupos mientras siga vigente la conexión.

Sólo hay una ventana manual activa por Host. La conexión dura como máximo **30 minutos** y pertenece al profesional y a su sesión concreta de LexOpen: se comprueban la identidad, la huella de la cookie, la versión y el vencimiento de sesión, los permisos vigentes de Mis Causas y la política de doble factor. Otra sesión de LexOpen no puede utilizar su conexión; las pestañas que comparten la misma sesión pueden consultar su estado.

La contraseña se escribe sólo en el formulario oficial. En esta vía no se envían contraseñas ni cookies OJV a la interfaz ni se guardan en el vault; el contexto temporal del navegador queda en el Host. La interfaz recibe identificadores opacos de las causas verificadas, estados y resultados. `GET /api/pjud/manual-session` consulta el estado; `POST` acepta únicamente `start`, `list`, `import` y `close`, con permisos, protección CSRF y límites por profesional.

Cerrar la conexión, vencer el plazo, perder autorización o reiniciar el Host impide seguir usando esa sesión temporal. Al salir de la página se detiene la consulta de estado y se cierra una conexión de lectura; una importación ya aceptada continúa en el Host dentro de su plazo. **Detener y cerrar conexión** puede dejar causas ya guardadas: revíselas antes de reintentar. La importación manual no descarga anexos PDF.

## Cobertura por cuaderno y recuperación

La consulta pública y el detalle autenticado intentan leer todos los cuadernos que OJV enumera. La consulta por RIT/ROL, el resultado de importación, la cartera y el expediente muestran esa cobertura:

| Estado | Qué permite afirmar |
| --- | --- |
| **Todos los cuadernos consultados** | Se leyeron todos los cuadernos enumerados en esa consulta. No certifica la integridad jurídica del expediente. |
| **Hay cuadernos pendientes** | Hubo fallos, filas incompletas, un cambio de listado o un límite. Los movimientos recuperados se conservan; hay que volver a sincronizar. |
| **Cuadernos sin comprobar** | El proveedor o la respuesta no permitió enumerarlos de forma verificable. |

La cobertura queda como JSON en la causa y en cada trabajo de sincronización (`pjudCuadernosCoverage`), con clave estable, etiqueta, estado y cantidad por cuaderno. Las claves se derivan del código o etiqueta del cuaderno; nunca de los JWT o valores temporales del selector OJV. Los movimientos anteriores sin atribución se conservan en un grupo separado y no se asignan a Principal por suposición. Una repetición usa la identidad de movimiento y cuaderno para evitar duplicados; una coincidencia histórica inequívoca conserva su fila, notas y documento.

Los límites son **10.000 movimientos por causa, 100 cuadernos y 20 MiB por respuesta transportada**. Si no puede completarse la lectura dentro de esos límites o la paginación del portal no puede comprobarse, la lectura queda parcial. No se representa como éxito completo un historial truncado o una página repetida.

Los trabajos pendientes de una conexión temporal se reservan con `trigger: manual-session`. El cron y el reintento ordinario no los procesan con otro proveedor ni los reclaman como trabajos comunes. Al vencer la reserva de treinta minutos quedan fallidos y necesitan un nuevo ingreso para recuperarse; un parcial o fallo de esta vía tampoco se convierte silenciosamente en actualización automática. Una lectura explícita posterior satisfactoria libera esa retención. Después de un resultado correcto, futuras actualizaciones pueden programarse según los canales y la configuración del Host. La conexión temporal no mantiene acceso privado permanente ni acredita un servicio de lectura las veinticuatro horas.

## Principio: host local, APIs externas OK

**Local** = dónde corre LexOpen y dónde se guardan datos/secretos (self-hosted).
**No** implica “cero red”: puede llamar APIs externas mientras el *host* de la
app (Postgres, vault ClaveÚnica, cola, sidecar) sea el suyo — no CausaMonitor
SaaS ni otro backend ajeno que custodie su cartera.

| Qué | Dónde |
|-----|--------|
| App, Postgres, `PjudSyncJob`, digest, vault ClaveÚnica | **Su host local** (`web:host` / desktop) |
| Consulta OJV / ClaveÚnica gob / CAPTCHA solver / partner API / Gmail | **APIs externas permitidas** (salida de red) |
| Sidecar Playwright | Mismo despliegue o `localhost` / red privada suya |
| CSV | Offline respecto de OJV; útil como respaldo |

Orden de ingest práctico: sidecar → scrape in-process → partner API → demo/CSV.
Partner y CAPTCHA son llamadas externas válidas; lo que no se usa es un *host*
externo para LexOpen mismo.

LexOpen toma como referencia el **modelo operativo** de CausaMonitor
(`app.causamonitor.com` + `api.causamonitor.com`), no el flujo MCP de
`mcp-legal-chile` (sin prueba de producción).

## Arquitectura de referencia (CausaMonitor, inspeccionada)


| Pieza | CausaMonitor | LexOpen |
|-------|--------------|---------|
| UI | Next.js (`app.causamonitor.com`) | Next.js LexOpen |
| API casos | `GET /api/cases`, sync autenticado | `/api/causas/monitoreo`, `/api/pjud/*` |
| Cola | Redis (Bull-style: waiting/active/completed/failed/delayed) | Postgres `PjudSyncJob` |
| Worker | Proceso con **concurrency 5** (`/api/health`) | Sidecar Playwright + `processPendingSyncJobs` (`PJUD_SYNC_CONCURRENCY`, default **5**) |
| Stats cola | `GET /api/queue/stats` (público) | `GET /api/pjud/queue` (staff) + Host status |
| Digest | `POST /api/cron/digest` | `POST /api/pjud/digest` |
| Auth datos | Supabase Auth | Sesión LexOpen |
| Acceso OJV | **Doble vía:** invitado **y** ClaveÚnica (`/api/pjud-credentials`, `/api/cases/mis-causas`) | Mismo: guest OJV + ClaveÚnica cifrada en vault local (`FirmSettings`) |

Flujo producto CausaMonitor (marketing + API):

1. Alta por ROL / CSV / RUT empresa (consulta pública / invitado)
2. Opcional: guardar ClaveÚnica cifrada → Mis Causas
3. Worker escanea de madrugada (cola + concurrency)
4. Resumen ~08:00 + PDF backup + receptor / escritos / salas

## Dos vías de acceso OJV (paridad CausaMonitor)

CausaMonitor **no** usa solo invitado. La API expone:

| CM | LexOpen |
|----|---------|
| `POST` / `DELETE` `/api/pjud-credentials` | `POST /api/pjud/claveunica` (`save` / `clear`) |
| `GET /api/pjud-credentials/status` | `GET /api/pjud/claveunica` |
| `GET /api/cases/mis-causas` | `GET`/`POST /api/pjud/mis-causas` |

1. **Invitado (público):** consulta ROL/RUT sin login — cartera por ROL/CSV/RUT.
2. **ClaveÚnica:** credenciales del estudio cifradas **en reposo local** (AES-256-GCM) → login OJV → listado Mis Causas → monitoreo.

El FAQ de marketing de CM enfatiza que el monitoreo público no *exige* entregar clave; eso coexiste con el vault de credenciales PJUD en su API.

## Scrape OJV — vía invitada

Misma familia DOM que scrapers de campo `consulta_causas_pjud`:

1. Entrada pública oficial `includes/sesion-consultaunificada.php` → formulario de `indexN.php` como invitado
2. Tab `#BusJuridica` (RUT) o tab ROL/RIT
3. `#jurCompetencia` + `#jurTribunal` / `#corteJur`
4. Buscar visible (no forzar `#btnConConsultaJur` oculto en otra pestaña) → espera loaders `#loadPreJuridica` / `#loadPreCausa`
5. Filas `#verDetalleJuridica` → modal `.modal.in` (`table.table-titulos`, historia, e-book)

Sesión CAPTCHA reutilizable + presupuesto diario de solves (operación a escala tipo worker).  
**No** usar heurísticas MCP no validadas como fuente de verdad del DOM.

Kill switches, presupuesto CAPTCHA diario y cache TTL (`PJUD_CAUSAS_CACHE_TTL_MS`) aplican. Resultados = integridad *candidate*.

## Scrape OJV — vía ClaveÚnica

1. Admin guarda RUT + password → `encryptSecret` (AES-256-GCM, prefijo `enc:v2:`) en `FirmSettings.claveUnicaPasswordEnc`
2. Clave: `PJUD_SECRETS_KEY` (recomendado) o fallback `SESSION_SECRET`
3. Sync Mis Causas desencripta solo en servidor / sidecar, nunca expone plaintext por API
4. Login OJV vía ClaveÚnica → parsea Mis Causas → encola sync de movimientos

Kill switch: `PJUD_CLAVEUNICA_SCRAPE=0` bloquea. Si la variable está ausente,
guardar credenciales en Mis Causas es el opt-in. `=1` fuerza el permiso. El Host
suele dejar `PJUD_SCRAPER_URL=http://127.0.0.1:8787` aunque el sidecar no esté
corriendo: el sync cae a scrape in-process.

## Orden de ingest al sincronizar

1. `PJUD_SCRAPER_URL` (sidecar en su host / red privada)
2. **Detalle autenticado Mis Causas / ClaveÚnica** (si hay opt-in y sesión OJV)
3. Scrape invitado in-process (`PJUD_PUBLIC_SCRAPE=1` + Playwright/Chromium; solver sólo ante un CAPTCHA visible)
4. `PJUD_API_URL` (partner API externa — permitida)
5. Demo (`PJUD_ALLOW_DEMO`)
6. CSV / webhook

Sin ingest live en producción el sync es **fail-closed** (no inventa datos).
El scrape invitado **falla** si el tribunal o el RIT no coinciden (no abre otra causa).

## Kill switches (obligatorios para scrape)

| Variable | Efecto |
|----------|--------|
| `PJUD_PUBLIC_SCRAPE=1` | Habilita scrape OJV in-process |
| `PJUD_CAPTCHA_AUTO_SOLVE=0` | Se detiene ante un CAPTCHA visible antes de capturarlo o usar un solver. Ausente conserva el comportamiento habitual. |
| `PJUD_AUTO_CONFIRM_PROMPTS=0` | No confirma avisos del portal. El cierre de un detalle reconocido no acepta términos ni avisos. |
| `PJUD_DOC_DOWNLOADS=0` | Impide descargas de documentos tanto en el scrape como en el respaldo posterior. Prevalece sobre `PJUD_PDF_BACKUP`. |
| `CAPTCHA_SOLVER_PROVIDER` + `CAPTCHA_SOLVER_API_KEY` | Elegible: `nopecha` (free tier) \| `2captcha` \| `capsolver` \| `anticaptcha` \| `capmonster` \| `solvecha`. Key opcional solo en `nopecha`. |
| `PJUD_SCRAPER_URL` | Microservicio local (`POST /causas/lookup`, `/mis-causas`, `/causas/buscar`). Típico: `http://127.0.0.1:8787` |
| `PJUD_SCRAPER_ALLOW_PRIVATE=1` | Permite sidecar en localhost / red privada del Host |
| `PJUD_CLAVEUNICA_SCRAPE` | Ausente: opt-in al guardar credenciales en Mis Causas. `=1` permite. `=0` bloquea. |
| `PJUD_MANUAL_SESSION=1` | Opt-in para ingreso personal en el Host web local. Desktop en modo Host también lo habilita; requiere scrape público activo y navegador visible. `PJUD_CLAVEUNICA_SCRAPE=0` lo bloquea. |
| `PJUD_SECRETS_KEY` | Vault AES-256-GCM local para password ClaveÚnica (fallback: `SESSION_SECRET`) |
| `PJUD_CAUSAS_DAILY_SOLVE_BUDGET` | Tope diario de CAPTCHA (default 50) |
| `PJUD_SYNC_CONCURRENCY` | Parallelismo del worker de cola (default **5**, como CM) |
| `PJUD_SYNC_INTERVAL_MINUTES` | Intervalo `pjudNextSyncAt` tras sync OK (default **240** = 4h) |
| `PJUD_PDF_BACKUP` | Tras sync: URL `documentoRef` → `Documento`. Default **on** si `PJUD_PUBLIC_SCRAPE=1` (ponga `=0` para apagar). Preferible: PDF capturados en el scrape con cookies OJV. |
| `PJUD_DOC_DOWNLOAD_DELAY_MS` | Pausa entre descargas secuenciales (botón en ficha + scrape). Default `2500`, máx. `30000`. |
| `PJUD_DOC_DOWNLOAD_MAX` | Máximo de PDFs por corrida de import/scrape. Default `20`, máx. `50`. |
| `CRON_SECRET` | Autoriza crons (`x-cron-secret`) |

Sin `PJUD_PUBLIC_SCRAPE=1` (o sidecar), LexOpen **no** scrapea OJV. La falta de solver no impide consultar un formulario que no muestre CAPTCHA; si aparece un desafío sin solución habilitada, se informa el fallo.
ClaveÚnica además requiere opt-in en Mis Causas (o `PJUD_CLAVEUNICA_SCRAPE=1`).
Si `PJUD_PUBLIC_SCRAPE=1` pero falta Playwright/Chromium, el scrape falla con error claro (no cae a demo en prod).

## Setup recomendado (host local)

Opción recomendada: **sidecar Playwright + solver CAPTCHA** en el mismo host
que LexOpen. El web habla con `127.0.0.1:8787`; CAPTCHA/OJV son APIs externas.

```bash
# 1) Una vez (paquete npm + binario Chromium)
npm ci
npm run pjud:chromium
# Debian/Ubuntu: npx playwright install-deps chromium

# 2) Sidecar (valida CAPTCHA y espera /health)
npm run pjud:host
# opcional: npm run pjud:host -- --with-web
# solo validar env: npm run pjud:host:check

# 3) App (otra terminal, si no usó --with-web)
npm run web:host   # o npm run dev

# 4) Smoke online (browser + OJV + salas; no requiere CAPTCHA para pasar)
npm run pjud:online
```

El launcher usa Chromium de Playwright y, si falta el binario, **Google Chrome
del sistema** (`channel: chrome`). `pjud:online` reporta `guestEntry` /
`captchaLikely` en OJV y si `salas.pjud.cl` está restringido (en muchos hosts
responde “acceso restringido”; entonces pegue HTML en `/api/pjud/salas` o use
`demo: true` / `source: "live"` cuando el portal abra).

### Validación de la sincronización completa

`pjud:online` comprueba conectividad y formularios; no acredita importación, cola ni persistencia. El diagnóstico opt-in `npm run pjud:sync:validate -- public` ejecuta el conector real, registra la causa pública documentada, procesa sus trabajos y repite la consulta sin caché para comprobar que no se dupliquen movimientos. Requiere una base local nueva de pruebas, sin usuarios ni credenciales, y directorios temporales privados. Rechaza bases remotas o de producción, proveedores alternativos y descargas habilitadas.

Después de una comprobación pública satisfactoria en esa misma base, `npm run pjud:sync:validate -- mis-causas` abre una ventana temporal para que el profesional entre personalmente en el formulario oficial PJUD. Al completar el ingreso, LexOpen continúa con la lectura de Mis Causas, importación y sincronización de una causa de Corte Suprema, y repite la lectura para comprobar persistencia e idempotencia. No copia la sesión del navegador habitual ni guarda credenciales. La ventana se cierra al terminar, cancelar o vencer su plazo; el límite total es de 30 minutos.

El diagnóstico exige `LEXOPEN_PJUD_LIVE_VALIDATION=1`, `DATABASE_URL=E2E_DATABASE_URL` de una base local de pruebas, `PJUD_PUBLIC_SCRAPE=1`, `PJUD_CAUSAS_CACHE_TTL_MS=0` y los siguientes valores en `0`: `PJUD_ALLOW_DEMO`, `HERMES_ALLOW_DEMO`, `PJUD_CAPTCHA_AUTO_SOLVE`, `PJUD_AUTO_CONFIRM_PROMPTS`, `PJUD_DOC_DOWNLOADS` y `PJUD_PDF_BACKUP`. Las rutas `LEXOPEN_DATA_DIR` y `STORAGE_PATH` deben estar dentro de la misma carpeta temporal privada. Los informes se escriben con permisos restringidos en `LEXOPEN_DATA_DIR/reports`; los autenticados omiten identificadores y recuentos privados exactos. Es una herramienta local de comprobación independiente del nuevo ingreso manual de la interfaz; no crea un programador de sincronizaciones.

Variables mínimas del web (también las imprime `pjud:host`):

```dotenv
PJUD_SCRAPER_URL=http://127.0.0.1:8787
PJUD_SCRAPER_ALLOW_PRIVATE=1
PJUD_SCRAPER_KEY=<misma que el sidecar>
PJUD_PUBLIC_SCRAPE=1
CAPTCHA_SOLVER_PROVIDER=nopecha   # free tier; o 2captcha|capsolver|anticaptcha|capmonster|solvecha
CAPTCHA_SOLVER_API_KEY=           # opcional en nopecha; requerida en los demás
PJUD_ALLOW_DEMO=0
```

### Proveedores CAPTCHA (BYOK)

LexOpen no vende solves: el estudio elige proveedor. Catálogo en
`captchaSolverStatusPublic()` / health del sidecar.

| Provider | Free tier | Key |
|----------|-----------|-----|
| `nopecha` | ~100/día, IP residencial | Opcional |
| `2captcha` | No (depósito mínimo) | Sí |
| `capsolver` | A veces créditos de prueba | Sí |
| `anticaptcha` | No | Sí |
| `capmonster` | No | Sí |
| `solvecha` | No (solo imagen/texto) | Sí |

Fallback (recomendado en VPS/cloud donde NopeCHA free falla):

```dotenv
CAPTCHA_SOLVER_PROVIDER=nopecha
CAPTCHA_SOLVER_FALLBACK=2captcha
CAPTCHA_SOLVER_FALLBACK_API_KEY=...
```

Estado en UI: Monitoreo, Host status, Integraciones (`GET /api/pjud/captcha`).
Sin CAPTCHA configurado: CSV / demo / partner API siguen disponibles (app gratis).

## Sidecar de referencia (in-repo)

```bash
npm run pjud:host      # recomendado (check CAPTCHA + health)
npm run pjud:scraper   # solo el HTTP server
# o: node scripts/pjud-scraper-worker.mjs
```

Endpoints: `GET /health`, `POST /causas/lookup`, `POST /mis-causas`, `POST /causas/buscar`,
`POST /online/probe`, `POST /salas/fetch`.

`GET /health` reporta `workerRunning` / `scrapeReady` / `captcha` (análogo a CM `workerRunning`).
`POST /online/probe` (auth Bearer) valida browser + OJV guest + salas sin gastar CAPTCHA en lookup.

El sidecar se ejecuta en el mismo Host: `npm run pjud:chromium` (una vez) y
`npm run pjud:host`. En el web configure `PJUD_SCRAPER_URL=http://127.0.0.1:8787`,
`PJUD_SCRAPER_ALLOW_PRIVATE=1` y la misma `PJUD_SCRAPER_KEY`.

## Cron / cola

- `POST /api/causas/monitoreo` encola causas con `pjudMonitoreoActivo` y `pjudNextSyncAt` null/`<= now` (dedupe si ya hay pending/running), reclama jobs stuck en `running`, luego procesa `PjudSyncJob` pending → running → ok/failed con concurrency `PJUD_SYNC_CONCURRENCY`.
- `GET /api/pjud/queue` → stats estilo CM (`waiting`/`active`/`completed`/`failed`/`delayed`).
- Fallos aplican **backoff** exponencial sobre el intervalo base (`pjudFailCount`).
- Retry fallidos: `action: retry-fallidos` re-encola fallidos y parciales ordinarios; los de `manual-session` requieren recuperar el ingreso manual como se explica arriba.
- Host local (`scripts/web-host.mjs`): programe con `PJUD_SYNC_INTERVAL_MINUTES=240`,
  `PJUD_MIS_CAUSAS_INTERVAL_MINUTES` y `PJUD_DIGEST_INTERVAL_MINUTES` (p. ej. digest
  cercano a las 08:00 del Host) más `CRON_SECRET`.

## Correo PJUD (solo `pjud.cl` → carpetas)

Bandeja en `/correo`. Cada profesional conecta **su** Gmail, Outlook/Hotmail o IMAP.
LexOpen **no** reutiliza el token Google del estudio (`gmail.send` / Drive / Calendar).

| Proveedor | Cómo |
|-----------|------|
| Gmail | OAuth `gmail.readonly` (`GOOGLE_CLIENT_ID/SECRET` + `GOOGLE_MAIL_REDIRECT_URI`) o IMAP `imap.gmail.com` con contraseña de aplicación |
| Outlook / Hotmail | Microsoft Graph `Mail.Read` (`MICROSOFT_CLIENT_ID/SECRET` + `MICROSOFT_REDIRECT_URI`). IMAP básico de Outlook está muerto |
| IMAP genérico | Gmail / Yahoo / iCloud / host propio (`assertImapHostAllowed`; sin localhost ni Outlook) |

Pipeline: sync incremental → filtro From/Reply-To/Return-Path `@pjud.cl` / `*.pjud.cl` → MIME (`mailparser`) → RIT → auto-archivo:

- `Documento` con `ruta: "correo/pjud"`
- carpeta **Correo PJUD** del Espacio de la causa (`SiteFile`)
- `pushDocumentoToDrive` si la causa tiene carpeta Drive real

Sin RIT o causa no visible: queda en bandeja (`nuevo`) para vincular a mano. Pegar texto es vía excepcional (no exige remitente pjud.cl).

Cron Host: `MAIL_SYNC_INTERVAL_MINUTES=15` + `CRON_SECRET` → `POST /api/mail/sync`. Solo cuentas `connected`; no inventa correo.

## Digest email (~08:00 Santiago)

- `POST /api/pjud/digest` (cron secret o staff)
- Secciones estilo CausaMonitor: **Receptor**, **Escritos por resolver**, **Movimientos** + causas rojo sin novedad
- Causas sin abogado se enrutan a admins/staff
- Envía vía Gmail API si Google está conectado (`gmail.send`); si no, solo notificaciones in-app
- Estado en Host status (`FirmSettings.pjudDigestLast*` + cola pending/running)

## Backup PDF

Con scrape activo, tras sync se importan anexos OJV como `Documento` (preferencia: bytes capturados con la sesión Playwright; fallback `fetch` si `PJUD_PDF_BACKUP` lo permite). El movimiento queda con `doc:<id>`; la ficha muestra **Ver / descargar** y **Revisar con IA**.

En la ficha de causa (timeline PJUD y expediente), **Importar documentos PJUD** descarga anexos en cola **secuencial** (pausa `PJUD_DOC_DOWNLOAD_DELAY_MS`, tope `PJUD_DOC_DOWNLOAD_MAX`) y los **persiste de inmediato** como `Documento` (`doc:<id>`), listos para Ver/descargar e IA. La asociación exige identidad de movimiento y cuaderno compatibles; un folio aislado no basta. Sólo se descargan enlaces identificados en su fila; el eBook completo no se atribuye a un folio. Los pendientes avanzan hacia documentos más antiguos sin quedar bloqueados por los ya importados. El bloqueo de esta importación es por proceso; está pensado para una única instancia Host.

Los identificadores nuevos distinguen cuadernos. Cuando un identificador anterior coincide de forma inequívoca con el mismo cuaderno, se actualiza en la fila existente conservando el ID interno, sus notas y la referencia documental. No se adivina un cuaderno desconocido ni se eliminan documentos anteriores.

## Programación de salas

Paridad CausaMonitor (tablas de Cortes):

- `src/lib/pjud/salas.ts` — parse HTML de tabla + match por RIT contra cartera
- Campos `Causa.proximaTabla` / `proximaTablaNota`
- Fixture/demo offline en tests de seguimiento

## Alta rápida / CSV cartera


- UI en `/causas/monitoreo` (panel ROL / RUT + **Importar/Exportar CSV**)
- API `POST /api/pjud/lookup` con `action: add-rol | preview-rol | buscar-rut`
- CSV: `GET /api/causas/monitoreo?format=csv` · `POST` `action: import-cartera` con `{ csv }`
- Header: `rit,tribunal,titulo,ruc,materia`

## ClaveÚnica (vault local cifrado)

Paridad con CausaMonitor `/api/pjud-credentials` (+ Mis Causas):

- UI: `/causas/mis-causas` (admin guarda RUT/password)
- Almacenamiento **local cifrado** en Postgres (`FirmSettings.claveUnicaPasswordEnc`), AES-256-GCM (`enc:v2:…`) con **`PJUD_SECRETS_KEY`** (fallback `SESSION_SECRET`)
- Status sin plaintext: RUT enmascarado + `hasPassword`
- Sync: `POST /api/pjud/mis-causas` (también vía `x-cron-secret`). Desde la UI responde **202** y corre en background (evita Cloudflare **524** ~100s); la UI consulta `GET` hasta salir de `running`. Cron espera el resultado. Solo encola movimientos (`processJobsInline` off); el worker de monitoreo los procesa.
- Importa causas, marca `pjudFromMisCausas` / `pjudSource: claveunica` y encola sync de movimientos

La vía invitada sigue disponible para alta por ROL/RUT sin credenciales.

## Sidecar contrato

```http
POST /causas/lookup
{ "rit": "C-100-2024", "tribunal": "1º Juzgado Civil de Santiago" }

POST /mis-causas
{ "rut": "12.345.678-9", "password": "…" }
```

Respuesta lookup: mismo shape que partner API (`movimientos[]` con cuaderno/folio/receptor/`documentoRef`).

## Riesgos

- PJUD no publica API de causas; el scrape elude WAF/CAPTCHA (ToS).
- Custodiar ClaveÚnica implica riesgo de seguridad: use cuenta del estudio, rotación, y preferir sidecar aislado.
- Resultados scrape = integridad *candidate*; verifique en el portal oficial antes de actuar.

## CSV / webhook

Siguen disponibles como respaldo (ver `docs/WEB-HOST.md`).
