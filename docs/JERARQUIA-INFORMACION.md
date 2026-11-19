# Información en pantalla y orden de trabajo

El inventario parte de las 77 páginas del PR 306. Las rutas entre corchetes representan registros de prueba. La columna de verificación indica el recorrido automatizado en `e2e/` o una comprobación manual reproducible. Los resultados de una ejecución se consultan en el informe de Playwright.

## Entrada y trabajo diario

| Páginas | Tarea y comportamiento que debe conservarse | Verificación |
| --- | --- | --- |
| `/` · `/login` | Entrar al estudio. La portada conduce al formulario, que habilita el envío tras inicializarse. | `login-readiness.spec.ts`. Desde la portada, seguir «Iniciar sesión» con el teclado. |
| `/setup` · `/recovery` | Crear la administración inicial o recuperar su acceso. Mostrar el formulario correspondiente al estado del Host. | Manual en un Host descartable: completar el alta una vez y verificar el retorno a acceso tras la recuperación. |
| `/inicio` · `/agente` · `/agente/archivo` | Ver la jornada y continuar en Altazor. El enlace antiguo prepara una petición editable o abre la conversación histórica indicada por `chatId`. | `jornada-overview.spec.ts` coteja prioridad y permisos. `agente-document-scope.spec.ts` comprueba ambos destinos antiguos. |
| `/buscar` | Encontrar un registro visible y abrirlo. Cada categoría con coincidencias tiene un encabezado, toda la búsqueda comparte un vacío y el reintento conserva la consulta. | `app-quality.spec.ts` prueba una coincidencia de jurisprudencia, cero resultados y una respuesta 503 seguida de recuperación. |
| `/dashboard` | Consultar la actividad del estudio y abrir un trámite, un espacio o una tarea desde su contexto. | `app-quality.spec.ts` abre el panel y comprueba el trámite prioritario. |
| `/calendario` · `/plazos` | Revisar agenda y vencimientos. Mantener intervalo, causa, responsable y fecha civil al cambiar de vista. | `plazos-agenda.spec.ts`, `deadline-completion.spec.ts` e `information-hierarchy.spec.ts` contrastan filtros, paginación y cumplimiento. |
| `/tareas` · `/flujos` | Asignar, completar y seguir trabajo. Mantener el borrador y los permisos al recuperar una operación. | `tasks-workflows.spec.ts` y `crm-workflow-safety.spec.ts` prueban pérdida de respuesta y cambios de estado. |
| `/notificaciones` · `/cuenta/notificaciones` | Leer los avisos del usuario y gestionar sus canales. Abrir las preferencias personales desde el contexto de cuenta. | `notifications.spec.ts` comprueba la campana y lecturas. `notify-reconciliation.spec.ts` cubre entregas inciertas. |
| `/cuenta` · `/cuenta/feedback` | Comprobar la identidad y los permisos, proteger el acceso o seguir una consulta de soporte. | `totp-and-wiki.spec.ts`, `trusted-devices.spec.ts` y `feedback.spec.ts`. |
| `/configuracion` · `/configuracion/correo` · `/integraciones` | Elegir un ajuste del Host o personal, conectar correo y revisar los conectores disponibles. Conservar campos editados al cambiar de sección. | `settings-categories.spec.ts`, `jornada-overview.spec.ts`, `correo.spec.ts` y `app-quality.spec.ts`. |
| `/correo` · `/mensajes` | Consultar correo vinculado o enviar un mensaje a destinatarios autorizados. Devolver la respuesta OAuth al ajuste del proveedor. | `correo.spec.ts` y `conflict-and-messages.spec.ts` cubren retorno, borrador y destinatarios. |
| `/auditoria` · `/personas` | Revisar acciones según capacidad y administrar el equipo. La auditoría exige su propio permiso. | `permissions-settings.spec.ts` y `ui-refinement.spec.ts` cubren acceso, diálogo y teclado. |

## Clientes, causas, OJV y Fiscalía

