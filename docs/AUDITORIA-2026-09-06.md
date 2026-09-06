# Auditoría LexOpen — 6 de septiembre de 2026

Base: `71376d0fbd1f721a2966cc98e96919a257a3f151` de `main`.
Rama: `codex/audit-consolidation`.

## Resultado y alcance

Inventario de 91 ramas y ocho PR abiertos, revisión de sus cambios y CI, pruebas unitarias, transacciones en PostgreSQL 16 y navegación Chromium con datos ficticios. Se conservó la identidad visual existente y se corrigieron componentes compartidos que afectan a todos los módulos.

GitHub rechazó integrar #85: **“New changes require approval from someone other than the last pusher.”** No se forzó main ni se modificaron sus protecciones. El consolidado requiere aprobación independiente. Los PR originales y las ramas se conservan.

## Decisión sobre PR

| PR | Decisión | Fundamento |
| --- | --- | --- |
| [#85](https://github.com/gabrielperezibacache/lexopen/pull/85) | Incorporado y ampliado | Secreto fuerte en todos los entornos; se elimina además la autenticación con ID sin firma en desarrollo. |
| [#86](https://github.com/gabrielperezibacache/lexopen/pull/86) | Reemplazado | Se agrupan notificaciones y marcadores en una transacción serializable con reintentos, para evitar duplicados y escrituras parciales. |
| [#87](https://github.com/gabrielperezibacache/lexopen/pull/87) | No incorporado | Sigue haciendo N actualizaciones; no elimina N+1. Su benchmark escribe en la base configurada y opera sobre toda la cartera monitorizada. |
| [#88](https://github.com/gabrielperezibacache/lexopen/pull/88) | Incorporado | Inserción masiva de reintentos PJUD, conservando deduplicación. |
| [#89](https://github.com/gabrielperezibacache/lexopen/pull/89) | Incorporado | Plantillas Prisma parametrizadas. Las consultas anteriores ya pasaban parámetros: no se afirma una inyección SQL demostrada. |
| [#90](https://github.com/gabrielperezibacache/lexopen/pull/90) | Incorporado y ampliado | Límite por usuario; carga de límites persistidos antes del primer intento; contraseña y auditoría atómicas. El contador de fallos no es un bloqueo previo a verificar la contraseña. |
| [#91](https://github.com/gabrielperezibacache/lexopen/pull/91) | Incorporado y ampliado | Encolado masivo; cron procesa pendientes antiguos y ejecución manual conserva su selección. |
| [#92](https://github.com/gabrielperezibacache/lexopen/pull/92) | Incorporado y acotado | Actualización agrupada; descartar jobs queda limitado a las causas seleccionadas y los contadores reflejan las escrituras. |

Los ocho PR tenían CI exitoso al revisarlos. Sus cifras de aceleración son de sus autores, no mediciones propias. Aprobar el consolidado incorpora las implementaciones seleccionadas; no es necesario integrar luego los originales por separado.

## Hallazgos corregidos

| Prioridad | Área | Corrección |
| --- | --- | --- |
| P1 | Autenticación | No se aceptan cookies sin firma ni secretos predeterminados, tampoco en desarrollo. |
| P1 | Contraseña | Cambio y auditoría se confirman o revierten juntos; versión de sesión evita sobreescritura concurrente. |
| P1 | Correo | Tres avisos altos en la cadena mailparser/html-to-text/deepmerge-ts; actualización compatible a mailparser 3.9.22, npm audit sin vulnerabilidades. |
| P1 | PJUD | Una selección vacía no se expande a toda la cola; limpieza limitada y operaciones masivas. |
| P1 | Plazos | Avisos internos y marcadores atómicos; ejecuciones concurrentes no duplican notificaciones; HTML variable escapado. |
| P1 | IA y fechas | Una fecha sin hora se interpretaba como UTC y podía desplazarse al día anterior en Chile. Conversión local probada en tres zonas horarias. |
| P1 | Menú móvil | Menú cerrado inerte, contenido aislado al abrir, foco restaurado al cerrar y adaptación al cambiar a escritorio. |
| P2 | Dashboard | Se distinguen tareas urgentes de tareas vencidas mediante su fecha real. |
| P2 | Búsqueda | Campo controlado, cancelación de respuestas antiguas, etiqueta, estado anunciado y límite de 200 caracteres. Fallback textual si FTS no encuentra resultados. |
| P2 | Formularios | apiMutation no presenta HTML/JSON inválido como guardado exitoso; mantiene respuestas 204 y normaliza errores. |
| P2 | Interfaz compartida | Acceso directo al contenido, aria-current, foco visible, objetivos táctiles de 44px, contraste de botones y movimiento reducido. |
| P2 | Recuperación | retry de Next.js vuelve a consultar el segmento; carga anunciada mediante role=status. |
| P3 | Documentación | Versión del encabezado alineada con package.json, secreto en desarrollo y prueba de integración documentados. |

## Cobertura

29 rutas: dashboard; espacios; clientes; causas; correo; minutas; facturación y sus seis subapartados; tareas; calendario; búsqueda; mensajes; flujos; personas; documentos; plazos; jurisprudencia; asistente; portal; integraciones; auditoría; configuración; notificaciones y cuenta.

La suite existente cubre staff/cliente, ACL del portal, conflicto de interés, mensajes, espacios, expedientes, correo, TOTP, wiki y alcance documental del asistente. Se añaden cinco pruebas E2E para apartados, móvil/teclado, búsqueda, cookies sin firma y límite de contraseña. Las pruebas nuevas reutilizan una sesión para no agotar artificialmente el límite de login.

## Interfaz: ámbito compartido

Capturas inspeccionadas: móvil de 390px y escritorio de 1440px. Detector Impeccable sin hallazgos en los archivos analizados. No equivale a certificar WCAG en todos los formularios.

| Dimensión | Puntuación | Alcance y límite |
| --- | ---: | --- |
| Accesibilidad | 3/4 | Foco, teclado y estados verificados; falta revisión exhaustiva con lector de pantalla. |
| Rendimiento | 3/4 | Consultas agrupadas y cancelación; sin ensayo de carga de producción. |
| Adaptación | 3/4 | Dos tamaños comprobados; no todos los dispositivos. |
| Tema | 2/4 | Tokens conservados; todavía hay estilos específicos y no se añade tema oscuro. |
| Integridad | 3/4 | Coherencia compartida; permanece deuda visual heredada. |
| Total | 14/20 | Bueno dentro del ámbito revisado. |

## Validación reproducible

- `npm test`: utilidades, contratos, correo, PJUD, IA, seguridad y Host.
- `npm run test:integration`, con `E2E_DATABASE_URL` local y desechable: rollback de notificaciones ante fallo del marcador, concurrencia sin duplicados y rollback de contraseña ante fallo de auditoría.
- `npm run lint`, `npx tsc --noEmit` y `npm run build`.
- `npm run e2e`: 21 pruebas Chromium, incluidas las cinco nuevas.
- `npm audit`: cero vulnerabilidades tras la actualización.
- La CI ejecuta también la prueba transaccional nueva.

## Límites explícitos

No se activaron scraping/ClaveÚnica, IA remota, Google, correo externo ni S3 con credenciales reales. No se certifica el calendario jurídico: conserva las aproximaciones documentadas. La atomicidad de auditoría añadida cubre contraseña; otras mutaciones heredadas con auditoría posterior requieren revisión individual. El email externo sigue siendo posterior a la transacción: sus fallos se contabilizan, pero no se incorpora una cola durable de reenvío. Ninguna prueba usa datos de producción.

## Inventario de ramas

67 detrás de main, una idéntica, ocho por delante y 14 divergentes. Las divergentes antiguas no se fusionan en bloque: contienen versiones anteriores de CRM, Drive, i18n, Host y navegación, además de documentación de un sitio separado. El inventario revisa ancestros y archivos; no afirma equivalencia de cada parche reescrito.

| Rama | Estado | Commits propios | Atraso |
| --- | --- | ---: | ---: |
| `cursor/automatic-local-backups-0916` | behind | 0 | 221 |
| `cursor/claveunica-error-interno-fc13` | behind | 0 | 88 |
| `cursor/claveunica-sidecar-fallback-fc13` | behind | 0 | 83 |
| `cursor/clone-install-not-dmg-fc13` | behind | 0 | 92 |
| `cursor/config-ia-endpoints-c03d` | behind | 0 | 173 |
| `cursor/copiloto-polish-f8fb` | behind | 0 | 150 |
| `cursor/correo-pjud-buzon` | behind | 0 | 12 |
| `cursor/correo-pjud-produccion-5da6` | behind | 0 | 8 |
| `cursor/crm-clientes-ia-3c94` | diverged | 5 | 308 |
| `cursor/crm-clientes-tramites-e1fd` | behind | 0 | 141 |
| `cursor/desktop-tailscale-3c94` | behind | 0 | 306 |
| `cursor/document-folder-ingest-f3b5` | behind | 0 | 187 |
| `cursor/google-drive-integration-2db0` | diverged | 1 | 144 |
| `cursor/google-drive-integration-e1fd` | behind | 0 | 141 |
| `cursor/hermes-obsidian-qa-f4ac` | diverged | 1 | 310 |
| `cursor/hermes-obsidian-readme-e1fd` | behind | 0 | 127 |
| `cursor/hide-next-dev-indicator-d33b` | diverged | 1 | 196 |
| `cursor/host-parity-crm-i18n-e1fd` | behind | 0 | 118 |
| `cursor/host-relax-csrf-f04e` | behind | 0 | 98 |
| `cursor/i18n-multiidioma-3c94` | diverged | 4 | 308 |
| `cursor/i18n-multiidioma-e1fd` | behind | 0 | 141 |
| `cursor/lexopen-estudio-confiable-f4ac` | diverged | 2 | 310 |
| `cursor/lexopen-madurez-estudio-f4ac` | behind | 0 | 311 |
| `cursor/lexopen-perfection-roadmap-f4ac` | behind | 0 | 313 |
| `cursor/lexora-highq-clone-9d5f` | behind | 0 | 317 |
| `cursor/llm-env-snippet-live-fc13` | behind | 0 | 84 |
| `cursor/llm-sse-json-parse-fc13` | behind | 0 | 87 |
| `cursor/local-production-host-d33b` | behind | 0 | 194 |
| `cursor/macos-unstyled-desktop-fc13` | behind | 0 | 93 |
| `cursor/mejora-progresiva-0b96` | behind | 0 | 28 |
| `cursor/mejorar-espacios-5da6` | identical | 0 | 0 |
| `cursor/mejoras-apartados-lexopen-9fcd` | behind | 0 | 308 |
| `cursor/minutas-drive-estudio-f4ac` | behind | 0 | 315 |
| `cursor/ocr-tesseract-path-fc13` | behind | 0 | 85 |
| `cursor/pasadas-desarrollo-3c94` | behind | 0 | 305 |
| `cursor/pia-site-lexopen-3c94` | diverged | 3 | 308 |
| `cursor/pjud-casetracking-f4ac` | diverged | 3 | 310 |
| `cursor/pjud-causamonitor-parity-f8fb` | behind | 0 | 200 |
| `cursor/pjud-monitoreo-causas-3c94` | behind | 0 | 307 |
| `cursor/pjud-scraping-warning-9de1` | behind | 0 | 141 |
| `cursor/playwright-host-chromium-fc13` | behind | 0 | 82 |
| `cursor/plazos-alertas-scheduler-e1fd` | behind | 0 | 122 |
| `cursor/prod-audit-f04e` | behind | 0 | 114 |
| `cursor/prod-check-f04e` | behind | 0 | 101 |
| `cursor/prod-hardening-f04e` | behind | 0 | 111 |
| `cursor/prod-hardening2-f04e` | behind | 0 | 109 |
| `cursor/prod-hardening3-f04e` | behind | 0 | 107 |
| `cursor/prod-hardening4-f04e` | behind | 0 | 105 |
| `cursor/production-render-d33b` | diverged | 2 | 196 |
| `cursor/readme-actualizar-app-f3b5` | behind | 0 | 178 |
| `cursor/readme-github-3c94` | diverged | 6 | 308 |
| `cursor/readme-independientes-f04e` | behind | 0 | 98 |
| `cursor/readme-reopen-host-fc13` | behind | 0 | 90 |
| `cursor/readme-showcase-0916` | behind | 0 | 269 |
| `cursor/release-0-1-5-0b96` | behind | 0 | 23 |
| `cursor/residuales-estudio-site-e1fd` | behind | 0 | 141 |
| `cursor/security-audit-followup-9b24` | behind | 0 | 177 |
| `cursor/security-audit-followup10-9b24` | behind | 0 | 127 |
| `cursor/security-audit-followup11-9b24` | behind | 0 | 119 |
| `cursor/security-audit-followup12-9b24` | behind | 0 | 115 |
| `cursor/security-audit-followup2-9b24` | behind | 0 | 169 |
| `cursor/security-audit-followup3-9b24` | behind | 0 | 167 |
| `cursor/security-audit-followup4-9b24` | behind | 0 | 163 |
| `cursor/security-audit-followup5-9b24` | behind | 0 | 147 |
| `cursor/security-audit-followup6-9b24` | behind | 0 | 145 |
| `cursor/security-audit-followup7-9b24` | behind | 0 | 143 |
| `cursor/security-audit-followup8-9b24` | behind | 0 | 141 |
| `cursor/security-audit-followup9-9b24` | behind | 0 | 139 |
| `cursor/security-audit-remediation-9b24` | behind | 0 | 187 |
| `cursor/standalone-static-copy-fc13` | behind | 0 | 91 |
| `cursor/update-available-banner-f3b5` | behind | 0 | 165 |
| `docs/uninstall-readme` | diverged | 1 | 79 |
| `feat/in-app-self-update` | diverged | 1 | 68 |
| `feat/optimize-pjud-queue-4190476176249964408` | ahead | 1 | 0 |
| `fix-hardcoded-session-secret-4581897184095595965` | ahead | 1 | 0 |
| `fix-insecure-queryrawunsafe-15171285673597264692` | ahead | 1 | 0 |
| `fix-password-rate-limit-13005693311971896259` | ahead | 1 | 0 |
| `fix/app-shell-viewport` | diverged | 1 | 82 |
| `fix/ci-appshell-lint` | diverged | 1 | 80 |
| `fix/claveunica-login-form` | behind | 0 | 65 |
| `fix/claveunica-mis-causas` | behind | 0 | 57 |
| `fix/env-example-doc-import-comment` | behind | 0 | 41 |
| `fix/mis-causas-524` | behind | 0 | 55 |
| `fix/ojv-buscar-visible` | behind | 0 | 53 |
| `fix/ojv-movimientos-rol` | behind | 0 | 51 |
| `perf-batch-plazos-updates-2905118617217962976` | ahead | 1 | 0 |
| `perf-fix-n-plus-one-2796244869912611503` | ahead | 1 | 0 |
| `perf/fix-sync-n1-query-16301535327751746278` | ahead | 1 | 0 |
| `perf/optimize-salas-updates-5126301811324687828` | ahead | 1 | 0 |
| `polish/lexopen-wave1` | behind | 0 | 62 |
