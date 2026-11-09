# Integración de ramas y versión 1.1.0-preview.9 — 2026-11-09

Inventario inicial frente a `main` `22988fe717f1dae42960b1876089ba39ee398272`. Se consultaron todos los PR devueltos por GitHub (266: 202 fusionados, 59 cerrados, 5 abiertos), 142 referencias locales/remotas y los commits exclusivos de las ramas pendientes. 91 referencias ya eran ancestros de `main`; las 51 restantes incluyen duplicados locales/remotos, ramas sustituidas y los cinco PR vigentes. Los números reflejan esa fotografía inicial, antes de integrar.

## Decisión de integración

- #277: Google compartido para todo el estudio, Organización y carpetas por cliente/causa/espacio/usuario. Se separaron los paneles de preparación y documentos para que sus estados accesibles no se mezclen.
- #281: jornada, vencidos de todos los meses y búsqueda de apartados/ajustes. La jornada se pliega inicialmente en móvil para conservar visibles editor, Adjuntar y Enviar; los datos se consultan en el servidor con los permisos del usuario.
- #278 y #279: setup-python/setup-go v7. #280: lock vigente de tipos React, ESLint y Tailwind. Se preservan sus commits al integrarlos en la rama de versión.
- Se mantiene la versión canónica ya preparada `1.1.0-preview.9` en aplicación y Desktop. La etiqueta y los instaladores sólo se publican después de las comprobaciones requeridas.

## Por qué no se fusionan indiscriminadamente las ramas históricas

Las ramas cerradas conservan propuestas útiles pero parten de bases anteriores a los controles actuales. Que `git cherry` muestre un parche distinto no implica que falte su función: varios cambios se incorporaron mediante squash o se reescribieron. Se revisaron los archivos afectados y se contrastaron estos grupos:

| Grupo | Evidencia en el código vigente | Decisión |
| --- | --- | --- |
| Bolt: facturación y saldos | `src/lib/billing-overview.ts`: `loadScopedLedgerBalances` usa `groupBy` con `ledgerAccessWhere`; los saldos visibles se reconstruyen por movimientos autorizados. | Conservar la agregación SQL y el muro ético; recuperar el último saldo almacenado podría incluir causas ocultas. |
| Bolt: archivos de espacios | `src/app/(app)/sites/[id]/archivos/page.tsx` consulta sitio, carpetas y archivos mediante `Promise.all`. | Objetivo ya cubierto. |
| Palette: paneles y filtros | `SitesGuidePanel`, `SiteSettingsPanel` tienen `aria-expanded`/`aria-controls`; `CausasFilters` tiene etiquetas asociadas. | Objetivo ya cubierto. |
| Palette: equipo y tareas | `CausaEquipoPanel` tiene grupo de acceso, botones con `aria-pressed`, nombres de persona y carga por acción; `TaskStatusButton` libera el estado en `finally` y conserva idempotencia/concurrencia. | Objetivo ya cubierto con más controles. |
| Sentinel: claves de minutas | `MinutaWizard` usa `crypto.randomUUID()`. | No restaurar la implementación antigua. |
| Sentinel #238: `operationKey` | Son identificadores de idempotencia, no credenciales; el servidor comprueba identidad, permiso y huella de la petición. Hay prueba explícita para HTTP LAN sin WebCrypto. | Rechazar el cambio que introduce una excepción y rompe formularios en ese entorno. |
| Roles #202 | `can`, `CausaMiembro`, `Delegacion`, `Aprobacion`, `Task`, grants/revokes y pruebas de límites ya existen. La rama antigua relaja 2FA para pruebas. | Conservar la implementación y la política vigentes. |
| Notificaciones #203 | `MensajeSaliente`, `Job`, preferencias, notificaciones y proveedores ya existen. | No duplicar migraciones/outbox/PWA. |
| Altazor #244 | GitHub registra el PR como fusionado; conversación persistente, marca y escritorio siguen evolucionados en `main`. | No repetir el squash. |
| Dependabot #235 / #253 | Desktop ya tiene Electron 43.8.7, electron-builder 26.18.0, tsx 4.23.15 y los motores opcionales; los paquetes de runtime se compararon con sus rangos/lock actuales. | Conservar dependencias vigentes y #280, sin recuperar locks viejos. |

