# Descubrimiento académico y bibliografía

En **Inicio → ALTAZOR → Academia → Descubrir**, escribe un tema o referencia,
elige Crossref y/o OpenAlex y autoriza el envío de esos términos. La aplicación
consulta la primera ventana de hasta diez obras por fuente y conserva su
procedencia y fecha. No incorpora datos de causas, conversaciones o archivos
a la consulta. Estos servicios proporcionan metadatos, que requieren revisión
antes de fundamentar una afirmación o atribuir lectura de una obra.

Puedes conservar referencias, consultar un DOI en Crossref, tomar los metadatos
de un libro propio o importar RIS, BibTeX y JSON de metadatos LexOpen. La
bibliografía usa plantillas deterministas en texto plano APA, IEEE, Vancouver,
Chicago y MLA, además de exportar BibTeX y RIS. Los campos ausentes y nombres
sin separación entre apellidos e iniciales se identifican para revisión. Los
capítulos, editores y estructuras especiales necesitan comprobación del estilo
exigido por la institución. Una importación manual no reemplaza datos de un
registro externo ya conservado ni adquiere corroboración por el hecho de guardarse.

La red de citas consulta una obra OpenAlex y hasta ocho referencias, ocho obras
que la citan y ocho relacionadas. Muestra las direcciones recibidas del índice;
una relación bibliográfica no demuestra acuerdo con la obra citada.

Las búsquedas temáticas quedan privadas por profesional. Sus alertas comparan
las ventanas recibidas al pulsar **Actualizar** con la selección ya revisada.
El RSS exige sesión y lee el último resultado guardado. No hay sondeo automático
ni envío de correos. Un fallo conserva el resultado anterior y su fecha, con el
estado del último intento; una consulta válida sin resultados permanece vacía.

ORCID permite consultar un identificador con dígito de control y su nombre
público. Esa lectura no autentica al titular ni certifica títulos, afiliaciones
o experiencia. La cuenta social se gestiona por separado mediante LinkedIn.

## Fuentes y límites de la integración

Las solicitudes usan HTTPS, los hosts fijos `api.crossref.org`,
`api.openalex.org` y `pub.orcid.org`, no siguen redirecciones ni envían cookies.
Cada respuesta tiene un máximo de 2 MiB, tiempo acotado y una única consulta
simultánea por host en cada proceso. Las búsquedas, DOI, red y ORCID requieren
autorización explícita. Los objetos privados se vuelven a comprobar al leer,
actualizar y exportar; los metadatos de un libro propio retirado se excluyen.

Las consultas básicas anónimas y el acceso con clave tienen límites distintos;
no se implementa paginación por cursor. Véanse la [autenticación de OpenAlex](https://help.openalex.org/api/authentication/)
y el [acceso a Crossref](https://www.crossref.org/documentation/retrieve-metadata/rest-api/access-and-authentication/).
La construcción de la red sigue las [recetas oficiales de OpenAlex](https://help.openalex.org/how-to/api-recipes/).
La consulta ORCID es una lectura pública, conforme a su [documentación de integración](https://info.orcid.org/documentation/integration-and-api-faq/).

## Comprobación pública del 4 de noviembre de 2026

Se ejecutaron lecturas reales, sin credenciales, de registros públicos constantes.
No se utilizaron cuentas personales, archivos ni términos provenientes del estudio.

| Comprobación | Resultado observado |
| --- | --- |
| Crossref: DOI `10.1038/nphys1170` | HTTP 200; el adaptador conservó identificador, título, un autor y año 2009. |
| OpenAlex: obra `W2741809807` | HTTP 200; normalización de DOI `10.7717/peerj.4375`, nueve autores y año 2018. El registro expone arrays de referencias y obras relacionadas. |
| ORCID: ejemplo público `0000-0002-1825-0097` | HTTP 200; nombre público recuperado, con aviso expreso de que la lectura no autentica ni certifica credenciales. |
| Consulta fija `legal education` en Crossref | Diez registros normalizados válidos en la primera ventana. |
| Consulta fija `legal education` en OpenAlex, sin clave | Diez registros normalizados válidos en la primera ventana. |

Los resultados públicos y límites pueden cambiar. Este registro corresponde
a esas solicitudes concretas y no acredita disponibilidad futura ni cobertura total.

Las pruebas de transporte ficticio verifican consentimiento, hosts, límites,
redirecciones, checksum ORCID, direcciones del grafo, resultados vacíos y
formatos bibliográficos. La integración en PostgreSQL desechable comprueba
propietario, revisiones, novedades, RSS sin tráfico externo, deduplicación,
importación, exportación y pérdida de acceso. Estas pruebas usan únicamente
filas y materiales ficticios y no sustituyen la comprobación pública anterior.
