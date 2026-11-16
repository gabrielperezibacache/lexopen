# Evaluación reproducible de búsqueda e IA local

Los evaluadores son herramientas de desarrollo. No cambian conexiones, permisos, modelos activos, causas ni el motor de plazos. No descargan modelos, consultan expedientes ni llaman a proveedores de IA remotos. Sus resultados no acreditan la corrección jurídica de la aplicación.

## Recuperación jurídica chilena

```bash
npm run benchmark:legal -- --json /tmp/lexopen-legal.json --markdown /tmp/lexopen-legal.md
npm run test:evaluation
```

Se ejecuta sin red ni base de datos. `fixtures/evaluation/legal-chile.v1.json` conserva tres extractos públicos y ocho consultas, con jurisdicción, organismo, publicación, URL, localizador y fecha de captura. El informe registra SHA-256 del corpus y de cada extracto, versión del evaluador, revisión y límite `--top-k` (3 por defecto). La orden usa `rankResearchText` y `verifyEvidenceQuote` de producción; no replica el algoritmo ni mide las consultas remotas de OJV o del Buscador Unificado.

El corpus inicial es **provisional**, con revisión profesional pendiente. Las fuentes se cotejaron en BCN el 16 de noviembre de 2026:

- [Código Civil, artículo 1545](https://www.bcn.cl/leychile/navegar?idNorma=172986), DFL 1 publicado el 30 de mayo de 2000.
- [Código de Procedimiento Civil, artículo 38](https://www.bcn.cl/leychile/navegar?idNorma=22740), Ley 1552 publicada el 30 de agosto de 1902.
- [Ley 19.880, artículo 25](https://www.bcn.cl/leychile/navegar?idNorma=210676&idVersion=2025-09-29), publicada el 29 de mayo de 2003; se conserva expresamente la versión histórica del 29 de septiembre de 2025.

Las fechas de publicación no son fechas de última modificación. Un URL sin versión puede mostrar cambios futuros; los bytes conservados, su huella y la captura identifican este ensayo. Los extractos no contienen todas las excepciones ni determinan vigencia o aplicabilidad. No se incorporan al cómputo de plazos, al conocimiento del usuario ni a sus bibliotecas.

El informe separa recuperación `recallAtK`, rango recíproco medio, referencia exacta (URL y artículo), cita literal, cobertura de respuestas positivas, abstención negativa y respuestas sin respaldo en los ejemplos. La recuperación excluye del denominador los negativos; las respuestas sin respaldo se calculan sobre respuestas emitidas, no sobre omisiones. Sin muestra se registra `null`, nunca un cero favorable.

Por defecto se evalúa una **base extractiva** que cita el primer resultado léxico. El negativo con solapamiento evidencia su límite: recuperar la palabra «plazo» no permite contestar una pregunta ajena al corpus. No se interpreta esa base como respuesta real de Altazor ni como calidad de un modelo. Una cita literal pertinente tampoco acredita que una respuesta la interprete correctamente; cada respuesta emitida queda marcada para revisión semántica.

Para comparar respuestas conservadas de otro recorrido local, use `--predictions archivo.json`. No se invoca ningún modelo. Formato: un array con una entrada por consulta; cada entrada contiene `queryId`, `text` (texto o `null`) y `citations` (array de `sourceId`, `quote`, `locator`, `url`). Los identificadores salen del fixture. Una abstención usa `text: null, citations: []`. Los duplicados e identificadores desconocidos se rechazan. Un informe parcial registra las omisiones y sale con código 2; conserva las respuestas y su huella para revisión. Use sólo fuentes públicas o material ficticio, nunca expedientes privados.

## Modelos locales instalados

Con Ollama iniciado en su propio equipo y su nube desactivada, indique los nombres **exactos** de los modelos que ya tenga instalados:

```bash
npm run benchmark:local-models -- --models qwen3:0.6b-q4_K_M --json /tmp/lexopen-modelos.json --markdown /tmp/lexopen-modelos.md
npm run benchmark:local-models -- --models modelo:edicion,otro:edicion --tasks extract,citation,unsupported --json /tmp/lexopen-subconjunto.json
```

Los nombres son ejemplos, no órdenes de descarga. El evaluador admite hasta 16 modelos seleccionados y sólo orígenes literales de loopback, por defecto `http://127.0.0.1:11434`; para otro puerto use `--base-url`. Rechaza orígenes remotos, credenciales, rutas y redirecciones. Comprueba `/api/status` antes de consultar modelos y de cada generación: exige que Ollama confirme `cloud.disabled: true`, como el modo local de LexOpen. Si su versión no permite comprobarlo, no genera. Rechaza alias instalados con destino remoto. Sólo utiliza `/api/status`, `/api/tags`, `/api/chat` y `/api/ps`. No usa `/api/pull`, herramientas, configuración de LexOpen ni su sesión de IA.

Las cinco tareas de `fixtures/evaluation/local-models.v1.json` comprueban nombres y fechas, resumen, cita, reformulación y abstención sin respaldo. Las referencias se fijaron por cotejo literal con el material ficticio; no son respuestas a problemas jurídicos reales. JSON válido no garantiza una respuesta correcta. Resumen y reformulación usan cobertura literal y fechas, con revisión humana indicada; no califican íntegramente contradicciones, estilo, omisiones o semántica.

El JSON registra edición, digest y cuantización reportados por Ollama; CPU, arquitectura, sistema, memoria del equipo y memoria libre antes/después; latencia observada, tiempo de carga y tokens/s cuando el motor aporta sus contadores. Se conservan las respuestas, parámetros (`temperature: 0`, semilla 42, contexto 2048, máximo 512 tokens), huella del fixture y tiempos de ejecución. Es una pasada, sin precalentamiento: incluye la carga del modelo y no mide variabilidad estadística.

La muestra de `/api/ps` identifica bytes residentes y de VRAM **reportados por Ollama** después de cada tarea. No mide el pico de RAM del proceso ni el consumo eléctrico; la memoria libre del sistema puede cambiar por otras aplicaciones. Las mediciones ausentes quedan en `null`, `available: false` y `measurementStatus: partial`. No se sustituyen por las estimaciones del catálogo. Un modelo ausente se marca `not-installed` sin intentar generarlo; un motor inaccesible se marca `unavailable`; las generaciones parciales o detenidas por el límite de tokens no reciben puntuación exitosa, aunque el motor indique `done: true`. `status: completed` sólo indica ejecución terminada, no aprobación jurídica ni puntuación perfecta.

La salida 2 identifica ejecuciones incompletas o motor indisponible. JSON y Markdown necesitan destinos distintos; los archivos de salida indicados se reemplazan. Compare corpus/huella, parámetros, edición, cuantización, hardware y tareas iguales. El informe no ordena modelos ni declara un ganador universal. Todavía falta medir modelos reales en los equipos del estudio y revisar profesionalmente los resultados.

## Añadir y revisar ejemplos

1. Parta sólo de una fuente oficial pública o un relato enteramente ficticio. No use cuentas, datos personales reales, ClaveÚnica, credenciales ni expedientes reservados.
2. Conserve un extracto breve y literal, URL, localizador, organismo, jurisdicción, publicación, versión si está disponible y fecha de captura. Distinga captura, publicación y vigencia; no reconstruya el texto a partir de memoria.
3. Un profesional debe cotejar la fuente completa, excepciones y temporalidad, y etiquetar qué pasajes responden a cada consulta y cuándo abstenerse. Otro revisor debe comprobar los negativos y las referencias; registre sus observaciones en la revisión del cambio.
4. Cambie la versión del corpus al modificar ejemplos o etiquetas. Una nueva incorporación vuelve la revisión global a `provisional`; sólo marque `reviewed` con revisor y fecha después de revisar todos los ejemplos. No invente una firma de revisión.
5. Ejecute las pruebas y ambos informes comparables. Revise las respuestas conservadas, además de las métricas. No modifique las etiquetas sólo para mejorar una puntuación. Añada jurisprudencia pública revisada y más materias antes de generalizar resultados.

Los resultados de pruebas con un servidor ficticio acreditan el evaluador, no el rendimiento de un modelo real. Este banco tampoco aprueba un perfil procesal civil: ese desarrollo conserva su requisito propio de fuentes y revisión profesional.
