# IA local para el estudio

Abre **Configuración → Conexiones e IA → IA** desde una cuenta con permisos para administrar el Host. En **IA local**, LexOpen comprueba el Ollama del equipo que aloja la aplicación. Si ese equipo todavía lo necesita, instala una versión compatible desde la página oficial y desactiva la nube en los ajustes del servicio. La integración usa las rutas disponibles en Ollama 0.40.14. [Descarga oficial](https://ollama.com/download) · [Modo local de Ollama](https://docs.ollama.com/faq#how-do-i-disable-ollamas-cloud-features)

1. Elige un modelo y pulsa **Descargar**. El botón indica su tamaño. Para Gemma, revisa y acepta sus términos.
2. Pulsa **Probar y usar en el estudio**. LexOpen prueba el modelo con texto ficticio y guarda la selección si responde.
3. **Volver a la conexión anterior** recupera el proveedor que ya usaba el estudio y sus ajustes guardados. Puedes usar **Probar el modelo** para revisar el estado del perfil local activo.

La descarga se inicia a petición de la administración. LexOpen compara el SHA-256 completo y el tamaño de la edición en el registro oficial, vigila los tamaños y huellas de los bloques que anuncia Ollama y coteja el modelo instalado antes de habilitar su uso. Puedes cancelar la solicitud y volver a comprobar el estado. Una edición instalada que difiera del catálogo queda disponible en Ollama y se señala en el panel. [API de descarga](https://docs.ollama.com/api/pull) · [Inventario de modelos](https://docs.ollama.com/api/tags)

| Perfil de texto | Descarga verificada | Trabajo sugerido |
| --- | ---: | --- |
| Qwen3 1.7B Q4_K_M | 1.359.293.444 bytes, 1,36 GB | Extraer datos explícitos y resumir un pasaje corto. [Edición oficial](https://ollama.com/library/qwen3:1.7b-q4_K_M) |
| Qwen3 0.6B Q4_K_M | 522.653.767 bytes, 523 MB | Proponer etiquetas y clasificar texto breve. [Edición oficial](https://ollama.com/library/qwen3:0.6b-q4_K_M) |
| Gemma 3 1B Q4_K_M | 806.067.407 bytes, 806 MB | Ordenar notas y reescribir texto corto. [Edición oficial](https://ollama.com/library/gemma3:1b-it-q4_K_M) · [Términos de Gemma](https://ai.google.dev/gemma/terms) |

Cada solicitud del perfil comprueba que Ollama tenga la nube desactivada y conserve la edición verificada. El texto se envía al servicio del mismo equipo. El perfil solicita 4.096 tokens de contexto, hasta 768 de salida y que se libere la memoria del modelo al terminar. Las solicitudes largas piden reducir el alcance. La elección aplica a la IA del estudio y se combina con las preferencias personales y permisos existentes. Si falla el perfil, LexOpen muestra el error para reintentar. [Opciones de conversación de Ollama](https://docs.ollama.com/api/chat) · [Contexto y memoria](https://docs.ollama.com/context-length)

## Consumo medido

Los tamaños de la tabla corresponden a archivos del modelo y se comprobaron contra los manifiestos del registro el 5 de noviembre de 2026. La memoria de trabajo depende del modelo, del contexto, del equipo y de cuántas tareas se ejecuten a la vez.

En un Apple M4 Max, `llama-cli` 10090 (`7347430f4`) ejecutó Qwen3 0.6B en CPU con dos hilos, contexto de 4.096 y un máximo de 32 tokens de salida. Recuperó correctamente una fecha en un expediente ficticio en **7,94 s**, con un pico de memoria residente de **1.346.142.208 bytes** (1,35 GB o 1,25 GiB). La medición cubre el proceso de llama.cpp en ese equipo. El Host, el escritorio y la variante de Ollama tienen consumos propios. El archivo GGUF de la prueba pesó 522.640.096 bytes y coincidió con el SHA-256 `7f4030143c1c477224c5434f8272c662a8b042079a0a584f0a27a1684fe2e1fa`. [llama.cpp](https://github.com/ggml-org/llama.cpp) · [Manifiesto de Qwen3](https://ollama.com/library/qwen3:0.6b-q4_K_M)

Antes de fijar un mínimo de memoria para cada perfil, mide en Windows x64, macOS Intel y Apple Silicon y Linux x64. Repite con un documento ficticio, el Host activo y el escritorio iniciado. Registra el pico del proceso, la memoria disponible, la latencia y una comprobación del dato extraído. Los modelos de mayor tamaño, incluidos Qwen3 4B y Gemma 4, pueden reservarse para equipos con más margen. [Comparador de ediciones de Qwen3](https://ollama.com/library/qwen3/tags) · [Comparador de ediciones de Gemma 4](https://ollama.com/library/gemma4/tags)

## Herramientas locales para cada tarea

| Tarea | Integración y preparación |
| --- | --- |
| Lectura y OCR | LexOpen conserva el original y registra las páginas extraídas. Para escaneos, Tesseract con `tessdata_fast` para español e inglés y Poppler cubre el recorrido local. El instalador debe verificar los idiomas y procesar una página escaneada de ejemplo. [Datos oficiales de Tesseract](https://tesseract-ocr.github.io/tessdoc/Data-Files.html) |
| Transcripción | El proveedor local admite una API compatible con `/v1/audio/transcriptions` y segmentos temporales. `whisper.cpp` permite configurar esa ruta, español y conversión con FFmpeg. Su modelo **base** multilingüe ocupa 142 MiB de disco y la documentación estima unos 388 MB de memoria. Prueba también **small** con grabaciones ficticias del tipo que utiliza el estudio antes de elegir un perfil de mayor precisión. [Memoria publicada por whisper.cpp](https://github.com/ggml-org/whisper.cpp#memory-usage) · [Opciones de whisper-server](https://github.com/ggml-org/whisper.cpp/tree/master/examples/server) |
| Consulta de portales | LexOpen usa Chromium y Playwright para los flujos del navegador. Reutilizar un navegador por sesión y limitar su concurrencia reduce el consumo. Para la consulta de OJV se mantiene el ingreso personal y se registran resultados parciales. [Biblioteca Playwright](https://playwright.dev/docs/library) |
| Búsqueda y fuentes | La búsqueda global usa texto de PostgreSQL. Altazor selecciona pasajes locales con permisos, verifica sus citas y remite a la fuente. Si una evaluación en español muestra mejoras, se puede añadir un índice semántico opcional con Qwen3 Embedding 0.6B (639 MB en Ollama). Conserva el filtro de permisos y la cita por pasaje en cualquiera de las dos modalidades de recuperación. [Búsqueda de texto en PostgreSQL](https://www.postgresql.org/docs/current/textsearch.html) · [Modelo de vectores](https://ollama.com/library/qwen3-embedding:0.6b) |
| Obsidian | La exportación de Markdown usa una carpeta local elegida para la bóveda. La integración puede preparar notas sin mantener otro proceso activo. El propio Obsidian puede abrir esa carpeta cuando se necesite. [Archivos locales de Obsidian](https://help.obsidian.md/Files+and+folders/How+Obsidian+stores+data) |

El primer arranque puede presentar **Documentos**, **Audios**, **IA local** y **Escritorio** como capacidades que se preparan por separado. Cada paquete debe indicar espacio y tiempo aproximados, conservar lo que ya esté instalado, verificar su procedencia y poder retomar una preparación interrumpida. El paquete del motor se contabiliza aparte de los pesos del modelo. Por ejemplo, Ollama declara al menos 4 GB de disco para sus binarios de Windows. [Requisitos de Ollama para Windows](https://docs.ollama.com/windows) · [Paquetes oficiales y huellas](https://github.com/ollama/ollama/releases/expanded_assets/v0.40.14)
