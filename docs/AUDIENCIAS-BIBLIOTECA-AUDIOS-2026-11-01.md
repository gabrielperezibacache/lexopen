# Sentencias, mesa de audiencia y audios de causas

Esta entrega continúa la biblioteca personal de LexOpen. Permite incorporar sentencias y resoluciones con ficha propia, organizar una mesa privada para cada audiencia y gestionar grabaciones y transcripciones en la carpeta de su causa. No utiliza TRIFOLIA.

## Uso

En **Biblioteca → Sentencias y resoluciones**, incorporar un archivo y elegir su tipo. Cada resolución tiene tribunal, rol y fecha obligatorios; sala, carátula, materia, RIT/RUC y enlace de procedencia son opcionales. Se conserva la elección entre original y TXT preparado con OCR cuando corresponde. La ficha puede editarse sin alterar la identidad del pasaje. El enlace declarado no se descarga ni autentica automáticamente la resolución.

En una causa, **Abrir acompañante de audiencias** lleva a una mesa con dossier de lectura, lector, notas, agenda y conversación. Cada profesional crea sus propias mesas dentro de causas autorizadas. Puede reunir documentos del expediente, archivos de espacios vinculados, libros propios o compartidos y versiones de fuentes jurídicas. Una colección compartida conserva sus permisos independientes de la causa.

El lector permite recorrer pasajes, elegir versiones, abrir páginas físicas de PDF y guardar el punto de lectura y el estado de revisión. Los documentos sin evidencia preparada ofrecen una acción explícita para prepararla. EPUB, TXT y originales descartados no reciben páginas de PDF ficticias. Las notas pueden ser personales o vincularse a un pasaje cotejado.

La conversación ofrece **Pasajes**, sin modelo, e **IA**, con el proveedor y la política del estudio. La IA recibe únicamente los pasajes y notas seleccionados como material no confiable. Cada párrafo debe señalar referencias conocidas; se rechazan citas textuales ajenas a los pasajes. Copiar y exportar comprueban nuevamente los permisos, los bytes y la identidad de las fuentes correspondientes. El cotejo literal no certifica la interpretación ni la vigencia jurídica.

En **Grabaciones y transcripciones**, añadir un audio crea un documento en `Audiencias/Grabaciones`. El gestor tiene reproductor autenticado, descarga, tiempos cuando existen, transcripción de trabajo, importación manual TXT, revisión humana e historial. **Guardar copia en la carpeta** crea un documento nuevo en `Audiencias/Transcripciones`, con revisión, procedencia y advertencia de fidelidad. Una nueva copia no sobrescribe las anteriores ni sus ediciones.

## Transcripción configurable

La administración configura un transcriptor en **Configuración → Transcripción de audios**. Está desactivado inicialmente. Admite un servidor local compatible con `/audio/transcriptions` u OpenAI, con dirección, modelo y formato JSON explícitos. La clave se cifra y nunca se devuelve al navegador. No se asume que el proveedor de conversación pueda transcribir audio.

El envío ocurre sólo al pulsar transcribir y respeta la política de IA local del estudio. La configuración remota se bloquea antes de enviar bytes cuando esa política exige ejecución local. Sin proveedor activo se permite escribir o importar un TXT manual; no se genera una transcripción automática ficticia. La integración se contrastó con la [documentación primaria de transcripción](https://developers.openai.com/api/docs/guides/speech-to-text).

Los resultados automáticos empiezan sin revisión humana. Los tiempos sólo se muestran si fueron proporcionados y cumplen orden, límites y correspondencia con el texto. Modificar el texto sin nuevos tiempos elimina la alineación anterior. Marcar revisado registra una declaración del profesional de haberlo escuchado; LexOpen no certifica por ello la fidelidad del reconocimiento.

## Permisos y conservación

Las mesas son privadas incluso ante otro administrador con acceso a la causa. Escrituras requieren permiso actual sobre la causa; lectores no modifican fuentes, notas o conversación. Los controles se repiten antes y después de consultas prolongadas. La revocación oculta títulos y texto derivados, dejando únicamente un aviso opaco de indisponibilidad.

Cada publicación de una transcripción mantiene un vínculo con su audio. El filtro común de documentos, descargas, evidencia e investigación aplica también los permisos actuales de la grabación. Las revisiones publicadas mantienen su estado de revisión histórico; revisar hoy el audio no convierte una copia antigua en revisada. Las citas de esas copias indican que el cotejo es del TXT y que no se verificaron voz ni tiempos.

Las migraciones **39 y 40** son aditivas. Añaden fichas judiciales, mesas, fuentes, notas, conversaciones, grabaciones, revisiones y vínculos de publicación. Las restricciones de base mantienen identidad y causa del audio; una transcripción publicada permanece en la causa de origen. La causa se archiva, en lugar de eliminarse, si conserva estos registros. No se cambian migraciones anteriores.

## Alcance y límites

- Audios de hasta **25 MiB**, en WAV, MP3, M4A/MP4, OGG, WebM o FLAC identificados por su contenedor. El proveedor configurado debe admitir el formato elegido. Esta entrega no graba el micrófono ni divide automáticamente archivos grandes.
- Hasta 100 mesas por profesional y causa; 200 fuentes, 100 notas y 400 consultas por mesa. La lectura de historial muestra las 40 consultas más recientes y advierte el límite.
- La investigación jurídica, el lector PDF/OCR y el RAG de biblioteca reutilizan la infraestructura propia de LexOpen. La calidad de reconocimiento, de interpretación jurídica y del modelo elegido requiere evaluación con material autorizado.
- Las pruebas usan exclusivamente bases y archivos ficticios, audio sintético y proveedores locales de prueba. No acreditan precisión de reconocimiento de voz real ni disponibilidad de un proveedor comercial.
- No se migró el Host del estudio ni se desplegó esta versión en producción. La propuesta se apila sobre el PR #211 y requiere integrar previamente la cadena #207–#211.

La evidencia reproducible está en [VALIDACION.md](audiencias-biblioteca-audios-2026-11-01/VALIDACION.md).
