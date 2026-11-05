# Puesto de trabajo de Altazor

El recorrido empieza en Inicio: conversa con Altazor y observa el escritorio debajo del mensaje cuando esté activo. En **Mis Causas**, abre el expediente, ordena sus documentos y elige cuál consultar. La preparación del equipo principal se hace una vez; el trabajo diario mantiene esas decisiones fuera del chat.

| Paso | Resultado | Comprobación necesaria |
| --- | --- | --- |
| 1. Ver el escritorio | Estado real y captura del escritorio de la conversación. El control manual pausa la captura automática. | Comprobar alcance personal y por causa, reanudación, vencimiento, revocación de acceso y móvil. |
| 2. Preparar herramientas | Perfil jurídico y académico con LibreOffice, PDF, OCR, EPUB, bibliografía, audio y búsqueda de archivos. | Ejecutar conversión, OCR y lectura en el contenedor real, como su usuario sin privilegios. [Guía del escritorio](ESCRITORIO-ALTAZOR.md). |
| 3. Elegir IA local | Descargar o detectar un perfil ligero; comprobar su procedencia, probarlo con texto ficticio y activarlo. | Medir RAM, tiempo y calidad con el mismo contexto en equipos representativos. El tamaño de los pesos no mide el consumo de memoria. |
| 4. Preparar el equipo principal | Instalar LexOpen, comprobar los componentes disponibles y ofrecer la preparación pendiente desde el instalador. | Publicar paquetes del perfil con procedencia e integridad verificables. Probar arranque y actualización de cada plataforma, incluidos equipos donde el motor esté ausente. |
| 5. Integrar cada tarea | Convertir, extraer, buscar y organizar de forma local siempre que sea posible. Los pasajes comprobados alimentan los escritos y proyectos académicos. | Verificar herramientas con casos ficticios y presupuestos acotados de CPU, RAM, almacenamiento y tiempo. |
| 6. Organizar expedientes | Un mismo expediente para carga manual, OJV y documentos que proceden de Drive. Las carpetas de trabajo no alteran el original, los recibos ni la cita existente. | Comprobar permisos por causa, reorganización, sincronización, revisiones y recuperación de archivos. |

## Qué conviene añadir primero

- **Documentos y OCR.** Usar extracción de texto antes de OCR. Aplicar Tesseract en español e inglés sólo a páginas que lo necesiten; registrar página, original y calidad. La instalación del perfil de escritorio y la disponibilidad del OCR del equipo principal se comprueban por separado.
- **Audio.** Preparar el archivo con FFmpeg y probar un motor local compatible con la transcripción de LexOpen, por ejemplo Whisper en un perfil pequeño. Medir precisión en español con voces superpuestas y conservar audio, tiempos y revisión humana. El perfil de escritorio prepara el audio; la transcripción sigue necesitando su motor.
- **Búsqueda y recuperación.** Empezar por la búsqueda local de PostgreSQL y los pasajes verificados de cada causa. Evaluar un índice semántico local sólo si aporta resultados pertinentes adicionales en español; ambos índices deben excluir fuentes retiradas o sin acceso. La respuesta debe enlazar la versión y el pasaje, con independencia del modelo usado.
- **Consulta web.** Aprovechar Chromium para las páginas que lo requieren y los conectores oficiales cuando existan. En OJV, conservar la intervención manual en ClaveÚnica, los estados parciales y la separación de los trabajos por causa.
- **Obsidian.** Usar primero las exportaciones Markdown a una bóveda elegida, con enlaces de regreso a LexOpen. Evitar que una exportación pueda introducir cambios automáticos en permisos, documentos o notas del expediente.

## Archivos locales y Drive

Las copias de trabajo y la evidencia se conservan en LexOpen. Una carpeta vinculada de Drive permite seleccionar o sincronizar sus archivos según la autorización vigente. Con la cuenta del estudio y una carpeta válida se puede guardar también una copia del original en Drive. La cuenta personal que sólo concedió lectura conserva ese alcance.

Para ofrecer originales **sólo en Drive**, la siguiente etapa debe guardar el identificador y la revisión exacta, comprobar la descarga y su huella antes de cerrar la operación, conservar localmente los pasajes y sus recibos, y resolver la recuperación si vence la autorización o se retira el archivo. Probarlo con archivos grandes, varias versiones y revocación antes de ofrecer una migración de originales. Una copia en Drive no elimina el original local.
