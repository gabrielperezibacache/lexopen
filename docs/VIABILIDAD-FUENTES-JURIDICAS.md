# Fuentes jurídicas: primer conector y cobertura comprobada

Comprobación: 1 de noviembre de 2026. Este incremento obtiene fuentes directamente de organismos oficiales y mantiene su snapshot local; no usa TRIFOLIA, índices de terceros ni una cuenta comercial de búsqueda.

Seguimiento: los resultados de esta página corresponden al primer ensayo. La [ampliación posterior](FUENTES-OFICIALES-AMPLIACION.md) comprobó BCN actual e histórica en vivo y añadió oficios SII; sustituye el estado anterior de indisponibilidad para las vías expresamente verificadas.

## Resultado comprobado

| Organismo y recurso | Acceso observado | Implementación |
| --- | --- | --- |
| Dirección del Trabajo: [ORD.N°252/20](https://www.dt.gob.cl/legislacion/1624/w3-article-129188.html) | HTTPS 200, HTML de 155.036 bytes; artículo extraído de 22.528 caracteres; fecha de cabecera 2026-04-16 | Importación de una URL individual, cuerpo del pronunciamiento y metadatos. Conserva HTML original. No descarga scripts ni estilos y no ejecuta contenido |
| BCN/LeyChile: [norma individual](https://www.bcn.cl/leychile/navegar?idNorma=242302) y XML `consulta/obtxml` | HTTPS 401 de CloudFront, respuesta vacía desde esta red; mismo resultado en hosts legacy, JSON y LeyFácil | Canonicalización y parser del formato documentado, con pruebas de fixture. La importación en vivo informa indisponibilidad; no convierte un bloqueo en una fuente obtenida |
| [Datos abiertos BCN / SPARQL](https://datos.bcn.cl/es/informacion/endpoint-sparql/documentacion/normas) | La consulta mínima directa agotó su tiempo en esta sesión | Sin conector de búsqueda federada habilitado |
| [Código del Trabajo publicado por DT](https://dt.gob.cl/legislacion/1624/articles-95516_recurso_1.pdf) | HTTPS 200, PDF de 3.900.523 bytes | Viabilidad de acceso comprobada; este conector de URL todavía no importa PDFs jurídicos. Puede incorporarse por el flujo documental autorizado |
| [Índice de resoluciones SII](https://www.sii.cl/normativa_legislacion/resoluciones/2026/res_ind2026.htm) | HTTPS 200, HTML de 72.917 bytes | Es un índice, no un documento individual validado. No se ofrece como cobertura del SII |
| Jurisprudencia judicial, CGR, doctrina y otros organismos | Sin aceptación de un flujo completo en este incremento | Pendientes; no se presentan como conectores disponibles |

El conector DT admite únicamente `https://www.dt.gob.cl/legislacion/1624/w3-article-<id>.html` y su equivalente sin `www`. Selecciona el cuerpo y la cabecera del artículo; menús, scripts, elementos ocultos y pronunciamientos relacionados no pasan al texto de investigación. Si el sitio cambia su estructura, la importación falla de manera explícita.

El ensayo DT conservó SHA-256 del HTML `df04326f66cac76b629e2c1ba67c850ed0dbe8532ad87c5c84ceafeb40d7171f` y del texto extraído `b573ec05befa73d42a224e33a3caa7d878171e10216816104c1aff45a7602c0c`. Identifican esa respuesta concreta; una consulta posterior puede recibir otra versión.

LeyChile acepta una norma identificada por `idNorma`, con `idVersion=AAAA-MM-DD` opcional. La [especificación de intercambio publicada por BCN](https://www.leychile.cl/esquemas/accesoLeyesChilenas4.pdf) documenta el XML, su identidad y sus fechas. El parser comprueba identidad, estructura reconocible y cierre de elementos; una solicitud histórica solo se admite si la respuesta confirma esa fecha de versión. Esta preparación no acredita que el endpoint bloqueado esté operativo en una instalación determinada.

## Procedencia y fechas

- Una obtención automática conserva URL canónica, URL de descarga, bytes originales, fecha de consulta y texto extraído. La versión de contenido y las citas se almacenan en LexOpen.
- La fecha de cabecera DT y la fecha `fechaPublicacion` de BCN se conservan cuando están presentes. No se deducen fechas de inicio/término de efectos ni vigencia comprobada de la fecha de descarga.
- Un documento jurídico puede haber sido modificado, reconsiderado o derogado después de su publicación. La interfaz debe conservar la advertencia y permitir revisar la fuente original.
- Pegar una copia identificada manualmente es una adquisición distinta: no acredita que LexOpen la haya obtenido del organismo ni que coincida con el documento que hoy publica esa URL.
- Importar una fuente individual no acredita haber investigado todas las fuentes favorables y contrarias, ni cobertura completa de un organismo.

## Transporte y límites

HTTPS, hosts y rutas permitidos explícitamente, sin cookies o credenciales del usuario. El transporte no sigue redirecciones y comprueba que el DNS no apunte a direcciones privadas al conectar. El límite de descarga es 8 MiB y el tiempo total, 20 segundos; el texto se limita a dos millones de caracteres. No se envían preguntas, nombres de causas ni documentos internos para importar una URL pública.

Las pruebas interceptan transporte y comprueban URL no admitida, redirección a localhost, respuesta 401, estructura HTML ausente, formato inesperado, tamaño, cancelación, tiempo límite, identidad XML y versión histórica incompatible. Los errores conservan una respuesta de indisponibilidad o formato, sin fabricar contenido para continuar.

Firecrawl CLI estaba instalado y autenticado, pero devolvió `ENOTFOUND api.firecrawl.dev`. La investigación de viabilidad se contrastó con documentación primaria y solicitudes HTTPS directas. La aplicación no incorpora ese servicio como dependencia necesaria de este flujo.