| Páginas | Tarea y comportamiento que debe conservarse | Verificación |
| --- | --- | --- |
| `/clientes` · `/clientes/[id]` | Localizar al cliente y retomar sus causas, documentos y notas. Mantener la separación por equipo y las ediciones pendientes. | `crm-workflow-safety.spec.ts` verifica contadores tras revocar acceso. `document-download.spec.ts` coteja el original. |
| `/mis-causas` · `/causas` · `/causas/nueva` · `/causas/[id]/editar` | Abrir la cartera o crear y modificar una causa con su responsable y visibilidad. | `causas-section.spec.ts` cubre los destinos. Manual: crear un expediente ficticio restringido y conservar su equipo tras editarlo. |
| `/causas/[id]` · `/causas/[id]/expediente` | Retomar la actuación, el plazo o la espera desde la ficha y abrir documentos por fuente en el expediente. | `automatic-case-status.spec.ts`, `case-archive.spec.ts` y `case-updates.spec.ts`. |
| `/sincronizacion` · `/causas/monitoreo` · `/causas/mis-causas` | Distinguir preparación, consulta, registro y resultado de una sincronización. La cuenta habilitada determina las herramientas disponibles. | `causas-section.spec.ts` y `ojv-lookup.spec.ts` ejercitan los modos, el error recuperable y ClaveÚnica con datos ficticios. |
| `/pjud` · `/pjud/[id]` | Elegir la herramienta judicial y consultar la causa PJUD vinculada. Permitir volver al expediente. | `shell-navigation.spec.ts` prueba la entrada PJUD. Manual: abrir una causa vinculada de ensayo y volver a la cartera. |
| `/mi-fiscalia` · `/mi-fiscalia/[id]` | Preparar una solicitud, cotejar su comprobante y volver a la lista con la causa correcta. | `fiscalia-requests.spec.ts` cubre el muro de causa y el descarte de un borrador. |
| `/documentos` · `/documentos/[id]/fuentes` | Buscar e incorporar documentos, descargar el original disponible y consultar la fuente exacta. | `document-download.spec.ts`, `document-evidence.spec.ts` y `pdf-pages.spec.ts`. |
| `/minutas` · `/causas/[id]/minuta/nueva` · `/causas/[id]/minutas/[minutaId]` | Localizar, crear y volver a abrir la minuta en su causa, manteniendo los datos al corregir un envío. | `minutas-native.spec.ts` y `minute-templates.spec.ts`. |
| `/causas/[id]/escritos` · `/causas/[id]/mesa` · `/ayuda/mesa-asistente` | Redactar con fuentes, producir el archivo y revisar la preparación local de la Mesa. Conservar causa y referencias. | `case-writing.spec.ts` y `workbench.spec.ts`. Manual: abrir la ayuda del ejecutor y volver a la Mesa. |
| `/audiencias` · `/causas/[id]/audiencias` · `/audiencias/[workspaceId]` | Buscar una audiencia, abrir desde la causa y retomar una sesión concreta con sus permisos. | `audience-hub.spec.ts`, `hearing-workspace.spec.ts` y `hearing-live.spec.ts`. |

## Biblioteca, investigación y docencia

| Páginas | Tarea y comportamiento que debe conservarse | Verificación |
| --- | --- | --- |
| `/biblioteca` · `/biblioteca/[id]` | Abrir una obra y continuar en el lector con pasajes citables y referencia a la causa. | `personal-library.spec.ts`, `judicial-library.spec.ts` y `case-workflow.spec.ts`. |
| `/jurisprudencia` · `/jurisprudencia/fuentes/[id]` · `/jurisprudencia/revision` | Buscar jurisprudencia, comparar una cita con su fuente y recuperar el texto de una sentencia histórica pendiente. | `legal-research.spec.ts` y `pjud-search.spec.ts`. Manual: abrir desde revisión una sentencia pendiente y cotejar su copia pública. |
| `/academico` | Retomar un trabajo, búsqueda bibliográfica, revisión o sesión docente conservando la vista elegida. | `altazor-academic.spec.ts`, `academic-review.spec.ts` y `academic-teaching.spec.ts`. |

