---
version: 1
slug: "src-components-pjud-pjudquickaddpanel-tsx"
primary_target: "src/components/pjud/PjudQuickAddPanel.tsx"
related_targets: ["src/app/(app)/causas/mis-causas/page.tsx","src/components/pjud/PjudManualSessionPanel.tsx","src/components/pjud/PjudCuadernosCoverage.tsx","src/components/pjud/pjud-manual-session.css","src/components/pjud/pjud-cuadernos.css","src/app/(app)/causas/monitoreo/page.tsx","src/components/pjud/PjudMonitorPanel.tsx"]
---

# Consulta de causas en OJV

## Mode

Operate. Refinamiento localizado de `/causas/monitoreo#alta-rol`, en el mundo de papel, tinta, cobre y verde mar de LexOpen. Títulos Fraunces, controles y lectura Sora; hereda los tokens existentes.

## Outcome

Consultar por RIT/ROL y tribunal o por RUT, revisar la identidad y los datos que devuelve el proveedor, y decidir por separado si se incorpora una causa a la cartera. Consultar no crea causas, activa monitoreo ni sincroniza registros guardados.

## Hierarchy and behavior

El título y el alcance de sólo lectura preceden al selector de criterio. RIT/ROL y tribunal son obligatorios; carátula es opcional y sólo se usa al registrar. El catálogo sugiere tribunales y admite texto libre. Los resultados muestran identidad consultada, fecha, proveedor, sala si está informada y una muestra de movimientos con fecha y cuaderno cuando existen. El número corresponde a movimientos recuperados, sin prometer integridad del expediente. Los resultados por RUT se presentan como candidatos y pueden abrir una consulta de movimientos.

Agregar a mi cartera es una acción explícita posterior: crea o vincula la causa, activa el monitoreo y solicita sincronización. Registrar sin consulta previa permanece como alternativa secundaria desplegable, con alcance visible y `syncNow:false`. Los permisos de registro se explican junto a la acción. Tener un canal configurado no se presenta como conexión comprobada.

## States and recovery

- Formularios controlados conservan ambos criterios al cambiar de modo. Editar RIT/ROL, tribunal o RUT invalida el resultado respectivo; la carátula no modifica la consulta.
- Carga de catálogo recuperable, errores de campo vinculados mediante ARIA, consulta en curso cancelable, error con reintento y respuesta vacía se distinguen en texto.
- Los errores conservan los campos. Las solicitudes impiden doble envío y se cancelan al abandonar la superficie; respuestas obsoletas no reemplazan consultas nuevas.
- Un tiempo de espera de registro pide revisar la cartera antes de repetir la acción. Cancelar una consulta de lectura no afirma cancelar trabajo que el proveedor ya haya iniciado.
- Ausencia de movimientos o de causas por RUT no acredita que una causa no exista.

## Responsive and evidence

Por debajo de 600px, formulario, identidad y acciones pasan a una columna. Controles de al menos 44px, entradas de 16px, foco visible, textos largos ajustables y avisos que no dependen del color.

`e2e/ojv-lookup.spec.ts` usa únicamente una base descartable, cuentas de seed y respuestas ficticias interceptadas de lookup. Comprueba consulta y registro separados, conservación e invalidación, vacíos y errores, recuperación de catálogo, cancelación y capacidades. Produce capturas de la consulta ficticia en escritorio y 360px. Estas pruebas no acreditan acceso real a OJV ni CAPTCHA.

## ClaveÚnica

La superficie relacionada `/causas/mis-causas` conserva su estructura y hace explícitos los efectos de la sincronización. El estado inicial se mantiene sin comprobar hasta recibir respuesta; un fallo de carga permite reintentar sin representar credenciales ausentes, conexión pausada o cero causas como hechos. Los permisos efectivos de sincronización y gestión de credenciales provienen de la API y se distinguen.

El guardado conserva el RUT y limpia la contraseña al confirmarse. Guardar no acredita que OJV acepte las credenciales; sincronizar incorpora causas al estudio y procesa movimientos por separado. Los resultados vacíos no se describen como «todo al día», los parciales permanecen identificados y la consulta periódica del trabajo en curso se detiene al abandonar la página. El mensaje de cada acción se anuncia como estado o alerta según su resultado.


## Ingreso manual y cuadernos · 3 de noviembre de 2026

La ampliación conserva el modo Operate y la composición de papel, tinta y filetes. Mis Causas ofrece primero la conexión manual en la página oficial, revisión explícita del listado y selección por grupos de hasta veinte causas; el acceso guardado del estudio queda en un desplegable separado. La conexión se abre en el equipo Host habilitado, pertenece a la sesión del profesional y vence a los treinta minutos. Las consultas privadas posteriores requieren una sesión vigente; la configuración del programador no se presenta como ejecución comprobada.

Consultar el listado no incorpora causas. La selección se conserva al filtrar y cambiar de página y se muestra de nuevo junto a Importar, con acciones para quitar cada causa. Sólo se transmiten identificadores opacos del listado comprobado. Revocar permisos retira los datos visibles; abandonar una consulta cierra la conexión de lectura, mientras una importación aceptada continúa en el Host.

El resultado de la importación ocupa el lugar inmediato del listado, anuncia sus recuentos y recibe foco una sola vez cuando termina la operación iniciada desde esta pantalla. Continuar con otras causas devuelve el recorrido a Revisar y conserva el resultado anterior como un recibo desplegable. No se repite el desplazamiento con la consulta periódica de estado.

La consulta RIT/ROL, el resultado manual, la cartera y el expediente comparten la cobertura por cuaderno: completo sólo cuando se leyeron todos los enumerados, parcial cuando quedan fallos o límites, y sin comprobar cuando no se pudo enumerar. Cada fila conserva su cuaderno y los legados sin atribución se muestran separados; no se convierten en Principal. Las claves visibles son estables y no contienen valores de sesión del portal.

A 360 píxeles, controles y filas se reorganizan en una columna y las acciones mantienen una altura de 44 píxeles. Los indicadores de actividad y cambios de paso respetan movimiento reducido. Se conservan los tamaños auxiliares de pjud-lookup.css; las advertencias mecánicas de rampa tipográfica se evaluaron como continuidad del patrón, sin silenciar reglas.

Las capturas de docs/ojv-interfaz-2026-11-03 muestran la aplicación con datos ficticios identificados. e2e/ojv-manual-session.spec.ts comprueba ingreso por estados, selección, límites, llegada al resultado, repetición de grupos, cobertura, errores, revocación y navegación. Las pruebas visuales no acreditan por sí solas acceso real a la OJV.
