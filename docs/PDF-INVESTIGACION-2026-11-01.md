# Páginas PDF e investigación jurídica propia

Fecha: 1 de noviembre de 2026. Rama: `codex/pdf-legal-research`, sobre `codex/lexopen-own-core` a72100f261123dbe527d381f73e5d6cc689ec305 ([PR 207](https://github.com/gabrielperezibacache/lexopen/pull/207)). Este incremento continúa el [plan de desarrollo](PLAN-DESARROLLO-LEXOPEN.md) y requiere las correcciones del núcleo del PR 207. La investigación trabaja sobre las fuentes incorporadas en el Host.

## Flujos disponibles

**Documentos → Ver fuentes.** Preparar una nueva versión de un PDF registra su número real de páginas y el texto de cada página física. El lector permite elegir página, ver la imagen obtenida del original conservado, leer sus fragmentos y verificar una cita literal antes de copiarla. Los enlaces incluyen versión, fragmento y página. Una nueva extracción o sustitución del documento no reemplaza las fuentes anteriores.

El texto puede provenir del PDF o de OCR local. Una página vacía, pendiente, fallida o excluida por límites conserva ese estado explícito. La cita OCR verifica el texto registrado y su vínculo con la página; su exactitud debe contrastarse visualmente con la imagen. Las versiones antiguas con posiciones de texto siguen funcionando: no reciben números de página inventados.

**Jurisprudencia → investigación.** Las vistas Consultar, Fuentes e Historial permiten incorporar una fuente oficial por URL individual, aportar una copia pública identificada y consultar el corpus local junto con los documentos autorizados de una causa. La consulta recupera extractos literales; muestra cobertura, límites y fuentes faltantes, y se abstiene si no encuentra respaldo. No genera una conclusión jurídica ni usa un modelo de IA o una búsqueda externa durante la consulta.

Cada resultado abre su versión y fragmento. Copiar una cita vuelve a comprobar el permiso actual, la literalidad y los hashes. El historial pertenece al actor y restaura pregunta, clases de fuente, causa y selección documental; revocar acceso a los documentos también impide recuperar investigaciones que los contienen. Editar el alcance retira los resultados anteriores hasta ejecutar otra consulta.

## Fuentes jurídicas y procedencia

- Dirección del Trabajo: importación de artículos individuales, probada con una respuesta oficial real. Conserva bytes HTML originales, texto del pronunciamiento, identidad, organismo, fecha de cabecera y fecha de consulta.
- BCN/LeyChile: identidad y parser XML preparados y probados con fixtures. El acceso en vivo respondió 401 desde esta red; la interfaz informa la indisponibilidad. No se presenta como cobertura operativa comprobada.
- Aporte manual: texto público identificado por URL admitida, distinguido de una recuperación del organismo. No acredita autenticidad o actualización oficial. Se registra como una versión manual, con su original y hashes.

Las fechas de publicación/documento y consulta se conservan separadas. No se infiere vigencia o inicio/término de efectos a partir de ellas. El [ensayo de fuentes](VIABILIDAD-FUENTES-JURIDICAS.md) detalla endpoints, resultados, hashes y exclusiones. El conector no envía preguntas ni expedientes; obtiene solamente la URL pública elegida, mediante HTTPS y rutas admitidas, sin redirecciones ni credenciales.

El listado y los briefs de jurisprudencia anteriores siguen disponibles. Sus registros no se incorporan automáticamente a este corpus: primero necesitan originales y procedencia versionada. Tampoco se promete cobertura completa judicial, administrativa o doctrinal por haber importado un documento individual.

## Integridad y permisos

El esquema añade páginas a `DocumentEvidenceVersion` y relaciona cada fragmento con su página y posiciones exactas. Antes de servir o citar un fragmento se comprueba que pertenece a la misma versión, que coincide con el texto y que los hashes siguen siendo válidos. Las imágenes se renderizan desde los bytes originales conservados, después de comprobar su hash y el acceso actual. Se entregan de forma privada, sin caché compartida.

`LegalSource`, `LegalSourceVersion` y `LegalSourceFragment` conservan snapshots inmutables y originales. Reimportar el mismo contenido es idempotente; modificar metadatos de un aporte manual con los mismos bytes exige una versión coherente y no sobrescribe la anterior. La fuente pública es material compartido de estudio, no un depósito de documentos privados. `ResearchRun` conserva alcance y resultados, con autorización de dueño y comprobación actual de cada documento.

La migración aditiva `20261101190000_pdf_pages_and_legal_research` es la número 31. Las versiones históricas conservan `locatorKind=text-offset` y `pageCount=null`; no se reinterpretan como páginas verificadas. La actualización 30→31 y una restauración posterior se probaron en bases y archivos ficticios, preservando filas, hashes, originales, citas e historial. El [registro de validación](pdf-investigacion-2026-11-01/VALIDACION.md) distingue esa prueba lógica de una recuperación física del Host.

## Requisitos y límites del Host

La extracción nativa usa una biblioteca local en un proceso separado. La imagen usa Poppler (`pdftoppm`) y el OCR, Tesseract con los idiomas instalados. No hay conversión remota de documentos. El Host puede configurar `OCR_PDFTOPPM_BIN`, `OCR_TESSERACT_BIN`, `OCR_LANGUAGE` (por defecto `spa+eng`) y `TESSDATA_PREFIX`. `OCR_ENABLED=0` desactiva el OCR. Una herramienta ausente produce un estado o error explícito, sin recurrir a un proveedor externo. La preparación de documentos y las citas usan el mismo motor de páginas físicas: `OCR_MAX_PAGES` limita los intentos de reconocimiento a 20 páginas por documento por defecto (entre 1 y 100), sin contar el texto nativo ni las páginas vacías. Las páginas pendientes conservan su número y motivo. `OCR_TIMEOUT_MS` limita cada comando de render/OCR; sigue vigente el máximo total de 120 segundos.

| Operación | Límite actual |
| --- | --- |
| PDF original | 25 MiB; hasta 500 páginas físicas |
| Extracción por versión | Primeras 100 páginas por defecto; inventario explícito del resto; dos millones de caracteres; 120 s totales |
| Concurrencia PDF | Dos procesos de lectura nativa y dos renderizados simultáneos por proceso servidor; saturación con respuesta explícita |
| Imagen de página | Hasta 2000 px por lado y 12 MiB; temporales eliminados al terminar/cancelar |
| Importación oficial | 8 MiB y 20 s; rutas individuales admitidas; sin seguir redirecciones |
| Consulta local | Hasta 200 documentos, 200 fuentes jurídicas y 200 candidatos por clase; hasta 20 resultados; límites y cobertura visibles |

Para instalar este incremento sobre su base, conservar respaldo de base, archivos y configuración; instalar dependencias y herramientas locales; ejecutar `prisma migrate deploy`, generar Prisma y compilar. No sustituir la migración por `db push`. En CI Linux se instalan explícitamente Poppler, Tesseract y los paquetes de idioma español/inglés; el modo `LEXOPEN_PDF_REQUIRE_TOOLS=1` exige probar renderizado y OCR reales. La prueba reproducible `npm run test:production:pdf-research` exige servidor compilado, controles normales y una base desechable explícita; nunca debe apuntarse a una instalación de trabajo.

## Validación y continuación

Se probaron motor PDF, integridad, límites, permisos, importación, consulta, historial y restauración; lint, tipos, build, integración PostgreSQL y navegador. Un ensayo contra el servidor compilado comprobó el flujo visual, OCR, imágenes, CSRF y revocación con controles de producción. Se conservaron [logs y capturas](pdf-investigacion-2026-11-01/VALIDACION.md). No se migró ni desplegó una instalación real del estudio.

F1 avanza con páginas físicas y originales estables para `Documento`; siguen pendientes la captura `SiteFile` y selección/importación identificada de Drive. F2 dispone de un primer flujo extractivo evaluable; todavía faltan más conectores oficiales aceptados, versiones normativas históricas y vigencia comprobada, contradicción entre precedentes, evaluación jurídica de calidad y recuperación semántica medida. Estas son las siguientes entregas del plan; este incremento no cierra las 58 capacidades de referencia.