## Espacios, portal y finanzas

| Páginas | Tarea y comportamiento que debe conservarse | Verificación |
| --- | --- | --- |
| `/portal` · `/sites` · `/sites/[id]` | El cliente entra en su espacio autorizado desde el portal. El equipo puede localizar, filtrar y crear espacios vinculados. | `auth-and-access.spec.ts` cubre el acceso del cliente. `portal-billing-destinations.spec.ts` comprueba la pregunta exacta y `sites-workflow.spec.ts`, creación y filtros. |
| `/sites/[id]/archivos` · `/sites/[id]/archivos/[fileId]/fuentes` | Localizar un archivo del espacio, recuperar su contenido y leer la fuente original con los permisos vigentes. | `site-file-evidence.spec.ts` y `offline-files.spec.ts`. |
| `/sites/[id]/personas` · `/sites/[id]/tareas` · `/sites/[id]/flujos` | Revisar participantes, tareas y flujos sin perder el espacio actual. Las acciones reflejan el nivel de acceso. | `pr-integration.spec.ts`, `tasks-workflows.spec.ts` y `workflow-permissions.spec.ts`. |
| `/sites/[id]/qa` · `/sites/[id]/wiki` · `/sites/[id]/blog` | Retomar una pregunta concreta, consultar o editar la wiki y leer las publicaciones del espacio. | `totp-and-wiki.spec.ts` y `ui-refinement.spec.ts` ejercitan la wiki. Manual: abrir una pregunta por su enlace y una publicación del mismo espacio. |
| `/sites/[id]/isheets` · `/sites/[id]/isheets/[sheetId]` | Elegir una tabla y consultar sus filas bajo los permisos del espacio. | `auth-and-access.spec.ts` cubre los límites del portal. Manual: elegir una tabla ficticia y comprobar el nombre y los campos al abrirla. |
| `/facturacion` · `/facturacion/facturas` · `/facturacion/facturas/[id]` · `/facturacion/cuenta-corriente` | Conciliar indicadores con facturas, pagos y saldo del cliente. El detalle debe identificar los movimientos incluidos. | `app-quality.spec.ts` abre el resumen, el listado y la cuenta corriente. `ui-refinement.spec.ts` ejercita el pago en una factura. `portal-billing-destinations.spec.ts` coteja el saldo y los pagos por fecha. |
| `/facturacion/horas` · `/facturacion/gastos` · `/facturacion/tarifas` · `/facturacion/uf` | Registrar horas y gastos y verificar la tarifa y el valor diario de UF aplicables. | `app-quality.spec.ts` comprueba el acceso a cada ruta. Manual: cotejar un ejemplo de horas por tarifa con la UF del día. |

La entrega añade la página `/plazos/[id]` a ese punto de partida. Desde un indicador se abre el plazo identificado con su causa, fecha y estado actual. `automatic-case-status.spec.ts` verifica la referencia de cada plazo. Comprobar también la denegación al usuario que pierde acceso y el retorno a la causa.

## Navegación, redirecciones y recuperación

