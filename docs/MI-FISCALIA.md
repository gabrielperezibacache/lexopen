# Mi Fiscalía: solicitudes y seguimiento

En **Causas → Mi Fiscalía** puedes preparar solicitudes, vincularlas con una causa, descargar su preparación y conservar el seguimiento del estudio. El acceso directo desde el expediente mantiene la causa seleccionada.

## Ingreso con ClaveÚnica

**Abrir Mi Fiscalía con ClaveÚnica** abre el portal oficial del Ministerio Público. Se utiliza la misma identidad del Registro Civil que permite ingresar a OJV. El portal verifica la calidad de interviniente y la representación que corresponda. Las sesiones de OJV, Mi Fiscalía y LexOpen son independientes: abrir el enlace no acredita una sesión autenticada.

LexOpen no solicita ni copia otra contraseña, no exporta cookies de OJV y no entrega a este apartado las credenciales guardadas del estudio. El usuario completa el ingreso y la presentación en el sitio oficial. No se presupone una API de presentación ni una sincronización autenticada que el portal no haya confirmado.

Fuentes oficiales consultadas el 10 de noviembre de 2026:

- [Preguntas frecuentes de Fiscalía](https://www.fiscaliadechile.cl/preguntas-frecuentes): acceso mediante ClaveÚnica y servicios disponibles.
- [Portal Mi Fiscalía en Línea](https://agenda.minpublico.cl/app/fiscalia-en-linea/#/login), enlazado desde la web institucional.
- [Avisos de mantención](https://www.fiscaliadechile.cl/mantencionfiscaliaenlinea). Durante la verificación, el portal respondió HTTP 503; la integración no presenta una comprobación personal de ingreso como realizada. Los borradores locales permiten continuar la preparación cuando el portal no está disponible.

## Flujo de trabajo

1. **Borrador:** elegir la causa, comprobar el RUC, indicar el tipo y redactar la solicitud. El RUC de la causa se propone como dato a revisar.
2. **Lista para presentar:** revisar contenido y antecedentes en el expediente. Descargar la preparación en texto si facilita el ingreso en el portal.
3. **Presentación en Mi Fiscalía:** ingresar con ClaveÚnica, revisar los antecedentes y completar la gestión oficial personalmente. Guardar su comprobante con los documentos de la causa.
4. **Enviada · registro manual:** registrar folio y fecha del comprobante y confirmar expresamente la presentación. Este estado es una declaración del usuario, no una verificación del portal.
5. **Respuesta registrada:** incorporar el texto y la fecha de respuesta. Revisarla antes de cerrar el seguimiento.

Un borrador o una solicitud preparada pueden marcarse **Descartada** sin registrar una presentación. Conservan su historial y se consultan con el filtro correspondiente; descartar no retira ninguna solicitud del portal oficial.

Puede elegirse una fecha de revisión interna. No se calcula como plazo legal ni garantiza una respuesta de Fiscalía. No se aceptan presentaciones futuras ni respuestas anteriores a la presentación. Se conserva el contenido una vez registrado como presentado y la respuesta una vez registrada; otra gestión requiere otra solicitud. El historial conserva actor, fecha y estado de los últimos cambios visibles.

Los tipos incluyen información, diligencias, copias, antecedentes, reapertura, protección, acreditación y otras solicitudes. La preparación local no amplía los trámites ni los permisos disponibles en el portal.

## Permisos, persistencia y estado automático

La lectura respeta el muro ético de cada causa. Crear o modificar requiere permiso de escritura sobre esa causa; la pertenencia de solo lectura no concede edición. Los listados, las descargas y los reintentos vuelven a comprobar el acceso. No se puede trasladar una solicitud a otra causa. El guardado usa recibos de idempotencia y comprueba la versión para evitar duplicados y sobrescrituras concurrentes.

La bandeja muestra hasta 100 solicitudes y permite filtrar por causa y estado. El historial de cada registro presenta los últimos 15 cambios. Los registros permanecen en PostgreSQL, incluidos al actualizar o reiniciar el Host. La migración `20261110020000_fiscalia_requests` agrega sus tablas sin modificar el almacén de ClaveÚnica; se aplica mediante el flujo habitual de migraciones del Host.

El estado automático de la causa incluye estas gestiones: un borrador requiere completar contenido, una solicitud preparada requiere presentación, una presentación registrada puede esperar respuesta y una respuesta registrada requiere revisión. El contexto de IA recibe metadatos seleccionados, no el contenido completo de solicitudes ni credenciales. Se identifica la procedencia manual y las citas válidas abren Mi Fiscalía con la causa filtrada.
