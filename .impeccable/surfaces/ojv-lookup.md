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