- El menú de personal respeta el catálogo habilitado y el menú del cliente respeta las herramientas del portal. Los apartados se abren dentro del menú móvil o desde la barra contraída. La búsqueda y el salto al contenido siguen disponibles por teclado. Comprobar ambos destinos de Agenda, la tecla Escape y el retorno del foco con `shell-navigation.spec.ts`.
- Al abrir una página protegida sin sesión, el acceso conduce a login con la ruta solicitada. Una política obligatoria de segundo factor conduce a Mi cuenta. El intento de abrir una sección interna con un perfil de cliente vuelve al portal. El acceso a un espacio como cliente lleva a sus archivos. La falta de permiso de auditoría conduce a los permisos de la cuenta. Ver `auth-and-access.spec.ts`, `permissions-settings.spec.ts` y `src/lib/auth/proxy-boundary.test.ts`.
- Los enlaces antiguos de agente abren Inicio con la petición preparada o el archivo privado del chat. Un retorno OAuth de correo abre Configuración de correo. Una paginación inválida de Novedades en el expediente devuelve la vista a un enlace válido. Comprobar `agente-document-scope.spec.ts`, `correo.spec.ts` y `case-updates.spec.ts`.
- Una ruta inexistente usa `src/app/not-found.tsx`. Un fallo de una página de trabajo usa `src/app/(app)/error.tsx`; un fallo del layout raíz usa `src/app/global-error.tsx`. Prueba manual en un Host descartable: abrir una URL inexistente, simular por separado ambos fallos de renderizado, recuperar el servicio y accionar el enlace o reintento con teclado. Verificar que la vista de producción protege los detalles internos.

## Superficies fuera de las páginas de Next.js

| Superficie | Recorrido | Verificación |
| --- | --- | --- |
| `public/offline.html` y service worker | Abrir las copias preparadas, desbloquearlas, trabajar sin red y reconocer un conflicto al volver. | `offline-workspace.spec.ts`, `offline-records.spec.ts`, `offline-files.spec.ts` y `offline-operations.spec.ts` prueban los datos ficticios, el alcance y las recuperaciones. |
| `desktop/renderer/setup.html` | Elegir Host en este equipo o conexión remota, introducir los datos de esa elección y abrir el espacio de trabajo. | `desktop/renderer.test.cjs`. Prueba manual del paquete en cada plataforma con teclado, campo obligatorio vacío, URL remota inválida y conexión válida. |

## Fechas y borradores

Inicio, Plazos y la API comparten el filtro de pendientes accesibles asignados al usuario. El intervalo de próximos plazos comienza hoy e incluye hoy + 7 días en Santiago. Los vencidos abarcan todos los meses. El conteo total y la página siguiente se consultan en `X-Total-Count` y `X-Next-Cursor`. `information-hierarchy.spec.ts` compara 106 plazos entre Inicio, lista y API.

Los formularios de preparación y registro conservan sus valores al plegarse. Los enlaces con fragmentos abren el formulario correspondiente. `jornada-overview.spec.ts` cubre el borrador de Configuración y `deadline-completion.spec.ts` el cumplimiento con respaldo.

## Cobertura visual

El barrido de `information-hierarchy.spec.ts` captura 14 pantallas en escritorio de 1366 × 900 y móvil de 360 × 800 con datos ficticios. La muestra adicional comprueba encabezado, idioma, tema aplicado, foco por teclado y ancho del documento. Cada combinación se captura una vez en Chromium.

| Perfil de prueba | Pantalla | Idioma y tema | Ancho |
| --- | --- | --- | --- |
| Público | Acceso | Inglés, oscuro | 360 px |
| Cliente | Portal | Español, oscuro | 390 px |
| Asistente | Búsqueda global | Inglés, claro | 1366 px |
| Administrador | Auditoría | Inglés, oscuro | 1366 px |

Las siguientes capturas documentan una revisión anterior. Para ver los resultados de esta entrega, consultar las capturas de la ejecución actual de Playwright.

| Pantalla | Antes | Después |
| --- | --- | --- |
| Inicio móvil | [Ver](ui/informacion/inicio-mobile-antes.png) | [Ver](ui/informacion/inicio-mobile-despues.png) |
| Plazos móvil | [Ver](ui/informacion/plazos-mobile-antes.png) | [Ver](ui/informacion/plazos-mobile-despues.png) |
| Causa escritorio | [Ver](ui/informacion/ficha-desktop-antes.png) | [Ver](ui/informacion/ficha-desktop-despues.png) |
| Configuración escritorio | [Ver](ui/informacion/configuracion-desktop-antes.png) | [Ver](ui/informacion/configuracion-desktop-despues.png) |