## Corrección de la distribución

Los logs del instalador macOS Intel del run `42680013165` acreditaron `sourceDirty: true`. `next typegen`/`next build` regenera `next-env.d.ts` para `.next/types`, mientras el repositorio conservaba `.next/dev/types`. Se versiona el archivo generado de producción. El empaquetado también aborta de inmediato e identifica los archivos modificados si una construcción futura ensucia el checkout. No se ignoran cambios ni se relajan la revisión de origen, hashes, pruebas de persistencia o el perfil público OAuth requerido para publicar.

## Validación y publicación

La publicación utiliza las puertas de CI del repositorio y la matriz nativa Linux x64, Windows x64, macOS Intel y Apple Silicon. La compilación o una etiqueta por sí solas no acreditan instaladores publicados. El manifiesto de la publicación determina el estado de firma; la versión continúa siendo preliminar. Los resultados verificables permanecen en GitHub Actions y en la publicación correspondiente. Las pruebas locales se ejecutan únicamente contra bases y archivos desechables.

## Inventario completo de referencias

Las revisiones de esta tabla son las iniciales, por lo que no cambian cuando GitHub actualiza una rama Dependabot. No se han borrado ramas históricas como parte de esta revisión. El inventario de PR está en [revision-pr-2026-11-09.csv](revision-pr-2026-11-09.csv); los commits exclusivos iniciales están en [revision-commits-2026-11-09.csv](revision-commits-2026-11-09.csv).

