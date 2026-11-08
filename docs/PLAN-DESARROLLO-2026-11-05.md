# Desarrollo de LexOpen: trabajo conectado y MIDNIGHT editorial

Estado posterior: consulte las [correcciones de auditoría del 7 de noviembre](CORRECCIONES-AUDITORIA-2026-11-07.md). Este plan conserva la planificación de su fecha; Novedades y los recorridos académicos ya están implementados.

Fecha: 5 de noviembre de 2026. Este plan continúa la aplicación existente y prioriza preparar causas, audiencias y escritos con fuentes. La revisión de rutas está en [la auditoría de interfaz](AUDITORIA-INTERFAZ-2026-11-05.md); la dirección visual, en [las referencias y decisiones gráficas](REFERENCIAS-GRAFICAS-2026-11-05.md).

## Orden de implementación

| Etapa | Trabajo y dependencia | Criterio de aceptación |
| --- | --- | --- |
| 1. Base | Conservar permisos, originales, migraciones y guardas de las fuentes | Instalación desde cero y pruebas de revocación; sin migrar el Host real para validar |
| 2. Un solo ALTAZOR | Compartir conversación y borrador entre Inicio y acompañante; conservar enlaces e historial del Copiloto anterior | Navegar entre Biblioteca e Inicio mantiene el encargo; un enlace antiguo prepara un borrador y no lo envía |
| 3. Persistencia | Preferencias por usuario, memoria confirmada y cola durable de mensajes enviados | Un trabajo en cola puede terminar sin su pestaña; sesiones revocadas, trabajos interrumpidos y escrituras sin confirmar no se reproducen |
| 4. Trabajo por causa | Herramientas para consultar biblioteca, crear audiencia, guardar notas y convertir una respuesta documentada en escrito | El resultado vuelve a su causa y fuentes; otro usuario o una fuente revocada impiden su uso |
| 5. Académico | Investigar, Escribir y Enseñar con objetivo, fuentes y trabajo; editor, versiones y recuperación | Objetivo y selección sobreviven al reabrir; conflictos no sobrescriben; recuperar produce una revisión nueva |
| 6. Drive | Conexión personal sencilla y cuenta del estudio; elección de carpeta y subcarpetas, frecuencia y pausa | Renovación de lectura cifrada; originales/versiones preservados; un archivo inaccesible no bloquea los siguientes |
| 7. OJV | Entrada clara a ClaveÚnica, consulta pública e importación; autorización de descarga por profesional | Todos los cuadernos disponibles pasan por la cola; las descargas pendientes esperan el ingreso manual al vencer la sesión |
| 8. Interfaz | Títulos, gráfico propio del acompañante y limpieza de textos/formularios de uso diario | Inicio utilizable a 360 × 800; teclado y panel accesibles; detalles técnicos fuera de la acción principal |
| 9. Entrega | Compilación aislada, pruebas integradas, revisión independiente, capturas y README | Documentar qué se verificó con servicios ficticios y qué requiere todavía una cuenta real; comprobar integración y artefactos publicados |

## Trabajo por apartado

