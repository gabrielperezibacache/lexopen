# Revisión general y presentación pública de LexOpen

Fecha: 2 de noviembre de 2026. Base revisada: `eb5ba04e65e812c153d58244352e47dc5f42cc14`.

La revisión contrastó el README con rutas, servicios, scripts de operación y documentación vigente. Se recorrió una instancia real con datos demostrativos para obtener las imágenes de la presentación pública. No se consultaron datos del estudio ni se autenticaron proveedores externos.

## Hallazgos y correcciones

| Hallazgo | Corrección |
| --- | --- |
| El README anterior no mostraba biblioteca personal, fuentes, conocimiento de causa, escritos ni el panel de audiencias actual. | Nuevo recorrido visual centrado en esos apartados, con nueve capturas reales. |
| La actualización manual descargaba código y reiniciaba, pero podía reutilizar un servidor standalone ya compilado. | Se añadió detener y recompilar con `desktop:build` antes del arranque; se conservaron enlaces al flujo de actualización integrado. Se ajustaron README, Desktop y guía de actualización. |
| La instrucción de acceso LAN podía interpretarse como suficiente con agregar orígenes permitidos. | El README explica que también hay que configurar dirección pública o enlace de red y remite a la guía del Host. |
| Los requisitos de OCR no distinguían la renderización de páginas físicas del reconocimiento de texto. | La guía identifica Poppler para páginas y Tesseract para OCR, con instrucciones de instalación. |
| La presentación pública necesitaba distinguir búsqueda, exportación y transcripción disponibles de capacidades todavía no implementadas o verificadas. | Se describe BM25 léxico, exportación Markdown/TXT, voz por tramos y límites de corpus/cotejo, sin prometer búsqueda semántica, DOCX ni fidelidad automática al audio. |
| El README concentraba demasiadas instrucciones operativas y enlaces históricos. | Instalación y desarrollo separados, guía de desinstalación propia, enlaces de compatibilidad conservados y documentación de planificación con nombres centrados en LexOpen. |

## Evidencia visual

Las imágenes de `docs/assets/screenshots/` muestran preparación de causa, biblioteca, editor, lector PDF, audiencia, cronología, panel operativo, móvil y modo oscuro. Se capturaron directamente desde Chromium; no son maquetas.

Los contenidos son demostrativos: un usuario temporal, seis volúmenes editoriales, documentos de ejemplo, hechos propuestos y un borrador con referencia. El PDF fue creado para este recorrido. El manifiesto conserva revisión de aplicación, rutas, dimensiones y huellas de las nueve imágenes. El script retira sus datos y archivos temporales al finalizar.

## Comprobaciones

- Ejecución del recorrido y generación de las nueve capturas: aprobada.
- Inspección conjunta de las nueve imágenes: realizada; los estados y contenidos visibles corresponden a la interfaz real.
- Integridad SHA-256 de las nueve imágenes: verificada.
- Prueba conjunta de sentencia, audio, transcripción, audiencia y retirada de acceso: aprobada. El control de conexiones del navegador exige el mismo origen del Host.
- Lint de la prueba y del script de capturas, y comprobación de tipos focalizada del script: aprobados.
- Limpieza de usuarios y materiales creados para las capturas: confirmada en la base desechable.

Los enlaces locales, imágenes y anclajes de compatibilidad se comprueban antes de integrar la entrega. Los registros históricos de pruebas y sus huellas se conservan intactos.

## Alcance

Es una revisión de coherencia del producto y de su presentación, con navegación y una prueba funcional conjunta. No equivale a una auditoría completa de seguridad, a un ensayo de recuperación de una instalación real ni a una certificación de precisión jurídica o de voz. La instalación y las cuentas del estudio no se modificaron.
