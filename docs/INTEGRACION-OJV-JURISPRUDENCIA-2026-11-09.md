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

Pendientes: otras materias, descarga de PDF generado, validación viva de extremo a extremo y conexión de documentos al escritorio. Los filtros de omnibox deberán ser listas y el ROL deberá separarse en número/año antes de añadir una búsqueda remota. Ninguna captura del ZIP demuestra disponibilidad actual.

## Segunda entrega: búsqueda pública paginada

El formulario de Fuentes permite consultas explícitas por términos y ROL, separadas de la investigación local. El ROL se descompone en número y año; el origen recibe `filtros_omnibox: []`. Cada página abre sesión nueva. Se admiten diez resultados por página y veinte páginas como máximo, con doce peticiones por minuto y usuario. La ruta exige personal autorizado con `assistant.use`, CSRF y cuerpo acotado; la respuesta no se almacena en caché.

Se rechazan IDs duplicados, respuestas de estructura incompatible y cualquier fila con número o año de ROL distinto del solicitado. La coincidencia de términos sigue siendo declarada por el servidor, porque el listado no es el fallo completo. El total remoto se etiqueta como declarado y las páginas pueden cambiar si el portal actualiza el índice. Los resultados no se incorporan al corpus ni se convierten en citas hasta recuperar individualmente el texto íntegro.

La interfaz invalida resultados al cambiar filtros, cancela peticiones y descarta respuestas de solicitudes anteriores. El acceso a una página inicia una sesión anónima independiente. Las pruebas deterministas verifican filtros, deriva del ROL/año, sesiones por página, duplicados y cancelación; el recorrido de navegador usa respuestas simuladas del endpoint de búsqueda.

El CI de la primera entrega detectó además un conflicto serializable al auditar cambios simultáneos del país de trabajo. Se reintenta la transacción completa cuando el error de auditoría conserva una causa Prisma `P2034`; otros fallos de auditoría siguen abortando. Se añadió una regresión con conflicto inyectado y auditoría única, ejecutada en PostgreSQL desechable.

## Tercera entrega: sesiones y verificación viva

Las consultas y la recuperación individual renuevan la sesión completa una sola vez ante HTTP 419 del POST de búsqueda. Se descartan cookies, CSRF, identificador del buscador y cuerpo anteriores. Un segundo 419 devuelve error; 401, 403, 429 y errores del servidor no activan este reintento. La cancelación o el vencimiento del plazo común impiden renovar la sesión. La paginación rechaza además un `response.start` distinto del desplazamiento solicitado cuando el servidor lo informa, y filas que excedan el total declarado.

El 9 de noviembre de 2026 se verificaron búsqueda y recuperación individual contra el portal vivo mediante el proxy del entorno de desarrollo: cinco resultados para C-3630-2023, identidad PJUD:202921948 y recuperación de JSON con 438.154 bytes y texto con 373.928 caracteres. No se guardaron en el repositorio texto, cookies ni tokens. Esta muestra no acredita cobertura, paginación completa ni disponibilidad permanente.

El transporte de producción con DNS público comprobado al conectar falló desde este entorno con `ECONNREFUSED`. Se conserva esa protección: no se sustituyó por un transporte que delegue el DNS al proxy. Por tanto, la prueba viva acredita el contrato del portal mediante transporte de prueba, no conectividad del Host desplegado.

Prueba optativa, excluida de la suite sin red:

```sh
PJUD_LIVE_CONFIRM=1 PJUD_LIVE_ROL=C-3630-2023 npm run test:pjud:juris:live
```

En un entorno de desarrollo que sólo tiene salida por proxy, con una versión de Node compatible con `NODE_USE_ENV_PROXY`, añadir `PJUD_LIVE_USE_ENV_PROXY=1 NODE_USE_ENV_PROXY=1`. Esto cambia exclusivamente el transporte del script de prueba. El informe identifica el transporte y muestra identidad, tamaños y hashes, sin persistencia, PDF ni uso de modelos.

El PR #274 quedó integrado con todos los controles obligatorios aprobados. El ensamblado opcional de instaladores rechazó la procedencia de darwin-x64 pese a construir los cuatro paquetes nativos; no se relajó la comprobación ni se afirma una nueva publicación de instaladores.
