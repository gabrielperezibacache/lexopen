# Modelos de IA locales

Abre **Configuración → Conexiones e IA → IA** con permisos para administrar el Host. El apartado **Modelos de IA locales** ofrece un catálogo único ordenado por memoria, con filtros de **RAM**, **VRAM** y **memoria unificada**, sin divisiones por función. Puedes explorarlo aunque Ollama no esté abierto. Elegir una fila o cambiar los filtros no descarga modelos ni cambia la conexión activa.

## Opciones y memoria

Se comprobaron los manifiestos de estas **16 ediciones** en el registro oficial de Ollama el **7 de noviembre de 2026**: huella SHA-256 completa y suma de bytes de configuración y capas, sin descargar los pesos. Los identificadores originales de Qwen3 y Gemma 3 se conservan para mantener las conexiones existentes.

Las cifras de memoria son **estimaciones de planificación de LexOpen**, no mínimos oficiales ni resultados de pruebas en cada equipo. Se refieren a una sola solicitud de texto y **4.096 tokens de contexto**. RAM y memoria unificada contemplan margen para el sistema; VRAM se refiere a una GPU compatible y requiere además RAM del sistema. La memoria realmente disponible, el motor, los controladores y la longitud de la solicitud cambian el consumo. Los tamaños de descarga son GB decimales; la detección de memoria del Host se muestra en GiB.

