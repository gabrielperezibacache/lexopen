# Capturas de continuidad

Pantallas reales de Chromium con información ficticia. Corresponden a esta entrega sobre la base indicada en [manifest.json](manifest.json), con cambios del árbol de trabajo y huellas de los componentes capturados. No son maquetas ni se han compuesto imágenes.

| Apartado | Escritorio | Móvil |
| --- | --- | --- |
| Causa y recorrido común | [Ver](cause-desktop.png) | [Ver](cause-mobile.png) |
| Biblioteca personal | [Ver](library-desktop.png) | [Ver](library-mobile.png) |
| Escrito con pasaje elegido | [Ver](writing-desktop.png) | [Ver](writing-mobile.png) |
| Protección de nota pendiente | [Ver](hearing-desktop.png) | [Ver](hearing-mobile.png) |

Los recorridos se reproducen con [case-workflow.spec.ts](../../e2e/case-workflow.spec.ts) y [hearing-workspace.spec.ts](../../e2e/hearing-workspace.spec.ts), siguiendo la configuración de una base local desechable del repositorio. Las pruebas usan sus propios datos y los retiran al finalizar; no deben ejecutarse sobre información del estudio.

La captura de biblioteca espera el pintado del compositor después de cambiar de tamaño y conserva las transiciones nativas. Forzar su terminación desde la herramienta de captura podía omitir un plano 3D. La comprobación dirigida y la confirmación final mostraron el libro completo sin cambiar su geometría CSS.
