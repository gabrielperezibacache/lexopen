# Información en pantalla y orden de trabajo

Esta revisión aplica una densidad equilibrada: estado, datos esenciales y acción principal visibles; preparación, formularios y ayuda secundaria a un clic. Inicio mantiene a Altazor como espacio central. No requiere migraciones ni cambia los permisos, conexiones, horarios judiciales o persistencia del escritorio.

## Cambios por apartado

| Apartado | Organización actual |
| --- | --- |
| Inicio | Tres indicadores visibles también en móvil, con enlaces al mismo ámbito de registros. El editor de Altazor permanece accesible. |
| Mis Causas y ficha | Encabezados compactos; estado, plazos, esperas y tareas antes de la preparación. Una acción principal y el resto en Más acciones. |
| Expediente y Documentos | Incorporación plegable con apertura desde enlaces; descarga original visible en cada documento. Sin resultados de búsqueda se distingue de ausencia de documentos accesibles. |
| Plazos | Mes, vencidos propios o próximos propios. Filtro por causa y registro plegables, navegación de mes compacta, estado y urgencia visibles. |
| Tareas | Crear primero, exportar después; causa, responsable y estado como filtros principales; priorización de causa y opciones adicionales en Más filtros. |
| Calendario | Instrucciones de uso en ayuda contextual, conservando las acciones y los tipos de actividad. |
| Configuración | Búsqueda antes de la explicación; ámbito junto al apartado. Los formularios permanecen montados al navegar para conservar cambios sin guardar. |
| Altazor y escritorio | Ayuda de teclado plegable, avisos de conexión compactos, trabajo activo antes de la preparación de otra sesión, autorizaciones antes del visor y escala en un selector. |
| Clientes, biblioteca, investigación, mensajes, minutas, audiencias, escritos y finanzas | Encabezados y estados vacíos compartidos más compactos. Se conservan las instrucciones específicas de cada herramienta. |

Los errores, las restricciones de acceso, los datos que no se pudieron comprobar, las aprobaciones pendientes y las advertencias sobre fuentes jurídicas no se eliminan para ahorrar espacio. El aviso de desconexión aparece cuando se pierde la conexión; el acceso a copias preparadas permanece en la cabecera.

## Fechas y borradores

Inicio, la página de Plazos y `GET /api/plazos?vista=proximos` comparten el filtro de pendientes asignados al usuario con acceso actual a la causa. El intervalo incluye hoy y la fecha hoy + 7 días en Santiago, y muestra la fecha final. No se limita al mes actual. `vista=mis-vencidos` conserva todos los meses; el parámetro mensual solo aplica a la vista mensual. La respuesta API continúa siendo una lista, con `X-Total-Count` y `X-Next-Cursor`.

Los desplegables conservan sus campos en el DOM. Los enlaces con fragmentos abren el formulario o la preparación correspondiente. Plegar un formulario no guarda ni borra su borrador; salir de la página conserva las reglas previas de cada herramienta.

## Comparación visual

Capturas de la misma instalación de prueba con expedientes ficticios, a 1366 × 900 y 360 × 800. El reloj, los identificadores y los datos de la semilla pueden variar; no representan un estudio real.

| Pantalla | Antes | Después |
| --- | --- | --- |
| Inicio móvil | [Ver](ui/informacion/inicio-mobile-antes.png) | [Ver](ui/informacion/inicio-mobile-despues.png) |
| Plazos móvil | [Ver](ui/informacion/plazos-mobile-antes.png) | [Ver](ui/informacion/plazos-mobile-despues.png) |
| Causa escritorio | [Ver](ui/informacion/ficha-desktop-antes.png) | [Ver](ui/informacion/ficha-desktop-despues.png) |
| Configuración escritorio | [Ver](ui/informacion/configuracion-desktop-antes.png) | [Ver](ui/informacion/configuracion-desktop-despues.png) |

## Verificación reproducible

- `npm test`, `npm run lint` y `npm run build`.
- `npm run test:plazos-agenda:integration`: fechas civiles y antiguas, cambio de mes, responsables, permisos, conteos y cierre respaldado. Solo en la base desechable explícita de pruebas.
- `information-hierarchy.spec.ts`: equivalencia Inicio/lista/API, 106 plazos y paginación, apertura por enlace, teclado, borrador conservado, búsqueda vacía y ausencia de desbordamiento. Captura 14 apartados en ambos tamaños.
- `jornada-overview.spec.ts`, `deadline-completion.spec.ts` y `altazor-computer-viewer.spec.ts`: recorrido de jornada, permisos, borradores de configuración, respaldo de cumplimiento, lectura semántica y recuperación del visor. Interacciones en Chromium, Firefox y WebKit; capturas generales en Chromium.

La revisión de interfaz no acredita un piloto con datos reales, una conexión judicial activa ni la publicación o firma de instaladores.