| Referencia | Revisión inicial | PR | Decisión |
| --- | --- | --- | --- |
| `refs/heads/feat/altazor-icaros-permisos` | `325a06d780ac` | #257 | Ya incluido por ascendencia |
| `refs/heads/feat/codex-permisos-bitacora` | `d9c3314e44fe` | #273 | Ya incluido por ascendencia |
| `refs/heads/feat/google-organization-folders` | `582e4df90b77` | #277 | Integrado; corregidos estados de Drive y ergonomía móvil |
| `refs/heads/feat/jornada-navigation-ux` | `a6671bbd69c5` | #281 | Integrado; corregidos estados de Drive y ergonomía móvil |
| `refs/heads/feat/ojv-jurisprudencia-zip` | `fbf51e68a922` | #274 | Ya incluido por ascendencia |
| `refs/heads/feat/pjud-search-access` | `058c7bed2c71` | #276 | Ya incluido por ascendencia |
| `refs/heads/feat/pjud-session-recovery` | `4da6cfaddeb3` | #275 | Ya incluido por ascendencia |
| `refs/heads/main` | `3ca0aef14273` | — | Ya incluido por ascendencia |
| `refs/heads/work` | `9ac94bbc2cb7` | — | Ya incluido por ascendencia |
| `refs/remotes/origin/bolt-ledger-balance-optimization-8709825002600064672` | `d759d8098420` | #122 | Sustituido: agregación SQL con permisos / consultas paralelas vigentes |
| `refs/remotes/origin/bolt-ledger-balance-optimization-9017593903712274696` | `d48cb271b94f` | #109 | Sustituido: agregación SQL con permisos / consultas paralelas vigentes |
| `refs/remotes/origin/bolt-ledger-entry-optimization-17239397208062518759` | `46efc9d14b73` | #144 | Sustituido: agregación SQL con permisos / consultas paralelas vigentes |
| `refs/remotes/origin/bolt-ledger-optimization-18216456523605460442` | `8072f291f77e` | #105 | Sustituido: agregación SQL con permisos / consultas paralelas vigentes |
| `refs/remotes/origin/bolt-optimize-facturacion-query-2218784013057302905` | `b06e80c7ca27` | #116 | Sustituido: agregación SQL con permisos / consultas paralelas vigentes |
| `refs/remotes/origin/bolt-optimize-ledger-balance-2136205014506562617` | `f68c385d913f` | #135 | Sustituido: agregación SQL con permisos / consultas paralelas vigentes |
| `refs/remotes/origin/bolt-optimize-ledger-balance-queries-4246048999050729345` | `5ba158a1638f` | #127 | Sustituido: agregación SQL con permisos / consultas paralelas vigentes |
| `refs/remotes/origin/bolt-optimize-ledger-balance-query-7554632472642218064` | `91b47b0cbd37` | #142 | Sustituido: agregación SQL con permisos / consultas paralelas vigentes |
| `refs/remotes/origin/bolt-optimize-ledger-balance-query-7628149331564697236` | `5c71e7335b33` | #115 | Sustituido: agregación SQL con permisos / consultas paralelas vigentes |
| `refs/remotes/origin/bolt-optimize-ledger-balances-14136946226922214380` | `bab516786ed1` | #120 | Sustituido: agregación SQL con permisos / consultas paralelas vigentes |
| `refs/remotes/origin/bolt-optimize-ledger-balances-8679278968412496233` | `5b5b851f77b4` | #133 | Sustituido: agregación SQL con permisos / consultas paralelas vigentes |
| `refs/remotes/origin/bolt-optimize-ledger-queries-17499218554381736963` | `6c28a64443af` | #111 | Sustituido: agregación SQL con permisos / consultas paralelas vigentes |
| `refs/remotes/origin/bolt/ledger-unbounded-query-optim-8392179256276843826` | `9ae959728348` | #107 | Sustituido: agregación SQL con permisos / consultas paralelas vigentes |
| `refs/remotes/origin/bolt/optimize-billing-aggregation-16044626052189121780` | `5c5c95d3697e` | #149 | Sustituido: agregación SQL con permisos / consultas paralelas vigentes |
| `refs/remotes/origin/bolt/optimize-ledger-queries-18067957065796542960` | `00aa51bec73a` | #101 | Sustituido: agregación SQL con permisos / consultas paralelas vigentes |
| `refs/remotes/origin/bolt/optimize-ledger-queries-2399665175737998286` | `78b3904fe389` | #139 | Sustituido: agregación SQL con permisos / consultas paralelas vigentes |
| `refs/remotes/origin/bolt/site-files-parallel-fetch-12426928650665274736` | `94113625f5b1` | #121 | Sustituido: agregación SQL con permisos / consultas paralelas vigentes |
| `refs/remotes/origin/codex/altazor-conversation-first` | `736494ccce64` | #244 | PR #244 integrado por squash; conversación y marca vigentes |
| `refs/remotes/origin/cursor/add-solvecha-provider-8c2b` | `62d6337d5d86` | — | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/automatic-local-backups-0916` | `c8de390975e3` | #17 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/claveunica-error-interno-fc13` | `f98da61aa428` | #52 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/claveunica-sidecar-fallback-fc13` | `07d0fadcc398` | #56 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/clone-install-not-dmg-fc13` | `d5eb6568b5ce` | #49 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/config-ia-endpoints-c03d` | `a3949b02cf46` | #22 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/copiloto-polish-f8fb` | `2d70b841f41a` | #19 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/correo-pjud-buzon` | `36b7ba89698a` | #82 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/correo-pjud-produccion-5da6` | `b624c30c5e80` | #84 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/crm-clientes-ia-3c94` | `4de349966d95` | #10 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/crm-clientes-tramites-e1fd` | `f8543050c31a` | #30 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/desktop-tailscale-3c94` | `f18592b4ce80` | #14 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/document-folder-ingest-f3b5` | `71587ff6413a` | #25 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/google-drive-integration-2db0` | `6129ee024f5a` | #29 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/google-drive-integration-e1fd` | `5c6b809fa31b` | #31 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/hermes-obsidian-qa-f4ac` | `9f925304d6bf` | #5 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/hermes-obsidian-readme-e1fd` | `24a2d00ea582` | #37 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/hide-next-dev-indicator-d33b` | `975eb1d5d838` | #20 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/host-parity-crm-i18n-e1fd` | `65028e7439d1` | #39 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/host-relax-csrf-f04e` | `8fde0e7bbffc` | #46 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/i18n-multiidioma-3c94` | `67829d4c7819` | #13 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/i18n-multiidioma-e1fd` | `e47cdd7ac7f4` | #32 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/lexopen-estudio-confiable-f4ac` | `3947f02f6071` | #6 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/lexopen-madurez-estudio-f4ac` | `fc7c3121cfea` | #4 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/lexopen-perfection-roadmap-f4ac` | `6fa2fd413274` | #3 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/lexora-highq-clone-9d5f` | `a7db97bce136` | #1 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/llm-env-snippet-live-fc13` | `5e45d62b32b4` | #55 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/llm-sse-json-parse-fc13` | `61f98c3160f7` | #53 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/local-production-host-d33b` | `70d841138de3` | #23 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/macos-unstyled-desktop-fc13` | `d394b26af6fc` | #48 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/mejora-progresiva-0b96` | `a4c42652d4c8` | #78 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/mejorar-espacios-5da6` | `71376d0fbd1f` | #83 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/mejoras-apartados-lexopen-9fcd` | `177106e03f94` | #8 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/minutas-drive-estudio-f4ac` | `0597eabf2da7` | #2 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/ocr-tesseract-path-fc13` | `5307c5f0fda6` | #54 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/pasadas-desarrollo-3c94` | `65fb0f6b8314` | #15 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/pia-site-lexopen-3c94` | `af39ccc31ffa` | #12 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/pjud-casetracking-f4ac` | `f8ca25dd8085` | #7 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/pjud-causamonitor-parity-f8fb` | `7c5b9c73ad7e` | #18 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/pjud-monitoreo-causas-3c94` | `c19770f73c09` | #9 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/pjud-scraping-warning-9de1` | `1733d728cbdd` | #33 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/playwright-host-chromium-fc13` | `c3cd09450235` | #57 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/plazos-alertas-scheduler-e1fd` | `90b27bc5f832` | #38 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/prod-audit-f04e` | `3d6a5393c491` | #40 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/prod-check-f04e` | `19936fe16c3d` | #45 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/prod-hardening-f04e` | `7f1a76db0c01` | #41 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/prod-hardening2-f04e` | `a09ddd4eb02b` | #42 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/prod-hardening3-f04e` | `2d3404fc1d85` | #43 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/prod-hardening4-f04e` | `8feacbbff91d` | #44 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/production-render-d33b` | `dc5806f5e996` | #21 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/readme-actualizar-app-f3b5` | `0e5909fbcf3f` | #26 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/readme-github-3c94` | `52c350ecec8b` | #11 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/readme-independientes-f04e` | `e556ce34d465` | #47 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/readme-reopen-host-fc13` | `43b642a00a10` | #51 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/readme-showcase-0916` | `a2fe67a86b49` | #16 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/release-0-1-5-0b96` | `c3098a1f0b0f` | #79 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/residuales-estudio-site-e1fd` | `cca3e2a79749` | #35 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/security-audit-followup-9b24` | `f67acf7e051b` | — | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/security-audit-followup10-9b24` | `503ac5e2d6b1` | — | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/security-audit-followup11-9b24` | `96824ab837ef` | — | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/security-audit-followup12-9b24` | `d59ab2f48429` | — | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/security-audit-followup2-9b24` | `77065055da38` | — | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/security-audit-followup3-9b24` | `67639e7ecacf` | #27 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/security-audit-followup4-9b24` | `61066b61b1f9` | #28 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/security-audit-followup5-9b24` | `0dcf947982ba` | — | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/security-audit-followup6-9b24` | `9e10c97b57ec` | — | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/security-audit-followup7-9b24` | `4e500bda7d0e` | — | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/security-audit-followup8-9b24` | `a304218fa386` | #34 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/security-audit-followup9-9b24` | `35ab925949dd` | #36 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/security-audit-remediation-9b24` | `18fb6c6a167e` | #24 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/standalone-static-copy-fc13` | `dde5dedda664` | #50 | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/update-available-banner-f3b5` | `ceb7a67fa235` | — | Ya incluido por ascendencia |
| `refs/remotes/origin/cursor/v1.1-notificaciones` | `a5fcb72d4135` | #203 | Sustituido: outbox, canales y preferencias vigentes |
| `refs/remotes/origin/cursor/v1.1-roles-equipo-f423` | `0193d410a5c5` | #202 | Sustituido: roles, muro ético y tareas vigentes; conservar 2FA de producción |
| `refs/remotes/origin/dependabot/github_actions/actions/setup-go-7` | `9d9775972826` | #279 | Integrado; actualización vigente |
| `refs/remotes/origin/dependabot/github_actions/actions/setup-python-7` | `11a416921edc` | #278 | Integrado; actualización vigente |
| `refs/remotes/origin/dependabot/npm_and_yarn/compatible-runtime-a982a53715` | `83e70dae02b6` | #280 | Integrado; actualización vigente |
| `refs/remotes/origin/dependabot/npm_and_yarn/compatible-runtime-e2769b2822` | `dc25a5cd0bdc` | #253 | Sustituido por dependencias actuales; no retroceder locks |
| `refs/remotes/origin/dependabot/npm_and_yarn/desktop/compatible-desktop-8d201ee2cb` | `5469b6ab2a1c` | #235 | Sustituido por dependencias actuales; no retroceder locks |
| `refs/remotes/origin/docs/uninstall-readme` | `772e5321d7e3` | #61 | Ya incluido por ascendencia |
| `refs/remotes/origin/feat/google-organization-folders` | `582e4df90b77` | #277 | Integrado; corregidos estados de Drive y ergonomía móvil |
| `refs/remotes/origin/feat/in-app-self-update` | `1addcd01e807` | #64 | Ya incluido por ascendencia |
| `refs/remotes/origin/feat/jornada-navigation-ux` | `a6671bbd69c5` | #281 | Integrado; corregidos estados de Drive y ergonomía móvil |
| `refs/remotes/origin/fix/app-shell-viewport` | `479b2878cf20` | #59 | Ya incluido por ascendencia |
| `refs/remotes/origin/fix/ci-appshell-lint` | `d7626ffa4662` | #60 | Ya incluido por ascendencia |
| `refs/remotes/origin/fix/claveunica-login-form` | `34ce72e9d30a` | #66 | Ya incluido por ascendencia |
| `refs/remotes/origin/fix/claveunica-mis-causas` | `1fbd8891d19a` | #69 | Ya incluido por ascendencia |
| `refs/remotes/origin/fix/env-example-doc-import-comment` | `87e94903f547` | #77 | Ya incluido por ascendencia |
| `refs/remotes/origin/fix/mis-causas-524` | `ff1862199167` | #70 | Ya incluido por ascendencia |
| `refs/remotes/origin/fix/ojv-buscar-visible` | `88436dfce6d8` | #71 | Ya incluido por ascendencia |
| `refs/remotes/origin/fix/ojv-movimientos-rol` | `103f3d0f0d95` | #72 | Ya incluido por ascendencia |
| `refs/remotes/origin/main` | `22988fe717f1` | — | Ya incluido por ascendencia |
| `refs/remotes/origin/palette-aria-expanded-panels-16975830876724728250` | `d269eb9138cd` | #102 | Sustituido: controles accesibles y estados de carga ya presentes |
| `refs/remotes/origin/palette-aria-panels-265726871551040356` | `131ab0961c63` | #114 | Sustituido: controles accesibles y estados de carga ya presentes |
| `refs/remotes/origin/palette-causa-equipo-a11y-14469978792297800625` | `25e99ecc2b47` | #216 | Sustituido: controles accesibles y estados de carga ya presentes |
| `refs/remotes/origin/palette-sites-panel-aria-attributes-13100354259713223610` | `f7642f9743c8` | #126 | Sustituido: controles accesibles y estados de carga ya presentes |
| `refs/remotes/origin/palette-ux-improvements-17321432941586767295` | `628f21227ae5` | #100 | Sustituido: controles accesibles y estados de carga ya presentes |
| `refs/remotes/origin/palette/disclosure-a11y-6177921218092577095` | `28e7ebcb7f18` | #112 | Sustituido: controles accesibles y estados de carga ya presentes |
| `refs/remotes/origin/palette/improve-site-settings-panel-a11y-17086954686299814320` | `a66cb6b97b79` | #140 | Sustituido: controles accesibles y estados de carga ya presentes |
| `refs/remotes/origin/palette/sites-guide-panel-accessibility-11638652719712380856` | `ee02077a18c2` | #123 | Sustituido: controles accesibles y estados de carga ya presentes |
| `refs/remotes/origin/palette/task-status-loading-feedback-6457100830443720260` | `51414ce963ba` | #241 | Sustituido: controles accesibles y estados de carga ya presentes |
| `refs/remotes/origin/polish/lexopen-wave1` | `0d4072970ad1` | #68 | Ya incluido por ascendencia |
| `refs/remotes/origin/security/replace-math-random-7860927873582442201` | `5a01b4615534` | #108 | Sustituido: MinutaWizard ya usa crypto.randomUUID |
| `refs/remotes/origin/security/sentinel-fix-weak-randomness-2987230901454504805` | `9d2b26e25627` | #138 | Sustituido: MinutaWizard ya usa crypto.randomUUID |
| `refs/remotes/origin/sentinel-crypto-random-uuid-2566753586103491362` | `8d8fc4544dc2` | #117 | Sustituido: MinutaWizard ya usa crypto.randomUUID |
| `refs/remotes/origin/sentinel-fix-weak-randomness-12445167532145043666` | `7113978cb645` | #113 | Sustituido: MinutaWizard ya usa crypto.randomUUID |
| `refs/remotes/origin/sentinel-fix-weak-randomness-14016827989795154449` | `2f4dfa50fa3d` | #124 | Sustituido: MinutaWizard ya usa crypto.randomUUID |
| `refs/remotes/origin/sentinel-fix-weak-randomness-9081468431971386962` | `969b62eefdb2` | #238 | No integrar: elimina compatibilidad HTTP de identificadores no secretos |
| `refs/remotes/origin/sentinel-math-random-crypto-13450475788769490016` | `151896e96ee6` | #104 | Sustituido: MinutaWizard ya usa crypto.randomUUID |
| `refs/remotes/origin/sentinel/crypto-random-uuid-17877898755992337917` | `a55043d5a374` | #110 | Sustituido: MinutaWizard ya usa crypto.randomUUID |
| `refs/remotes/origin/sentinel/crypto-randomuuid-7320798328183954074` | `4246daff6726` | #129 | Sustituido: MinutaWizard ya usa crypto.randomUUID |
| `refs/remotes/origin/sentinel/crypto-randomuuid-9863283483303930279` | `d9eba830228f` | #134 | Sustituido: MinutaWizard ya usa crypto.randomUUID |
| `refs/remotes/origin/sentinel/fix-weak-randomness-10735373039507367142` | `76ab814ea917` | #119 | Sustituido: MinutaWizard ya usa crypto.randomUUID |
| `refs/remotes/origin/sentinel/fix-weak-randomness-16449451359050433165` | `c467c8caf8be` | #143 | Sustituido: MinutaWizard ya usa crypto.randomUUID |
| `refs/remotes/origin/sentinel/fix-weak-randomness-7398705496647433502` | `3dd1660d907c` | #125 | Sustituido: MinutaWizard ya usa crypto.randomUUID |
