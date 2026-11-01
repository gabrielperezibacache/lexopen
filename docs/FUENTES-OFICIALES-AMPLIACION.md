# Ampliación de fuentes oficiales de investigación

Verificación: **1 de noviembre de 2026, 20:22–20:29 UTC**. Esta entrega amplía el importador propio de LexOpen; no utiliza cuentas, índices, API, MCP ni suscripciones de TRIFOLIA. Las consultas de investigación siguen trabajando sobre las copias incorporadas en el Host.

## Fuentes admitidas y contrato

`fetchPublicLegalSource(url, options?)` conserva el contrato `FetchedLegalSource`: URL canónica, URL de recuperación, título, organismo, clase, identificador externo, fecha de publicación cuando consta, texto, formato, bytes originales, advertencias y momento de consulta. No cambia el esquema de persistencia ni añade páginas PDF a las fuentes jurídicas.

`describePublicLegalSource(url)` devuelve `{ canonicalUrl, organism, kind }` usando la misma lista cerrada que la descarga. Permite identificar también una copia manual sin clasificar erróneamente el SII como BCN. `validatePublicLegalSourceUrl` continúa devolviendo la URL canónica. Una copia manual conserva su procedencia manual en la capa de importación; describir su URL no prueba que coincida con el original.

| Organismo | Enlace individual de entrada | Recuperación | Clase |
| --- | --- | --- | --- |
| BCN / LeyChile | `https://www.bcn.cl/leychile/navegar?idNorma=242302` | XML oficial `consulta/obtxml?opt=7&idNorma=242302` | legislación |
| BCN / LeyChile, versión histórica | Mismo enlace con `&idVersion=2005-09-22` | JSON público de `nuevo.leychile.cl/servicios/Navegar/get_norma_json` | legislación |
| Dirección del Trabajo | `https://www.dt.gob.cl/legislacion/1624/w3-article-129188.html` | HTML individual | administrativa |
| SII, Renta | `https://www.sii.cl/normativa_legislacion/jurisprudencia_administrativa/ley_impuesto_renta/2016/ja2151.htm` | HTML individual | administrativa |
| SII, IVA | `https://www.sii.cl/normativa_legislacion/jurisprudencia_administrativa/ley_impuesto_ventas/2016/ja2482.htm` | HTML individual | administrativa |

Los alias sin `www` se normalizan. Se mantienen los enlaces individuales antiguos de SII `/pagina/jurisprudencia/adminis/YYYY/renta/jaN.htm` y `/ventas/jaN.htm`: recuperan el original solicitado y se agrupan bajo la URL moderna de la misma materia, año y oficio. No se siguen redirecciones ni enlaces presentes dentro del documento.

## BCN: acceso real y versión histórica

El endpoint XML oficial respondió HTTP 200 al transporte nativo de LexOpen, sin credenciales ni cookies. La observación anterior de HTTP 401 queda sustituida por esta comprobación fechada; no implica disponibilidad permanente. Las respuestas 401 y los errores de red siguen siendo errores visibles y permiten recurrir a una copia manual identificada.

