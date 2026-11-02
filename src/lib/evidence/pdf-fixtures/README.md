# Fixture de páginas PDF

`mixed-three-pages.pdf` es un documento ficticio generado para las pruebas:

1. Texto PDF nativo con acentos y caracteres españoles.
2. Imagen de un texto escaneado ficticio, sin capa de texto.
3. Página física vacía.

El archivo conserva tres páginas aunque dos no tengan texto nativo. No contiene materiales de usuarios ni fuentes jurídicas reales. `create-fixture.py` permite regenerarlo con ReportLab y Pillow; esas dependencias de autoría no se necesitan al ejecutar la suite Node.

## Validación

```sh
LEXOPEN_PDF_REQUIRE_TOOLS=1 node --import tsx src/lib/evidence/pdf-pages.test.ts
```

El modo estricto exige Poppler (`pdftoppm`) y Tesseract con idioma `eng`. El Host usa `spa+eng` por defecto, configurable mediante `OCR_LANGUAGE`; puede desactivar OCR con `OCR_ENABLED=0`. Las rutas existentes `OCR_PDFTOPPM_BIN` y `OCR_TESSERACT_BIN` permiten localizar los ejecutables. No hay descarga automática ni fallback remoto.

La prueba real comprueba ordinales físicos, español, OCR solo para la segunda página, página vacía, hashes, PNG de páginas distintas, original alterado, ausencia de herramientas, PDF malformado, límites de bytes/páginas/texto/tiempo, cancelación, concurrencia y limpieza de temporales. En modo no estricto, la falta de herramientas queda explícita como pendiente/503; no se declara OCR/render verificado.

El proceso nativo se puede terminar al agotar su presupuesto. Se permiten como máximo dos parsers y dos renders simultáneos; el exceso devuelve 429. Límites del primer corte: 25 MB, 500 páginas físicas, 100 extraídas por defecto, dos millones de caracteres y 120 segundos totales. Las páginas omitidas/fallidas se conservan con estado explícito; no reciben citas inventadas.

La vista PNG se genera desde los bytes del original y el número físico solicitado. `expectedSourceSha256` permite al endpoint exigir identidad con la versión registrada. Estas comprobaciones no sustituyen revisar errores de OCR, diseños complejos ni el hardware del Host.
