# Conexiones de Altazor: validación del 7 de noviembre de 2026

La instalación privada conservó la conexión de GitHub después de actualizar y reiniciar sus componentes. Google se publicó en modo Producción, el usuario completó personalmente el consentimiento y LexOpen confirmó «Conexión guardada. El acceso se renueva automáticamente». La comprobación real consultó la identidad de Drive con los permisos de lectura ya autorizados. No se midió todavía una renovación real tras vencer el access token; el almacenamiento y la renovación se verificaron también mediante pruebas simuladas.

La presentación y privacidad están [publicadas y verificadas](perezibacache-site/LEXOPEN-PUBLICACION-2026-11-07.md). El modo Producción no equivale a la verificación pública de Google: todavía apareció su aviso de aplicación sin verificar, que el usuario revisó y continuó personalmente.

## Archivos en el escritorio real

Desde la conversación se encargó descargar `README.md` de `gabrielperezibacache/lexopen`. La solicitud visible indicó ese repositorio y archivo exactos; se autorizó únicamente esa lectura. El conector descargó el archivo completo y entregó una ruta local verificada. Una lectura independiente dentro del contenedor confirmó 8.696 bytes y SHA-256 `57a734f306608547fce2d7646b8e48f553a3c526314e542c6a0179495f0f9115`, coincidentes con el recibo.

El modelo local dio una primera línea incorrecta, aunque la copia era íntegra. En otro encargo con el archivo público de ejemplo de Google afirmó haber descargado un PDF de cinco páginas, pero no generó una solicitud de autorización ni un recibo de descarga. La comprobación independiente encontró cero copias con el nombre solicitado. **La descarga de ese PDF no queda validada.** La disponibilidad de una cuenta y el texto del modelo no acreditan una tarea realizada.

El escritorio de prueba se detuvo al terminar. Se conserva como pendiente mejorar la ejecución efectiva de herramientas y contrastar las afirmaciones del modelo con sus resultados; no se accedió a otros archivos privados para estas pruebas.

## Conexión sencilla para nuevas instalaciones

Se incorporó un perfil público opcional de distribución: cliente instalado de Google con PKCE y autorización por dispositivo de GitHub. No se distribuyen el secreto web del estudio, tokens de cuenta ni credenciales personales. Las preparaciones que ya existían tienen prioridad.

El retorno de Google desde el navegador del sistema sólo guarda una respuesta cifrada. La sesión original y autenticada de LexOpen debe reclamarla para intercambiarla y guardar la conexión. GitHub conserva su código de dispositivo cifrado, limita el sondeo y aplica la misma validación de identidad, permisos de lectura y guardado único. El catálogo habitual de Google y GitHub ya no contiene formularios de tokens o registro.

Las pruebas de integración con PostgreSQL y proveedores simulados verificaron la separación de sesiones, el retorno sin cookie, el cifrado, el sondeo concurrente, la espera solicitada por GitHub y el guardado único. Pasaron 17 pruebas unitarias, TypeScript, ESLint, la compilación de producción y 10 recorridos de Chromium, incluidos cuatro nuevos de conexiones distribuidas. Las pruebas del parser, arranque y recursos de los instaladores también pasaron con perfiles ficticios.

El perfil real del publicador, su inclusión en una nueva publicación y la validación en una instalación nueva siguen pendientes. El soporte de distribución no elimina los requisitos de Google ni prepara por sí solo un escritorio dedicado para cada nuevo miembro de un Host compartido.
