# Revisión de recorridos, interfaz y competencia

## Evidencia y alcance

Se revisaron el catálogo de navegación, Inicio/Altazor, plazos, búsqueda de apartados, recorridos de causa, configuración y estados vacíos compartidos. Como referencias comparativas se utilizaron los informes del ZIP sobre CausaMonitor, TuProcurador y Nexulex. Son observaciones aportadas con fecha 9 de noviembre de 2026: no se presentan como una verificación actual de todos sus productos, precios ni métricas de uso.

Esta entrega mejora recorridos concretos y componentes transversales. No constituye una auditoría exhaustiva de todas las funciones jurídicas, financieras, conectores y pantallas ni una afirmación de superioridad respecto de la competencia.

## Criterios competitivos y cambios

| Necesidad | Fricción encontrada | Cambio verificable |
| --- | --- | --- |
| Saber qué requiere atención al entrar | El resumen operativo sólo se mostraba sin permiso de asistente; los usuarios de Altazor no recibían ese resumen | Tu jornada aparece con y sin asistente, con plazos y agenda registrados y acceso directo a Mis Causas |
| Detectar trabajo vencido | El contador próximo excluía vencidos y la lista habitual estaba restringida al mes | Contador propio de pendientes vencidos y vista de todos los meses, con límite visible de 100 registros |
| Llegar rápido al trabajo pertinente | Buscar apartados exigía coincidencia contigua en el mismo orden | Todos los términos deben coincidir, sin distinción de acentos u orden; los nombres exactos y sus prefijos tienen prioridad |
| Entender el alcance de un contador | Una cifra sin ventana o asignación puede parecer el total del estudio o una confirmación del portal judicial | Etiquetas de asignación y ventana temporal; datos registrados, sin afirmar que la OJV fue consultada ni que una causa está al día |
| Mantener contexto y accesibilidad | Inicio estaba identificado como ALTAZOR incluso sin acceso al asistente | Encabezado de página Inicio, resumen navegable con teclado, foco visible, adaptación móvil y respeto por movimiento reducido |
| Ver vencidos antes de crear otro plazo | El formulario de creación ocupaba el primer plano | En la vista de vencidos el formulario queda plegado; la vista mensual conserva el formulario abierto |
| Encontrar un ajuste sin perder un borrador | Configuración contiene formularios extensos de varias categorías | Buscador de ajustes, con alias como Drive/OJV/permisos, que navega por anclas sin desmontar los formularios |
| Descubrir funciones sin ampliar permisos | Un buscador global puede revelar destinos que no están habilitados | El ranking opera sólo sobre el catálogo ya autorizado; Inicio respeta las secciones habilitadas del Host |

El resumen utiliza el mismo alcance de causas/plazos y asignación de usuario que el servicio de estado. Los vencidos se determinan antes del inicio del día civil en Santiago; la cifra es de registros pendientes, no una conclusión sobre validez o exigibilidad jurídica. Eventos y plazos no activan IA ni envían documentos a servicios externos.

## Revisión por apartado y siguientes mejoras

| Apartado | Conservado o mejorado aquí | Trabajo adicional identificado |
| --- | --- | --- |
| Inicio y Altazor | Jornada común y asistente con sus permisos existentes | Medir uso del resumen y descubrimiento de herramientas; no hay métricas A/B aún |
| Causas y expediente | Acceso directo; recorrido Resumen → Expediente → Preparación → Audiencias → Escritos conservado | Revisar exhaustivamente listas extensas, filtros y navegación de versiones |
| Agenda y plazos | Pendientes vencidos de todos los meses y acceso desde Inicio | Diseñar cierre/cumplimiento con evidencia y permiso `plazo.close`; no se añade un cierre ficticio |
| Documentos y Drive | Se conserva el flujo de Organización compartida de la entrega anterior | Validar con una cuenta real autorizada, grandes volúmenes y permisos reales de Drive |
| Búsqueda y biblioteca | Búsqueda de apartados mejorada; citas e investigación local conservadas | Benchmark reproducible de recuperación jurídica y revisión de fallos de búsqueda remota |
| Audiencias, escritos y mesa | Enlaces contextuales existentes conservados | Auditoría visual y funcional completa de preparación, ejecución y revisión |
| Clientes y espacios | Jerarquía por cliente/causa/espacio de la entrega anterior conservada | Revisar archivo, transferencia y cambios de cliente con documentos existentes |
| Correo y notificaciones | Autorizaciones y canales existentes conservados | Resolver digest sin novedades frente a sincronización parcial sin generar falsas confirmaciones |
| Facturación y gestión | Cálculos y permisos existentes conservados | Revisión específica de flujos, conciliación y exportaciones antes de cambiar reglas financieras |
| Configuración, cuenta y roles | Navegación autorizada y traducciones ES/EN de los cambios | Revisar cada configuración avanzada y distinguir preparación técnica de preferencias habituales |
| Portal del cliente | No se amplía su acceso a Inicio ni a búsquedas internas | Pruebas específicas de experiencia móvil del portal |

## Validación

Pruebas deterministas de búsqueda cubren términos invertidos, acentos, ranking, coincidencia completa, estabilidad y ausencia de entradas no autorizadas. El recorrido Chromium verifica un vencido de hace tres meses, exclusión de un cumplido, búsqueda de apartado, Inicio con/sin asistente, búsqueda de ajustes sin perder un formulario sin guardar, ausencia de desbordamiento móvil y capturas de escritorio/móvil. Se revisan visualmente esas capturas; no sustituyen una auditoría WCAG completa.

Se ejecutan la suite general, tipos, lint y compilación. Ninguna prueba de esta entrega valida que un plazo esté jurídicamente bien calculado ni modifica servicios reales de un competidor.
