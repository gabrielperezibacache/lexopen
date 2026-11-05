# Conexiones y Secretos de ALTAZOR · 4 de noviembre de 2026

Capturas de la interfaz real de LexOpen ejecutada en una copia local aislada. Los profesionales, causas y credenciales son ficticios. La pequeña etiqueta «DATOS FICTICIOS» identifica el entorno de revisión.

Se revisaron el catálogo de 48 aplicaciones, el detalle de Slack, la lista privada de secretos, su formulario vacío, el control manual del escritorio y la preparación de un secreto. Cada estado se capturó a 1440 × 1000 y 360 × 800. Las catorce vistas respondieron HTTP 200 sin desbordamiento horizontal, campos visibles sin etiqueta ni errores de página.

El gateway de estas pruebas es simulado. La imagen que aparece dentro del escritorio también es sintética: estas capturas no acreditan un contenedor real, acceso a cuentas externas ni un ingreso OAuth. No se publica el PNG independiente del gateway, la configuración privada, sesiones ni valores secretos.

La prueba HTTP comprobó creación, consulta, sustitución, eliminación, aislamiento entre propietarios y uso de un secreto con control manual. Repetir el recibo de uso no produjo otra escritura. El origen y el campo son declarados por la persona; no se afirma verificación del DOM de la página.

La segunda pasada comprobó desde la interfaz Guardar conexión, Probar acceso, retirar una conexión y obtener el enlace oficial OAuth sin abrirlo. Los controles Vista completa, 100 % y 150 % funcionaron en ambos tamaños. Tras desplazar la imagen ampliada, el clic llegó al gateway en el píxel remoto esperado (640, 396) en escritorio y móvil.

El [manifiesto](manifest.json) registra fecha, dimensiones, tamaño y SHA-256 de cada PNG.

| Estado | Escritorio | Móvil |
| --- | --- | --- |
| Catálogo | [Captura](conexiones-desktop.png) | [Captura](conexiones-mobile.png) |
| Slack | [Captura](slack-desktop.png) | [Captura](slack-mobile.png) |
| Secretos privados | [Captura](secretos-desktop.png) | [Captura](secretos-mobile.png) |
| Nuevo secreto | [Captura](secretos-formulario-desktop.png) | [Captura](secretos-formulario-mobile.png) |
| Escritorio con control manual | [Captura](escritorio-desktop.png) | [Captura](escritorio-mobile.png) |
| Uso de secreto guardado | [Captura](escritorio-secreto-desktop.png) | [Captura](escritorio-secreto-mobile.png) |
| Escritorio al 150 % con desplazamiento | [Captura](escritorio-zoom-desktop.png) | [Captura](escritorio-zoom-mobile.png) |

## Revisión visual final

Revisión independiente general, sustituta del perfil especializado no disponible. Disposición **SHIP**.

| Hallazgo | Resultado | Evidencia |
| --- | --- | --- |
| CON-01: escritorio pequeño en móvil | Resuelto | Vista completa, 100 % y 150 %; desplazamiento y clic exacto en el mismo punto remoto en ambos tamaños. |
| CON-02: campos de Slack poco claros | Resuelto | Modalidades, etiquetas y ayuda en español antes de guardar; campos obligatorios según el servicio y controles funcionales comprobados. |

El veredicto corresponde a estas vistas y conserva los límites de evidencia descritos arriba.