| Modelo y edición oficial | Descarga verificada | RAM sin GPU | VRAM dedicada | Memoria unificada |
| --- | ---: | ---: | ---: | ---: |
| [Qwen3 0.6B](https://ollama.com/library/qwen3:0.6b-q4_K_M) · `0.6b-q4_K_M` | 523 MB | 4 GB | 2 GB | 4 GB |
| [Gemma 3 1B](https://ollama.com/library/gemma3:1b-it-q4_K_M) · `1b-it-q4_K_M` | 806 MB | 6 GB | 2 GB | 6 GB |
| [Qwen3 1.7B](https://ollama.com/library/qwen3:1.7b-q4_K_M) · `1.7b-q4_K_M` | 1,36 GB | 8 GB | 4 GB | 8 GB |
| [Qwen3.5 2B](https://ollama.com/library/qwen3.5:2b-q4_K_M) · `2b-q4_K_M` | 1,95 GB | 8 GB | 4 GB | 8 GB |
| [Phi-4 mini 3.8B](https://ollama.com/library/phi4-mini:3.8b-q4_K_M) · `3.8b-q4_K_M` | 2,49 GB | 12 GB | 6 GB | 12 GB |
| [Qwen3.5 4B](https://ollama.com/library/qwen3.5:4b-q4_K_M) · `4b-q4_K_M` | 3,32 GB | 12 GB | 6 GB | 12 GB |
| [Gemma 4 E2B](https://ollama.com/library/gemma4:e2b-it-q4_K_M) · `e2b-it-q4_K_M` | 4,59 GB | 12 GB | 8 GB | 12 GB |
| [Qwen3.5 9B](https://ollama.com/library/qwen3.5:9b-q4_K_M) · `9b-q4_K_M` | 6,55 GB | 16 GB | 10 GB | 16 GB |
| [Gemma 4 E4B](https://ollama.com/library/gemma4:e4b-it-q4_K_M) · `e4b-it-q4_K_M` | 6,58 GB | 16 GB | 10 GB | 16 GB |
| [Gemma 4 12B](https://ollama.com/library/gemma4:12b-it-q4_K_M) · `12b-it-q4_K_M` | 8,02 GB | 24 GB | 12 GB | 24 GB |
| [gpt-oss 20B](https://ollama.com/library/gpt-oss:20b) · `20b` | 13,79 GB | 24 GB | 16 GB | 24 GB |
| [Gemma 4 26B A4B](https://ollama.com/library/gemma4:26b-a4b-it-qat) · `26b-a4b-it-qat` | 15,63 GB | 32 GB | 24 GB | 32 GB |
| [Qwen3.8 27B](https://ollama.com/library/qwen3.8:27b-q4_K_M) · `27b-q4_K_M` | 17,74 GB | 32 GB | 24 GB | 32 GB |
| [Gemma 4 31B](https://ollama.com/library/gemma4:31b-it-q4_K_M) · `31b-it-q4_K_M` | 20,39 GB | 48 GB | 32 GB | 48 GB |
| [Qwen3.6 35B A3B](https://ollama.com/library/qwen3.6:35b-a3b-q4_K_M) · `35b-a3b-q4_K_M` | 23,94 GB | 48 GB | 32 GB | 48 GB |
| [gpt-oss 120B](https://ollama.com/library/gpt-oss:120b) · `120b` | 65,37 GB | 96 GB | 80 GB | 96 GB |

La ficha de cada fila enlaza a su edición y licencia. Gemma 3 conserva la aceptación explícita de sus términos antes de descargar. Que una edición exista en el registro y tenga su huella verificada no acredita su velocidad, calidad en español jurídico ni ejecución real en LexOpen.

## Elegir con menos gasto

Para documentos en cualquier equipo, empieza por el hardware disponible y compara las respuestas con material ficticio representativo: extracción fiel de fechas y nombres, resúmenes sin omisiones, citas a pasajes y calidad de las reformulaciones en español. La prioridad del catálogo es editorial y orientativa, sin una evaluación comparativa en español jurídico ni un ganador universal:

- **4–6 GB de RAM:** Qwen3 0.6B o Gemma 3 1B, con expectativas limitadas. La recomendación automática puede quedar vacía si no hay memoria libre suficiente.
- **8 GB:** Qwen3.5 2B como punto de entrada; Qwen3 1.7B permite una descarga menor.
- **12–16 GB:** Qwen3.5 4B como primera comparación económica; Phi-4 mini y Gemma 4 E2B amplían las alternativas. Qwen3.5 9B o Gemma 4 E4B requieren más memoria libre.
- **24 GB:** compara Gemma 4 12B; gpt-oss 20B es una alternativa MXFP4 si el equipo dispone del margen indicado.
- **32–64 GB:** Gemma 4 26B A4B QAT, Qwen3.8 27B, Gemma 4 31B y Qwen3.6 35B A3B permiten aprovechar equipos mayores. Una edición pequeña sigue siendo la opción de menor consumo.
- **96–128 GB:** gpt-oss 120B queda como referencia para hardware ya disponible; ampliar un equipo exclusivamente para ejecutarlo se aleja del objetivo económico.

No se cobra una tarifa por token del proveedor por ejecutar los pesos locales. Persisten electricidad, almacenamiento, hardware y condiciones de licencia. Usar CPU puede evitar comprar una GPU, a costa de velocidad. No se han comparado precios de equipos ni medido el consumo eléctrico.

La cuantización reduce el tamaño de los pesos. **E2B/E4B** son parámetros efectivos y no equivalen al tamaño total cargado. En modelos **MoE**, activar 3B o 4B parámetros por token no elimina la necesidad de cargar el conjunto de pesos. Aumentar contexto, concurrencia o entradas visuales necesita más memoria. [Memoria y arquitecturas de Gemma](https://ai.google.dev/gemma/docs/core) · [Contexto de Ollama](https://docs.ollama.com/context-length) · [Compatibilidad de hardware](https://docs.ollama.com/gpu)

RAM, VRAM y memoria unificada **no se suman** para filtrar. La descarga tampoco equivale a memoria de ejecución. La distribución entre CPU y GPU se comprueba posteriormente con `ollama ps`; el filtro no acredita que el modelo entre íntegramente en la GPU. El catálogo se utiliza con texto aunque algunas familias admitan otras entradas.

## Recomendación y activación

La detección se ejecuta automáticamente al abrir el panel y al pulsar **Detectar equipo y modelos**. Describe el equipo que aloja LexOpen y ejecuta la IA; un navegador conectado desde otro computador no expone su memoria a este servidor. Observa RAM total, memoria disponible, límites del proceso/contenedor, GPU y disco de referencia. Funciona aunque Ollama no esté instalado ni abierto.

| Sistema | Lecturas automáticas de solo consulta |
| --- | --- |
| macOS | CPU y RAM del sistema; `system_profiler -json SPDisplaysDataType` para identificar GPU y VRAM declarada; `memory_pressure -Q` para estimar memoria disponible, incluidas páginas recuperables. Apple Silicon se reconoce como memoria unificada, compartida por CPU y GPU y contabilizada una sola vez. |
| Windows | RAM del sistema; `nvidia-smi` si está disponible para VRAM total y libre; DXGI mediante PowerShell y un adaptador de interoperabilidad cargado solo en ese proceso para leer memoria de 64 bits y distinguir memoria dedicada y compartida. No crea un ejecutable ni instala un componente. Si DXGI está bloqueado, CIM conserva únicamente nombres de GPU: `AdapterRAM` es de 32 bits y no se utiliza para estimar VRAM. |
| Linux | RAM y `MemAvailable` de `/proc/meminfo`; `nvidia-smi` si está disponible; VRAM total y usada de AMD mediante `/sys/class/drm/cardN/device/mem_info_vram_*`. |

Las consultas tienen destinos y argumentos fijos, salida acotada y plazo máximo de 3,5 segundos por proceso. No aceptan comandos del navegador, no ejecutan un intérprete de shell y no instalan herramientas, controladores ni modelos. La consulta de Windows carga interoperabilidad DXGI en el proceso de PowerShell; si la política del equipo la impide, se utiliza información parcial. Solo se devuelven nombres y capacidades; no identificadores de serie, rutas ni salida completa del sistema. [Memoria unificada de Apple](https://developer.apple.com/videos/play/wwdc2020/10686/) · [Memoria DXGI](https://learn.microsoft.com/windows/win32/api/dxgi/ns-dxgi-dxgi_adapter_desc) · [Límite de AdapterRAM](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-videocontroller) · [Consulta NVIDIA](https://docs.nvidia.com/deploy/nvidia-smi/index.html) · [VRAM AMD en Linux](https://kernel.org/doc/html/latest/gpu/amdgpu/driver-misc.html)

Cuando un dato no está expuesto, queda **Sin comprobar**. La memoria gráfica compartida no se trata como VRAM dedicada ni permite asumir que toda la RAM está disponible para GPU. En otros equipos con arquitecturas unificadas no identificadas se conserva una recomendación basada en RAM. Identificar hardware no acredita compatibilidad del motor, velocidad ni calidad de inferencia; esa compatibilidad se comprueba al preparar el motor posteriormente. [Compatibilidad de Ollama](https://docs.ollama.com/gpu)

La recomendación es única y está orientada a documentos, sin dividir el catálogo por función. Evalúa RAM, memoria unificada o **cada GPU por separado**, con una prioridad editorial para revisar y resumir documentos y una preferencia moderada por aceleración. En CPU penaliza modelos de consumo superior a 12 GiB; en todas las rutas también penaliza ediciones que necesitan más de 32 GiB para conservar la orientación económica aunque el equipo tenga mucha memoria. No es un ranking medido en español jurídico. Una instalación previa solo desempata modelos de la misma prioridad; la recomendación no exige descargas, Ollama ni espacio de instalación.

Se compara la capacidad total con el margen disponible ahora. En RAM se reservan hasta 3 GiB (25 % en equipos pequeños); en memoria unificada se reservan entre 3 y 8 GiB y se limita la planificación al 75 % del total. En GPU se reserva al menos 0,5 GiB o el 5 % de la VRAM, además de exigir margen de RAM del sistema. Si la VRAM libre no se conoce, se calcula con el 80 % de la capacidad y se señala que la recomendación es condicional. Las necesidades de contexto y carga se estiman a partir del perfil; estas reservas no garantizan consumo real.

Si no queda margen, se presenta un candidato según capacidad total indicando que debe liberarse memoria antes de usarlo. Si el modelo recomendado ahora es menor que el permitido por capacidad total, se muestran ambas referencias con su condición. RAM y VRAM no se suman, varias GPU no se agregan y una GPU grande no elude los límites del proceso/contenedor. La posible falta de espacio para preparar el modelo se informa aparte y no impide consultarlo. El disco medido puede diferir del volumen de Ollama.

Los filtros comienzan en **Detección automática** y **Capacidad detectada**. Usan el tipo y la capacidad del recurso sobre el que se calculó la recomendación, sin redondear, por ejemplo, 36 GiB a 32 o 48. Se pueden cambiar para comparar otros equipos; ello no altera la recomendación ni la conexión activa. **Detectar, filtrar y recomendar solo realiza lecturas**: no descarga, instala, prueba ni activa modelos.

1. Si deseas usar un modelo, abre una versión compatible de Ollama en el Host y desactiva sus funciones de nube. [Descarga oficial](https://ollama.com/download) · [Modo local](https://docs.ollama.com/faq#how-do-i-disable-ollamas-cloud-features)
2. Selecciona una edición y pulsa **Descargar** cuando quieras prepararla. Revisa los términos si se solicitan.
3. Pulsa **Probar y usar en el estudio**. LexOpen envía texto ficticio al modelo del mismo equipo y guarda la selección solo si responde.
4. **Volver a la conexión anterior** recupera el proveedor y sus ajustes guardados.

LexOpen compara el manifiesto, los tamaños y las huellas anunciadas por Ollama, y coteja la edición instalada antes de habilitarla. Las descargas admiten hasta dos horas y cancelación de la solicitud; vuelve a comprobar su estado al cancelar. Una edición distinta no se sobrescribe automáticamente. El límite de tamaño se deriva del catálogo verificado. [API de descarga](https://docs.ollama.com/api/pull) · [Inventario](https://docs.ollama.com/api/tags)

Cada solicitud comprueba el modo local y la edición fijada. El perfil libera la memoria al terminar y solicita hasta 768 tokens de salida; gpt-oss usa razonamiento `low` y un presupuesto de 2.048 tokens que también contempla su razonamiento. No se muestran trazas internas. La solicitud se acota a 12.000 bytes y 24 mensajes; el perfil solicita reducir textos largos. Las preferencias personales y permisos existentes siguen aplicándose. [Conversación de Ollama](https://docs.ollama.com/api/chat) · [Controles de razonamiento](https://docs.ollama.com/capabilities/thinking)

## Evidencia de ejecución disponible

En una prueba anterior con Apple M4 Max, `llama-cli` 10090 (`7347430f4`) ejecutó Qwen3 0.6B en CPU con dos hilos, contexto de 4.096 y hasta 32 tokens de salida. Recuperó una fecha en un expediente ficticio en **7,94 s**, con un pico residente de **1.346.142.208 bytes** (1,35 GB o 1,25 GiB). La medición cubre ese proceso de llama.cpp; Host, escritorio y Ollama tienen consumos propios. El GGUF de la prueba pesó 522.640.096 bytes, SHA-256 `7f4030143c1c477224c5434f8272c662a8b042079a0a584f0a27a1684fe2e1fa`. [llama.cpp](https://github.com/ggml-org/llama.cpp)

La detección automática se comprobó de forma nativa en macOS con Apple M4 Max y 36 GiB de memoria unificada. Windows, Linux y los restantes casos de GPU se comprueban mediante respuestas simuladas de sus fuentes; no se ha ejecutado esta detección en hardware real de esos sistemas. La ampliación del catálogo no instala ni ejecuta esos 16 modelos. Antes de fijar requisitos definitivos, mide en Windows x64, macOS Intel, Apple Silicon y Linux x64 con Host y escritorio abiertos: pico de memoria, margen restante, tiempo de respuesta y precisión sobre material ficticio. Los controles automatizados verifican lógica y transportes simulados, sin demostrar rendimiento de inferencia.

## Preparación del resto del entorno local

OCR, transcripción, búsqueda, navegador y Obsidian conservan su preparación independiente del catálogo. Tesseract/Poppler, whisper.cpp/FFmpeg, PostgreSQL, Chromium/Playwright y la bóveda local no se instalan al elegir un modelo. [Tesseract](https://tesseract-ocr.github.io/tessdoc/Data-Files.html) · [whisper.cpp](https://github.com/ggml-org/whisper.cpp#memory-usage) · [Playwright](https://playwright.dev/docs/library) · [Obsidian](https://help.obsidian.md/Files+and+folders/How+Obsidian+stores+data)

El espacio del motor se contabiliza aparte de los pesos. El instalador de cada herramienta debe conservar lo ya preparado, verificar procedencia y permitir retomar la preparación. [Ollama para Windows](https://docs.ollama.com/windows)
