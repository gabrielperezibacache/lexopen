# Publicación de las páginas de LexOpen — 7 de noviembre de 2026

Las páginas aprobadas del commit `d866763` están publicadas en:

- [Presentación de LexOpen](https://perezibacache.cl/lexopen/).
- [Privacidad de LexOpen](https://perezibacache.cl/lexopen/privacidad/).

## Respaldo y paquete

Antes de reemplazar la carpeta se registró el respaldo `RESPALDO-LEXOPEN-ANTES-CONEXIONES-2026-11-07.zip`, de aproximadamente 9,48 KB, en el directorio privado del alojamiento. El respaldo no forma parte de los archivos públicos.

Se extrajeron los 11 archivos aprobados. El primer paquete conservaba permisos `0600` en los archivos y produjo respuestas `403`. El paquete corregido se generó con [el empaquetador de páginas públicas](../../scripts/package-lexopen-public-pages.py): archivos regulares Unix `0644` y tres directorios `0755`.

La comprobación independiente del paquete confirmó su integridad ZIP, los 11 archivos idénticos a las fuentes y al paquete anterior, y la ausencia de enlaces simbólicos o rutas externas. Se conservaron las licencias OFL de Sora y Fraunces. El paquete corregido mide 2.984.357 bytes y su SHA-256 es `1ff4dc4a4871fda85372ca3725f108e8ba446a81333a872ff4dda37a9db7b9a9`.

## Comprobación pública

Los 11 recursos respondieron `200` mediante HTTPS. Nueve coinciden byte por byte con las fuentes aprobadas. Los dos HTML conservan todos sus caracteres originales y reciben únicamente una inserción idéntica de 367 caracteres: un script de Cloudflare Web Analytics servido desde `static.cloudflareinsights.com` por el alojamiento o su CDN. Por ello, esos HTML publicados no tienen la misma huella que los archivos fuente. Se identificó la inserción; no se descargó ni auditó su JavaScript externo.

La [portada del estudio](https://perezibacache.cl/) respondió `200` con el título «Estudio Jurídico Pérez Ibacache | Defensa integral». No se comparó su código con una fuente local.

Las respuestas, tamaños, huellas y límites de la revisión constan en [la evidencia de publicación](lexopen-publicacion-2026-11-07.json). La comparación utilizó cinco trabajadores y un máximo de 8 MiB por respuesta; no encontró una limitación de red o DNS.

## Estado de Google

Las direcciones públicas y el dominio se guardaron en la identidad de la aplicación de Google. En su consola oficial se verificó «Estado de publicación: En producción», junto con la opción «Volver al modo de prueba». Siguen pendientes el nuevo consentimiento de acceso renovable y la validación real de lectura de Google Drive. El estado de publicación no acredita por sí solo la verificación de marca o permisos por Google.
