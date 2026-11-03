# Continuidad de causas, biblioteca, audiencias y escritos

Fecha: 2 de noviembre de 2026. Base: `main@490d052228d8c8a77b90a03b4784eae0a9f16ec1`.

## Recorrido construido

Una navegación compartida muestra la causa actual y conecta Expediente, Biblioteca, Audiencias y Escritos. Conserva la tipografía, el papel, el cobre y el verde mar existentes; el destino activo se identifica con texto, subrayado y semántica. Los controles se reorganizan en móvil y respetan movimiento reducido.

Al entrar en biblioteca desde una causa, el servidor comprueba su acceso antes de mostrar el título. El contexto acompaña los libros, los pasajes y el retorno a la biblioteca. Desde el lector se puede seleccionar ese volumen en el cuaderno del escrito de origen, aunque exista otro borrador posterior. La incorporación de un pasaje sigue siendo explícita y comprobada por los servicios actuales. Consultar la biblioteca en ese contexto no comparte libros ni colecciones con el equipo de la causa.

## Problemas corregidos

| Apartado | Corrección |
| --- | --- |
| Biblioteca personal | La mesa conserva sus campos al cambiar de apartado. Abrir o generar otro borrador y salir de la biblioteca protegen cambios pendientes. El guardado bloquea los campos durante la petición y ofrece reintento conservando la edición. |
| Recuperación de biblioteca | Un fallo temporal del catálogo oculta el material y conserva la mesa en memoria. Al recuperar acceso o regresar a un borrador se comprueban nuevamente sus fuentes. |
| Audiencias | Las notas ordinarias y la agenda tienen protección conjunta antes de sustituirse, cambiar de mesa o navegar. Los conflictos conservan el texto local y permiten comparar la revisión guardada. Actualizar el dossier conserva la agenda en edición. |
| Lectura de audiencia | Retirar la fuente seleccionada abre la siguiente accesible. La mesa elegida queda en la dirección tras autorizar su lectura y se puede retomar al recargar. |
| Escritos | El cuaderno conserva volumen, búsqueda y página al consultar referencias o historial, con nueva lectura al regresar. El selector permanece estable durante búsquedas y los fallos temporales tienen reintento explícito. Un candidato no disponible se distingue de la retirada de acceso a un respaldo ya incorporado. |
| Teclado y contexto | Las pestañas de origen admiten flechas, Inicio y Fin. Los enlaces conservan localizador, causa y escrito sin transportar texto ni permisos en la dirección. |
| Interfaz de audiencia | La tipografía y los controles siguen las escalas compartidas. Al editar una nota se retira el aviso de guardado anterior, evitando confundirlo con el estado de la edición pendiente. Guardar un punto de lectura conserva una revisión marcada como Revisada. |

## Conservación y límites

La continuidad entre apartados conserva estado de la sesión en memoria; el guardado en el Host conserva el trabajo confirmado. Un aviso nativo protege recarga y salida con cambios pendientes. La protección de atrás/adelante de la mesa de biblioteca utiliza Navigation API cuando el navegador la admite; su disponibilidad depende del navegador. No se promete recuperación del trabajo sin guardar tras cerrar el navegador.

Las lecturas y exportaciones mantienen los servicios de autorización y cotejo existentes. Los ensayos utilizan material ficticio y servicios locales. Esta iteración no cambia proveedores de voz, calidad jurídica, corpus de fuentes ni formatos de exportación.

## Validación

- **16 recorridos Chromium distintos aprobados** en los archivos de preparación, continuidad, escritos, biblioteca, mesa de audiencia, integración conjunta, panel en vivo y transcripción. La última confirmación del recorrido y las notas completó 2 pruebas en 16,9 s.
- Lint del proyecto, comprobación de tipos y compilación de producción: aprobados.
- La compilación emitió cuatro avisos de rastreo de archivos dinámicos en `rate-limit.ts` y `storage.ts`, archivos que esta entrega no modifica. La compilación finalizó con código 0.
- Revisión independiente: se corrigió la vuelta al escrito de origen y se distinguió un candidato no disponible de una fuente ya incorporada que perdió acceso.
- Inspección conjunta de ocho [capturas reales de escritorio y móvil](continuidad-2026-11-02/README.md), seguida de una confirmación de los ajustes. Las huellas y dimensiones están en el manifiesto.
- Los usuarios temporales de los recorridos de causa y escritos fueron retirados de la base de prueba.

La remisión a una causa ajena devuelve la página de recurso no encontrado sin mostrar su título; la API conserva la respuesta 404. El App Router puede haber iniciado la respuesta de la página antes de resolver esa condición, por lo que la prueba comprueba también la pantalla protegida y la ausencia de datos.