| Apartado | Secuencia de trabajo | Comprobación necesaria |
| --- | --- | --- |
| **Inicio / ALTAZOR** | Escribir → adjuntar o elegir respaldo → enviar → revisar propuesta → abrir resultado | Una sola conversación privada, causa fija, consentimiento de IA remota cuando corresponde; envío incierto no duplicado |
| **Memoria** | Proponer recuerdo → confirmar → consultar relaciones → editar o retirar | Separación entre memoria personal y de causa; una inferencia del modelo no se vuelve un recuerdo confirmado |
| **Conexiones y Secretos** | Preparación administrativa una vez → ingreso oficial del profesional → prueba de acceso → operación concreta | Ninguna contraseña o token aparece en conversación; Secretos conserva autorización breve, sesión y control humano |
| **Escritorio** | Elegir causa o espacio personal → abrir equipo → encargar tarea con archivos elegidos → revisar resultado → detener | Reserva, arranque, captura, control manual, vencimiento y cierre distinguidos; no copiar el navegador habitual |
| **Causas** | Importar o crear → responsables → expediente → hechos y cronología → audiencia → escrito | Lectura y escritura dependen del acceso actual; una causa privada coincidente por RIT no se modifica desde otro usuario |
| **Sincronización judicial** | RIT/ROL y tribunal o ClaveÚnica manual → seleccionar causas → importar → elegir seguimiento, documentos y frecuencia | Estado de movimientos separado del de descargas; autorización durable y límite de tamaño durante lectura, no después |
| **Drive y documentos** | Conectar cuenta → buscar carpeta por nombre → confirmar raíz y subcarpetas → activar frecuencia → consultar originales | Cambiar cuenta, carpeta o permisos invalida trabajos antiguos; una versión nueva conserva la anterior; desconectar pausa sin borrar copias |
| **Biblioteca** | Añadir libro o sentencia → elegir conversión/original → organizar estante → leer/anotar → elegir pasaje | Propiedad privada y colecciones compartibles; localizador y versión verificables; conservar las seis composiciones existentes |
| **Investigación jurídica** | Formular pregunta → consultar fuentes oficiales disponibles → incorporar texto → verificar respaldo | No confundir acceso a un resultado de búsqueda con descarga de su fuente; bloqueos del sitio se informan |
| **Audiencias** | Preparar guion y documentos → entrar al panel → registrar notas/audio voluntariamente → revisar transcripción → convertir en hechos o escrito | El registro no se graba sin acción; distinción entre nota, transcripción revisada y hecho respaldado |
| **Escritos** | Reunir fuentes → crear borrador → editar con guardado automático → recuperar versión → exportar | Word con notas al pie reales y referencias verificadas; fuente retirada bloquea el uso; nada se presenta al tribunal automáticamente |
| **Académico** | Investigar / Escribir / Enseñar → objetivo → fuentes → propuesta → editor → historial → Word o incorporación a causa | Matriz, bibliografía y perfiles conservados; descubrimiento identificado como búsqueda, sin inventar corpus o convocatorias |
| **Agenda, plazos y tareas** | Revisar próximos vencimientos → asignar → registrar avance → abrir causa | No recalcular un plazo jurídico como si fuera una regla universal; enlaces y responsables correctos |
| **Clientes y comunicaciones** | Abrir ficha → expediente → borrador o mensaje revisado → confirmar envío | Separación de cliente/estudio, destinatario visible y confirmación de comunicaciones externas |
| **Minutas y espacios** | Plantilla en lenguaje normal → completar → guardar → incorporar archivos y fuentes | JSON reservado a formato avanzado y validado; preservar versiones y permisos del espacio |
| **Honorarios** | Horas/gastos → cuenta corriente → factura → revisión | Mantener cálculos y restricciones contables; la asistencia no realiza cobros sin autorización |
| **Configuración y mantenimiento** | Preparar proveedores → comprobar estado → actualizar con respaldo → recuperar si falla | La disponibilidad del Host y la firma real del instalador se documentan; no afirmar actualización automática de un paquete sin firma |

## Límites y siguiente validación operativa

- «Persistente» significa conversación, memoria y trabajos guardados por usuario. La ejecución requiere que el Host y sus servicios estén disponibles.
- La cola de ALTAZOR procesa encargos enviados expresamente durante un máximo de 24 horas; un encargo antiguo pide revisión. No confirma sus propias escrituras.
- Google solicita un consentimiento distinto para leer contenido y renovar el acceso. El conector de metadatos del escritorio no se amplía silenciosamente. El administrador registra la aplicación y cada profesional autoriza su cuenta.
- Drive actualiza la raíz elegida y sus subcarpetas dentro de límites de profundidad y cantidad. No replica indiscriminadamente todo Drive ni borra originales locales al eliminarse un archivo remoto.
- ClaveÚnica continúa siendo un ingreso manual en el portal oficial. No hay promesa de una sesión judicial permanente, ni recuperación de credenciales desde otro navegador.
- Las pruebas con proveedores sintéticos acreditan lógica, persistencia, permisos y recuperación. El ingreso y las descargas con cuentas reales requieren una validación aparte cuando la configuración oficial esté preparada.
- Las interacciones académicas sociales se preparan para LinkedIn. LexOpen no incorpora una red social interna ni publica por cuenta del profesional sin revisión.