La [especificación pública de intercambio XML de BCN](https://www.leychile.cl/esquemas/accesoLeyesChilenas4.pdf), página 8, describe el servicio `opt=7` como el texto actualizado, compuesto por las últimas versiones de sus partes. La prueba HTTP confirmó que añadir `idVersion` al XML **no recuperaba** el texto de 2005: devolvía el XML actual. Por eso las versiones históricas usan una vía diferente.

La aplicación pública de BCN declara el servicio `https://nuevo.leychile.cl/servicios` en su [código JavaScript publicado](https://www.bcn.cl/leychile/main.7ef1863cfdb17aa963e4.bundle.js) y consulta `Navegar/get_norma_json` con `idNorma`, `idVersion` y parámetros auxiliares. El importador genera esta petición exclusivamente para una norma y fecha explícitas, con valores auxiliares fijos y vacíos; no reenvía consultas, nombres de causas ni texto del usuario.

La respuesta histórica se acepta únicamente si:

- `metadatos.id_norma` coincide con la norma solicitada.
- `metadatos.fecha_version` y `metadatos.vigencia.inicio_vigencia` coinciden con la fecha exacta de versión pedida. Una fecha arbitraria dentro de un intervalo no se acepta como otra versión; si no coincide, responde 409.
- El árbol de texto `html` y el árbol `estructura` contienen las mismas partes identificadas, sin duplicados, con profundidad y cantidad acotadas.
- Hay texto suficiente. Sólo se extrae el árbol normativo; los proyectos, jurisprudencia y doctrina relacionados de la respuesta no se convierten en articulado.

La fecha de versión se conserva en las advertencias de procedencia y en los bytes originales. `publishedAt` proviene de la fecha de publicación. `effectiveFrom` y `effectiveTo` permanecen sin asignación automática. Las alertas publicadas por BCN se muestran como alertas de la fuente, incluida la indicación de que una versión histórica ya no se encuentra vigente; LexOpen no emite una certificación propia de vigencia.

El XML valida identificador, raíz única, estructura, fecha de versión y cierres. Rechaza DTD, entidades declaradas, truncamientos y documentos de formato incompatible. El JSON histórico conserva notas del texto, pero no interpreta imágenes ni adjuntos binarios. Los HTTP 200 que sólo entregan la carcasa de la aplicación JavaScript se rechazan como formato incompatible.

## SII: oficios identificados, Renta e IVA

El nuevo parser reconoce tanto el HTML antiguo completo como el fragmento HTML moderno. Verifica número y año contra la URL, una fecha real en la cabecera y un cierre de oficio concordante. Extrae el cuerpo del oficio, excluye navegación, scripts y contenido oculto, y conserva sus bytes originales. El título incluye número, fecha y asunto cuando está disponible.

Las páginas antiguas declaran ISO-8859-1 mediante una etiqueta `meta`, aunque la cabecera HTTP sólo diga `text/html`. La decodificación reconoce esa declaración; se comprobaron las dos representaciones oficiales del oficio 2151/2016, con bytes diferentes y **el mismo hash de texto**. No se transforma la fecha del oficio en fecha de vigencia de su criterio.

El alcance se limita a los oficios individuales de Renta e IVA que conservan este formato. No se anuncian como cubiertos los índices anuales, las resoluciones, circulares, jurisprudencia judicial ni el conjunto de publicaciones recientes del SII. El índice de Renta 2026 respondió 200, pero su HTML carga un servicio de publicaciones y archivos PDF mediante JavaScript: ese índice no es un oficio y no se importa como tal.

## Seguridad y comprobaciones

Se mantiene el transporte HTTPS propio, la validación DNS pública en el momento de conexión y la validación TLS del nombre original. No hay proxy comercial, ejecución de JavaScript, cabeceras de sesión, autenticación, redirecciones automáticas ni descargas secundarias. La solicitud se identifica como `LexOpen/1.0 (public legal source importer)`.

El límite sigue siendo 8 MiB y 20 segundos por descarga, con cancelación y límites durante la lectura; el texto final no supera dos millones de caracteres. Se rechazan esquemas HTTP, credenciales en URL, puertos alternativos, hosts parecidos, destinos privados, consultas ajenas a los identificadores admitidos y formatos inesperados. El host nuevo de recuperación histórica es una constante del conector; no se admite como un destino arbitrario proporcionado por el usuario.

Prueba determinista: `node --import tsx src/lib/research/sources.test.ts`. Incluye formatos XML/JSON/HTML, identidad de norma y oficio, integridad del árbol histórico, discrepancias de fecha y cierre, charsets, contenido ajeno/oculto, copia original, URLs rechazadas sin solicitudes, redirecciones, límites, interrupción y ausencia de fechas de vigencia inferidas.

### Evidencia HTTP y hashes

Las cinco extracciones siguientes pasaron con `fetchPublicLegalSource`, usando su transporte nativo, el 1 de noviembre de 2026 a las 20:28 UTC. Son documentos públicos; no se enviaron datos del estudio.

| Extracción | Bytes | Caracteres extraídos | SHA-256 del original |
| --- | ---: | ---: | --- |
| BCN 242302, versión declarada 2026-04-16, XML | 561407 | 367367 | `f49fa004962f82559a19488ebbb916f0a268b37810d3a9b74659e9adff7d07ab` |
| BCN 242302, versión histórica 2005-09-22, JSON | 624864 | 188112 | `bf8b7530fbf9a5fa4eb76d84cd07348e03f627a34c51dd3d068edd35b5fd330b` |
| SII Renta, oficio 2151/2016, HTML moderno | 9514 | 8621 | `7ed028a59c9e9cb538c40d807be7d99a277b21c87f65989c0ff4cac9fcc4b98c` |
| SII Renta, oficio 2151/2016, HTML antiguo | 10635 | 8621 | `b498dd8501f9a2e05fda1465513507aa0032fcd0e66b69737de14aa67d76341d` |
| SII IVA, oficio 2482/2016, HTML antiguo | 5421 | 3407 | `cb9cea2fc9ab2740bb9c1ef87daed93c69c0ad75e6a0bece50dfdcd8e7f9cef9` |

Hashes de texto: BCN actual `641f49a934b3d930489f34628b00ae02d3c7e137b379bf28bca33d7ee1220fda`; BCN histórico `e22bf7462177f429cc1cb441e2957d921bd349f2b8a729b3df5fc7c3d23228f6`; ambas representaciones SII 2151 `4e9deadd3e2d0362251e4a686944fd2f8bcf76dbe9d9e861c878f2269a009730`; SII 2482 `5352dcff7ac9e4ed96aed7aa00d38726837ff67c47f6c08d0451abb4aac69257`.

El [registro de las cinco extracciones](espacios-drive-fuentes-2026-11-01/logs/sources-native-live.jsonl) conserva URLs, fechas y hashes. El [ensayo HTTP de la aplicación compilada](espacios-drive-fuentes-2026-11-01/logs/production-live-official.log) prueba además la importación y recuperación del original desde LexOpen. Los bytes públicos y sondeos de desarrollo se conservaron temporalmente separados del repositorio; no forman parte del corpus del estudio ni sustituyen las versiones persistidas por cada instalación.

### Vías comprobadas que no se anuncian como conectores

- `www.leychile.cl/Consulta/obtxml` también devolvió 200 y el mismo XML, pero el producto conserva el endpoint canónico BCN.
- `servicios-leychile.bcn.cl/Navegar/get_norma_json` devolvió el mismo JSON histórico; se usa el host público que declara el cliente BCN, sin añadir mecanismos de reintento que oculten bloqueos.
- `www.bcn.cl/leychile/servicios/Navegar/get_norma_json`, `navegar/imprimir` y `servicio/7` devolvieron la carcasa HTML del cliente, no la norma; no son vías de extracción aceptadas.
- `www.bcn.cl/leychile/api/v1/servicio/7` devolvió 401; no se usa.
- `datos.bcn.cl` agotó el tiempo de conexión en la prueba; no se promete SPARQL operativo.
- Un informe BCN en `obtienearchivo.bcn.cl` y una resolución PDF SII devolvieron 200. Se pospone su importación jurídica para conservar evidencia por página de forma coherente con el lector; un informe tampoco se identifica como legislación.
- Firecrawl CLI volvió a fallar con `ENOTFOUND api.firecrawl.dev`. La investigación recurrió a fuentes primarias y HTTP directo; el producto no depende de ese servicio.

La disponibilidad de un documento individual no prueba cobertura completa del organismo ni vigencia jurídica. Las copias congeladas permiten reproducir citas de una versión; las modificaciones posteriores requieren una nueva incorporación y revisión.
