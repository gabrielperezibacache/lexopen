# MIDNIGHT, ALTAZOR y trabajo conectado

Capturas del 5 de noviembre de 2026, tomadas de una instalación temporal de LexOpen. Son imágenes de la interfaz real; no son composiciones ni pantallas dibujadas.

## Procedencia

- Aplicación Next.js, APIs, PostgreSQL y almacenamiento propios de la prueba. No se usó la base ni la carpeta de documentos del estudio.
- Usuario, causas, libros, proyectos, texto y borrador enteramente ficticios. El material de lectura se identifica como demostración.
- La identidad de aplicación Google se preparó con valores ficticios únicamente para mostrar el consentimiento. No se pulsó el inicio oficial ni se conectó una cuenta. Marcar la casilla en esa captura no acredita una autorización OAuth.
- El ingreso judicial de esta demo web figura pendiente de preparación; no se abrió ClaveÚnica ni una sesión real de OJV para estas capturas.
- Las capturas de Inicio y del acompañante no acreditan una ejecución de modelo o de computadora. La continuidad del borrador se comprobó navegando entre Inicio y Biblioteca.

## Galería

| Archivo | Vista |
| --- | --- |
| [Inicio escritorio](inicio-escritorio.png) | 1440 × 1000; mensaje, adjuntos y fuentes |
| [Inicio móvil](inicio-movil.png) | 360 × 800; Adjuntar y Enviar completos |
| [Acompañante en Biblioteca](acompanante-biblioteca.png) | 1440 × 1000; el mismo borrador en un panel de 800 px |
| [Acompañante tablet](acompanante-tablet.png) | 800 × 1024; superficie opaca y control de cierre |
| [Académico escritorio](academico-escritorio.png) | 1440 × 1000; Investigar, Escribir y Enseñar |
| [Académico móvil](academico-movil.png) | 360 × 800; recorrido vertical y acceso propio |
| [Sincronización escritorio](sincronizacion-escritorio.png) | Cuenta personal, ingreso judicial y documentos |
| [Sincronización móvil](sincronizacion-movil.png) | El mismo recorrido a 360 px |
| [Cuentas de Drive](sincronizacion-cuentas.png) | Distinción entre cuenta personal y cuenta del estudio |
| [Consentimiento Google escritorio](google-consentimiento-escritorio.png) | Formulario real con preparación ficticia; sin iniciar autorización |
| [Consentimiento Google móvil](google-consentimiento-movil.png) | El mismo consentimiento a 360 × 800 |

Las dimensiones y huellas de los archivos están en [manifest.json](manifest.json).

## Revisión visual

Se realizó una revisión independiente con un revisor general fresco siguiendo el protocolo alternativo de Finish Reviewer. Se corrigieron y volvieron a comprobar sus tres observaciones:

| Corrección | Dictamen |
| --- | --- |
| Sheet opaco durante la entrada, sin transparentar la página inferior | resolved |
| Área activable mínima de 44 px en las casillas de conversación | resolved |
| Destino del Drive personal expresado con claridad en Sincronización | resolved |

**Disposition: ship. Remaining: clear.** El dictamen se refiere a las capturas y al alcance revisado; no equivale a una certificación de accesibilidad completa ni de servicios externos. El sistema construido está documentado en [DESIGN.md](../../DESIGN.md).

## Comprobaciones funcionales

Las pruebas de esta revisión separan:

- Persistencia, permisos, fuentes, concurrencia y migraciones con PostgreSQL desechable.
- Proveedores, OAuth y transportes ficticios para no utilizar cuentas o cookies reales.
- Navegación y formularios en un navegador de pruebas aislado.
- Compilación de producción desde una copia pública sin configuración ni documentos del Host.
- Paquetes nativos y publicación, cuyo resultado corresponde a las comprobaciones y artefactos de GitHub de cada revisión.

Los escenarios incluyen conversación y borrador entre páginas, consultas con un ámbito distinto, memoria y grafo, Académico con versiones, Word con notas nativas, plantillas de minutas normales, Drive con subcarpetas, versiones y pausas, renovación y desconexión, y colas judiciales con autorización por profesional y lectura acotada.

La auditoría de interfaz inventarió 64 rutas y 132 componentes vinculados. Su [matriz](../AUDITORIA-INTERFAZ-2026-11-05.md) distingue revisión estática, visual y recorridos que no se ejecutaron con servicios reales.
