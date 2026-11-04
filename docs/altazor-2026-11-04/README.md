# ALTAZOR en LexOpen

Capturas reales de la aplicación `1.1.0-preview.3` en Chromium, tomadas el 4 de noviembre de 2026. Personas, causa, libro, recuerdos, proyecto académico y respuestas de IA son ficticios. El modelo es un servicio HTTP local de prueba; estas imágenes no acreditan razonamiento de un proveedor real.

No hay cuentas personales conectadas ni publicaciones realizadas. Conexiones muestra su catálogo y la configuración pendiente de LinkedIn. Computadora muestra el estado desactivado real de esa instalación de prueba; no es una demostración de ejecución de un escritorio.

Las imágenes son capturas sin retoques del área visible: escritorio de 1440 × 1000 y móvil de 360 × 800. Los controles y el contenido que continúan hacia abajo se consultan desplazando la página. Las huellas de las imágenes y de los archivos de interfaz construidos están en [manifest.json](manifest.json). La ilustración original y sus cuatro poses se documentan en [su registro de creación](../../public/altazor/provenance.json).

| Apartado | Escritorio | Móvil |
| --- | --- | --- |
| Conversación nueva | [Inicio nuevo](inicio-nuevo-desktop.png) | [Inicio nuevo](inicio-nuevo-mobile.png) |
| Mensaje, adjuntos y ámbito | [Inicio](inicio-desktop.png) | [Inicio](inicio-mobile.png) |
| Recuerdos y relaciones | [Memoria](memory-desktop.png) | [Memoria](memory-mobile.png) |
| Herramientas y LinkedIn | [Conexiones](connectors-desktop.png) | [Conexiones](connectors-mobile.png) |
| Computador opcional desactivado | [Computadora](computer-desktop.png) | [Computadora](computer-mobile.png) |
| Investigación y docencia | [Academia](academia-desktop.png) | [Academia](academia-mobile.png) |
| Matriz de literatura | [Matriz](matriz-desktop.png) | [Matriz](matriz-mobile.png) |
| Índices y bibliografía | [Descubrir](discovery-desktop.png) | [Descubrir](discovery-mobile.png) |

[Funcionamiento y límites de ALTAZOR](../ALTAZOR.md).

## Revisión visual final

Dictamen independiente: **SHIP**. Los seis hallazgos materiales están resueltos después de la ronda adicional solicitada por el usuario. La revisión visual no acredita cuentas reales, ejecución de una computadora ni conformidad WCAG completa.

| Hallazgo | Estado final |
| --- | --- |
| ALT-01: cinco herramientas legibles en móvil | Resuelto |
| ALT-02: editor, Adjuntar y Enviar completos al entrar en conversación nueva y recuperada, sin desbordamiento del documento | Resuelto |
| ALT-03: cuatro apartados académicos visibles | Resuelto |
| ALT-04: títulos y relaciones del grafo sin colisión | Resuelto |
| ALT-05: accesos a Codex, correo y conexiones del estudio | Resuelto |
| ALT-06: estados finales de configuración visibles | Resuelto |

Las dieciséis capturas y [su informe](capture-report.json) corresponden al mismo lote final; los dieciséis registros conservan el contenido dentro del ancho disponible. Editor y botones están completos en el primer encuadre de ambos estados de conversación a 1440 × 1000 y 360 × 800. Se corrigió el ancho del selector de archivos oculto y se eliminó la repetición del ámbito de trabajo; no se oculta el desbordamiento del documento.

La revisión se realizó mediante un agente general independiente, en sustitución del perfil especializado de diseño no disponible. Los recorridos funcionales de navegador se verifican por separado.
