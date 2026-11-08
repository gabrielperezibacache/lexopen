# Próximas etapas de LexOpen

5 de noviembre de 2026

La prioridad es que un estudio pueda recibir una novedad, ubicarla en su causa, preparar la audiencia y entregar un escrito revisado con las fuentes a mano. Altazor acompaña ese recorrido desde el mismo hilo y devuelve cada resultado a su expediente. Académico conserva un recorrido propio para investigar, escribir y enseñar.

## Punto de partida

El [PR #246](https://github.com/gabrielperezibacache/lexopen/pull/246) se integró en `main` en `ae0a2d8`. Pasaron la comprobación general, las pruebas del escritorio de Altazor en Linux x64 y ARM64 y el empaquetado de Windows x64, macOS Intel y Apple Silicon, y Linux x64. La última descarga pública comprobada es `1.1.0-preview.5`. [Ejecución de empaquetado](https://github.com/gabrielperezibacache/lexopen/actions/workflows/desktop-release.yml) · [Descargas públicas](https://github.com/gabrielperezibacache/lexopen/releases).

La base ya ofrece Mis Causas, importación y versionado, páginas verificables, preparación de audiencias, transcripción revisable, escritos con historial, tareas con Excel, un hilo continuo de Altazor y una Mesa de revisión académica. Los siguientes hitos aprovechan esas piezas para cerrar recorridos completos. [Mapa de funciones](../README.md) · [Plan anterior](PLAN-DESARROLLO-2026-11-05.md).

## 0. Cerrar distribución y recuperación

1. Preparar la publicación de `1.1.0-preview.6` desde el commit integrado. Verificar que la etiqueta, el manifiesto, las huellas y los instaladores descargables coincidan. Registrar arquitectura y estado de firma por paquete.
2. Probar instalación gráfica limpia y actualización desde `preview.5` en Windows, macOS y Linux. Incluir la creación del primer administrador, un equipo cliente conectado al Host y el arranque después de reiniciar.
3. Completar un asistente de preparación que muestre qué está listo y cómo resolver lo pendiente. Comprobar almacenamiento, respaldo, escritorio, OCR, audio e IA local. Separar la descarga de herramientas de la activación del motor y del proveedor. Mostrar espacio requerido y avance de cada descarga.
4. Ensayar una actualización fallida y restaurar el respaldo en una carpeta aparte. Para el canal estable, añadir las comprobaciones de firma y, en macOS, notarización y actualización con el paquete firmado.

**Se acepta cuando** se descargan y verifican los paquetes publicados, se completa el primer uso en cada sistema objetivo y un expediente ficticio, su original, una cita y un secreto de prueba sobreviven a actualización y restauración. Registrar por separado el resultado de CI y el de cada equipo. [Instaladores](INSTALADORES.md) · [Actualizaciones](ACTUALIZACIONES.md) · [Preparación del escritorio](ESCRITORIO-ALTAZOR.md).

## 1. Hacer de Mis Causas el punto de entrada al trabajo

1. Añadir en cada expediente una vista **Novedades** que reúna resoluciones, documentos y mensajes incorporados por carga manual, correo, Drive u OJV. Mostrar origen, fecha y la decisión pendiente, con acceso al original y su versión.
2. Reutilizar los recibos de importación para reconocer reintentos. Sugerir coincidencias por huella y permitir revisar asociaciones dudosas. Si dos canales traen el mismo PDF, conservar su procedencia por separado y evitar versiones artificiales.
3. Dar una acción a cada novedad. Por ejemplo, asociar a una carpeta, registrar un hecho con respaldo, preparar una tarea o pedir a Altazor que revise el documento dentro de la causa.
4. Mantener la prioridad de una causa por profesional y usarla en Tareas y Agenda. Mostrar responsable, fecha y motivo del orden. Reutilizar la asignación, los estados y la exportación Excel existentes.

**Se acepta cuando** una resolución ficticia recibida dos veces por dos canales queda en el expediente correcto con ambos orígenes, sin duplicar su trabajo asociado. Un segundo usuario sin acceso queda excluido de la vista, la búsqueda, el Excel y Altazor. Una reasignación simultánea pide recargar antes de sobrescribir.

## 2. Completar el flujo de audiencia a escrito

1. Reunir guion, cronología, documentos y próximos plazos en una pauta de audiencia que se pueda retomar desde el expediente.
2. Hacer recuperable la sesión en vivo. Conservar notas y segmentos de audio al reconectar, mostrar el último tramo guardado y permitir corregir texto o hablante antes de usar la transcripción.
3. Añadir una revisión posterior con acceso a cada página o segundo de origen. Desde un pasaje revisado se puede crear un hecho, una acción de minuta, una tarea o un borrador. Mostrar el destino y los cambios propuestos antes de aplicarlos.
4. Añadir una revisión de entrega por versión del escrito. Mostrar quién revisó, qué citas se comprobaron y qué cambió después. Una edición sustantiva vuelve a requerir revisión. Conservar un recibo de exportación con la revisión, las fuentes y sus localizadores.

**Se acepta cuando** una única prueba recorre documento entrante → pauta → audiencia interrumpida y recuperada → hecho revisado → Word. El archivo abre en un editor real, sus notas al pie apuntan a páginas o segmentos correctos y retirar el acceso a una fuente impide usarla en una nueva exportación. [Pruebas de continuidad](../e2e/case-workflow.spec.ts) · [Pruebas de escritos](../e2e/case-writing.spec.ts).

## 3. Hacer comprensibles la memoria y los encargos de Altazor

1. Añadir búsqueda dentro del hilo por asunto, causa y fecha, accesible desde una acción secundaria. Para cada respuesta, ofrecer **Qué usó Altazor** con el expediente, los pasajes, los recuerdos confirmados o los mensajes previos que correspondan.
2. Mostrar un estado con una acción clara para cada encargo. Distinguir en cola, en curso, requiere revisión, parcial y detenido. Conservar el resultado y enlazarlo con su destino. Al retomar tras un fallo, comprobar lo aplicado y pedir revisión para resultados inciertos.
3. Simplificar el arranque del escritorio por profesional. Ofrecer diagnóstico desde el Host y confirmar el proveedor y los archivos elegidos. Bajo el chat, mostrar cuándo se actualizó la última captura y distinguir espera, control manual y conexión vencida.
4. Preparar un piloto de avisos con el Host disponible. Empezar por plazos y novedades recibidas, con enlaces y preferencias de frecuencia. Actualizar la ayuda para que explique el hilo único, la memoria y la recuperación de encargos.

**Se acepta cuando** un encargo autorizado termina o se puede retomar al cerrar la pestaña y reiniciar el Host, una doble confirmación produce un solo resultado y una revocación durante la ejecución protege el contenido. En el piloto del escritorio, una persona puede iniciarlo, observarlo, tomar el control y cerrarlo con datos ficticios. [Pruebas del hilo](../e2e/altazor-home.spec.ts) · [Pruebas del monitor](../e2e/altazor-desktop-activity.spec.ts).

## 4. Validar conexiones y mejorar el tratamiento de archivos

1. Pilotar por separado Google Drive, correo y acceso judicial chileno. Para cada conexión, mostrar cuenta, carpeta o tribunal, última operación, alcance y siguiente acción. Simplificar el consentimiento y la reconexión con un botón desde Configuración.
2. En PJUD, comprobar consulta pública por RIT/ROL y tribunal y acceso personal a Mis Causas con ClaveÚnica. Probar varios cuadernos, una resolución nueva, una descarga parcial y el vencimiento de sesión. Mantener el ingreso personal en el portal oficial y el seguimiento judicial como opción de configuración.
3. En Drive, probar lectura de carpetas autorizadas, reanudación, versiones, revocación y cambio de cuenta. Antes de ofrecer **sólo Drive** para originales, demostrar que se puede recuperar la revisión exacta y verificar su huella. Conservar la opción local y la opción combinada según la autorización concedida.
4. En Biblioteca y Documentos, mostrar el estado de OCR y transcripción y qué versión respalda cada cita. Medir perfiles locales pequeños con muestras en español y registrar RAM máxima, demora y calidad. Usar esas mediciones para decidir qué equipo y tareas admite cada perfil.

**Se acepta cuando** un fallo o permiso retirado deja el archivo pendiente con una explicación, la reconexión continúa desde ese punto y las citas anteriores siguen vinculadas a su versión autorizada. Registrar por separado pruebas con cuentas piloto y pruebas con servicios ficticios. [Sincronización](SINCRONIZACION.md) · [Operación PJUD](PJUD.md) · [IA local](IA-LOCAL.md).

## 5. Dar una salida propia a la investigación académica

1. Añadir fichas bibliográficas reutilizables con detección de coincidencias por DOI, ISBN o título y autor. Distinguir referencia bibliográfica, archivo accesible y pasaje cotejado.
2. Extender la Mesa de revisión para que cada sección del manuscrito lleve a los pasajes que la sostienen. Añadir una decisión del autor al cerrar una observación de revisión.
3. Exportar el manuscrito, su bibliografía y la revisión elegida. Llevar el mismo flujo a materiales de docencia, con lecturas vinculadas, actividades y una versión para compartir. Mantener los borradores académicos privados y las publicaciones externas bajo confirmación.

**Se acepta cuando** una persona importa una referencia, vincula un pasaje, corrige el manuscrito desde la Mesa y exporta la revisión seleccionada. Recuperar una versión conserva sus referencias y distingue los pasajes cuyo acceso cambió. [Pruebas de la Mesa](../e2e/academic-review.spec.ts).

## Trabajo transversal

- **Interfaz y ayuda.** Una acción principal por pantalla de trabajo. Estados vacíos con un siguiente paso. Configuración concentra diagnósticos, permisos y opciones avanzadas. Conservar la identidad índigo y plata, la mascota y la firma «Altazor». Comprobar lectura, foco y controles a 360 px, en escritorio y con teclado. Actualizar capturas del README con expedientes ficticios al cerrar cada entrega visible.
- **Clientes, portal y comunicaciones.** Vincular borradores a la causa y mostrar destinatario y adjuntos antes de enviar. Comprobar acceso del cliente con una sesión separada y permisos revocados.
- **Facturación y administración.** Consolidar horas, gastos y revisión de honorarios a partir del trabajo del estudio. Mantener accesos separados y registrar cambios de responsables, permisos y datos. Desarrollar esta parte después de estabilizar la coordinación de tareas.
- **Medición del piloto.** Tomar una línea base del tiempo de preparación de audiencia, pasos para abrir una fuente, porcentaje de importaciones que exigen intervención y recuperación de trabajos tras una interrupción. Comparar el mismo conjunto ficticio antes y después. Acordar con el estudio los objetivos del piloto a partir de esas medidas.

## Próximo ciclo de trabajo

El primer cambio de producto será **Novedades del expediente**. Empezará con correo y carga manual, que permiten probar el recorrido sin depender de una conexión externa. Primero se define qué ve el usuario y qué acción puede tomar, luego se reutilizan los registros de origen y versiones, y finalmente se ejecuta una prueba con reimportación, coincidencia ambigua y permisos distintos. Drive y OJV se añaden después del primer recorrido estable.

Distribución avanza en paralelo como entrega independiente. Tras Novedades, el siguiente cambio conecta la revisión posterior de audiencia con tareas y escritos. Cada entrega debe identificar su evidencia de funcionamiento, la revisión integrada y las comprobaciones operativas pendientes.
