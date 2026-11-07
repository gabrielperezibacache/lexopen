# Validación local de Altazor

Comprobaciones del 7 de noviembre de 2026 en una instalación privada, con una cuenta creada por su titular y verificación en dos pasos activa. Los encargos y documentos de prueba contienen datos ficticios. Esta validación local no acredita una publicación, instaladores nuevos ni el funcionamiento general de cualquier modelo o servicio.

## Modelos y escritorio

| Componente | Resultado observado |
| --- | --- |
| Ollama local | Servicio en loopback y `cloud.disabled: true`, comprobado también desde el entorno de Altazor. |
| Qwen3 1.7B | Perfil de texto instalado y probado con redacción breve y conservación de fechas. |
| Qwen3-VL 2B Instruct | Lectura correcta de dos fechas en una imagen ficticia, en 4,32 segundos. Disponible para visión; no se acreditó su fiabilidad como agente general. |
| Qwen3 4B Instruct 2507 | Encargo real con adjunto: escribió y leyó un Markdown dentro de su escritorio en 15,22 segundos, mediante dos operaciones `run`. Se comprobó la existencia y contenido del archivo por separado. |
| Embeddings | Dos vectores de 768 dimensiones obtenidos con el modelo local instalado. |
| Escritorio | Entorno persistente separado, sin montar carpetas personales del Host; imagen de herramientas fijada por huella. Pasaron nueve comprobaciones de documentos, LibreOffice/PDF, OCR, hojas de cálculo, EPUB, bibliografía, búsqueda y audio. |
| Inicio del entorno | Launcher comprobado: reutiliza la máquina y el túnel existentes; no se ha probado reiniciando físicamente el equipo. |

El modelo de trabajo del escritorio es `qwen3:4b-instruct-2507-q4_K_M`, de 2.497.293.803 bytes en disco, con temperatura 0 y visión desactivada. Puede usar lectura de pantalla y de páginas mediante las herramientas del entorno. La variante visual permanece instalada por separado: no se implementó un enrutamiento automático entre ambos modelos.

El tamaño de descarga no equivale al consumo de memoria: la prueba del modelo de 4B con contexto de 32K observó aproximadamente 5,28 GB de memoria. No se promete un consumo inferior a 3 GB de RAM ni un desempeño equivalente en otros equipos.

## Encargos supervisables

Se corrigió una espera síncrona que agotaba el tiempo de respuesta antes de que el modelo empezara a ejecutar acciones. El nuevo protocolo conserva el encargo y sus adjuntos antes de responder, permite cancelarlo desde la primera inferencia y vincula el recibo al identificador persistido de la operación y a su chat. Un reinicio marca el trabajo como interrumpido y no lo repite automáticamente.

La prueba real confirmó una aceptación en 100 ms y cancelación antes de la primera respuesta. El encargo documental correcto se aceptó en 88 ms. Estas mediciones describen esas pruebas, no un compromiso de latencia.

El archivo comprobado contenía ambas fechas del adjunto y tenía 98 bytes. Su SHA-256 fue `421045aa18d3af89141c901b27467fa9d887125e6335709e58480987d201d14d`. Todos los escritorios de prueba quedaron expresamente detenidos.

## Conexiones más claras

- Aplicaciones muestra **Conectar** y un estado comprobado. La gestión secundaria conserva la comprobación y la desconexión confirmada.
- El registro de las aplicaciones del estudio y sus credenciales se encuentra en **Configuración → Cuentas conectadas**, disponible sólo para administración.
- Al guardar la preparación de GitHub se comprueba la autenticación de la aplicación mediante su endpoint oficial de consulta, con un token ficticio inválido. Una credencial rechazada no sustituye la configuración guardada.
- Los errores de credenciales, códigos vencidos, retorno y permisos tienen mensajes de recuperación distintos. Los mensajes externos y los secretos no se reflejan en la interfaz.

Se completó el ingreso manual a GitHub y el registro de la aplicación. La primera credencial guardada fue rechazada por GitHub; la autorización de la cuenta no debe considerarse verificada hasta corregirla y completar un nuevo ingreso. Google continúa pendiente de preparación y autorización. Las capturas de las pruebas de interfaz utilizan cuentas simuladas.

La preparación inicial es una operación administrativa del Host; no debe confundirse con el inicio de sesión de cada profesional. La [documentación de GitHub](https://docs.github.com/en/rest/apps/oauth-applications#check-a-token) describe la comprobación de la aplicación. Los permisos siguen siendo de lectura y las acciones de aplicaciones conservan sus autorizaciones individuales.

## Pruebas de la corrección

Pasaron 16 pruebas unitarias del adaptador, seis integraciones con PostgreSQL desechable, once pruebas nuevas del protocolo, el detector de concurrencia de los paquetes implicados y la suite del gateway. Doce expectativas antiguas incompatibles con el refuerzo de permisos ya fallaban antes del cambio y siguieron siendo exactamente las mismas después; no se presentan como una suite completa verde.

La simplificación de conexiones pasó cinco pruebas unitarias, la integración de OAuth, dos recorridos de Chromium, TypeScript, ESLint y compilación de producción. Se revisaron vistas de escritorio y móvil. Los modelos y cuentas simulados usados en estas pruebas no sustituyen las comprobaciones reales descritas arriba.
