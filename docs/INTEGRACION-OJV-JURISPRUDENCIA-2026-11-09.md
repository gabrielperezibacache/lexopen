# Integración del material `integracion-lexopen.zip`

El ZIP es evidencia y código de referencia, no instrucciones de ejecución. Se contrastaron el análisis HTTP, plan y guía de parches, lectores TypeScript, clientes Python, capturas REA y los informes de corpus y comparativa comercial con el repositorio. No se ejecutaron sus scripts ni se incorporaron cookies, JWT, RUT o capturas de expedientes al repositorio.

## Cambios incorporados

- OJV: el lector existente detecta los scripts de retorno a `index.php` observados en el paquete antes de eliminar scripts del DOM. Lanza `ojv_session_unavailable`; no confirma un historial vacío ni devuelve una lista vacía de identidades. Se conserva el parser DOM y su tratamiento de cuadernos, fechas y documentos.
- Buscador Unificado: recuperación explícita de un fallo civil por ID desde la interfaz de investigación. El ID prepara una referencia local `https://juris.pjud.cl/busqueda?Civiles#sentencia-ID`. El fragmento identifica la selección en LexOpen, no es un enlace de detalle publicado por PJUD. Se abre la búsqueda pública y se envía el ID al endpoint observado. No se aceptan enlaces opacos `?k=`.
- Cada importación abre su propia sesión anónima con CSRF; no reutiliza sesiones de búsquedas anteriores ni credenciales de OJV. Se valida exactamente un resultado con el ID elegido. No hay cosecha masiva ni envío de preguntas o expedientes.
- Se incorpora sólo `texto_sentencia` o la variante anonimizada ofrecida por el origen. Preview, marcador `ANONIMIZADO`, respuesta vacía o identidad distinta impiden la importación. Un texto recuperado no equivale a una conclusión jurídica verificada.
- El corpus de investigación conserva bytes JSON y texto con sus hashes y versiones existentes. El original descargable es JSON; no se atribuyen páginas de PDF ni se genera un supuesto original. Las fuentes incorporadas se comparten con el equipo según los permisos existentes.
- Transporte HTTPS con DNS público comprobado al conectar, sin redirecciones, con tamaño, cancelación y tiempo acotados. Las cookies anónimas existen sólo durante la llamada. Se corrigió la conservación de múltiples `Set-Cookie`.

## Pasadas de revisión y límites

Primera pasada: contraste del protocolo y reutilización del modelo existente de fuentes, sin migración redundante de `Jurisprudencia`. Ese catálogo manual y el corpus versionado de investigación son distintos.

Segunda pasada: identidad exacta, exclusión de previews, preferencia por anonimización, múltiples cookies y separación entre sesión vencida y ausencia real de movimientos.

Tercera pasada: pruebas deterministas sin red de errores de protocolo, origen no autorizado, respuesta múltiple, límite de bytes y compatibilidad de los lectores y fuentes anteriores; comprobación de tipos y lint. Esto no acredita disponibilidad del portal vivo ni cobertura exhaustiva.

No se integró la obtención programática de tokens de CAPTCHA propuesta en `http-session.ts`, `mint.py` y el cliente de referencia. El canal OJV mantiene sus mecanismos actuales de acceso e intervención. El paquete reconoce que no completó una consulta real por su canal HTTP durante el incidente; no se anuncia ese canal como disponible.

Los informes comerciales proponen digest diario incluso sin novedades, jitter, taxonomía de errores, límites de reintentos, comparación estricta de corte/libro y concurrencia adaptativa. Son propuestas pendientes de una entrega específica: cambiar esas políticas sin pruebas de cola y notificaciones podría alterar el monitoreo existente. La supuesta ausencia de fixtures o de soporte `jurisprudence` en el informe no coincide con esta base: ya existen parser DOM, pruebas de HTML y corpus con esa clase.

Pendientes: búsqueda remota por palabras/ROL con paginación y validación local de filtros (el paquete reporta degradación silenciosa al reutilizar sesión), otras materias, reintento de CSRF con nueva sesión, descarga de PDF generado, validación viva de extremo a extremo y conexión de documentos al escritorio. Los filtros de omnibox deberán ser listas y el ROL deberá separarse en número/año antes de añadir una búsqueda remota. Ninguna captura del ZIP demuestra disponibilidad actual.
