# Validación de sentencias, audiencias y audios

Las verificaciones corresponden a código local y a bases PostgreSQL desechables con datos ficticios. No se actualizó el Host del estudio. La base de esta entrega es el PR #211, commit `27edb4e18e306eddd8184bd1dfe4d32fce33a5c9`; `main` remoto seguía en `72400f9b9627cdc147ebf7c14a791c063747a686` al preparar la propuesta.

| Comprobación | Resultado y evidencia |
| --- | --- |
| Unidades completas | Aprobadas, incluidas firmas de audio, lectura acotada de cuerpos, rangos, fechas civiles judiciales, citas y contexto IA. [Registro](logs/unit-final.log). |
| Integración anterior completa | Aprobada contra esquema40; incluye autenticación, documentos/PDF/OCR, investigación, conocimiento y biblioteca. [Registro](logs/integration-regression.log). |
| Nuevas integraciones | Aprobadas: audio+HTTP real local, fuentes de los cuatro tipos, páginas PDF, privacidad, revocación durante IA, CAS, auditoría, revisión histórica y advertencias de TXT. [Registro](logs/integration-courtroom.log). |
| TypeScript, lint y compilación | Aprobados. [Tipos](logs/types-final.log), [lint](logs/lint-final.log), [compilación](logs/build-final.log). |
| Chromium de toda la aplicación | Primer recorrido: 38 aprobadas y un selector de audiencia con nombre accesible ambiguo que agotó el tiempo. Se corrigió el nombre, sin ampliar tiempos. [Registro íntegro](logs/chromium-first.log). |
| Recorridos nuevos tras la corrección | Tres aprobados: audio, audiencia y resoluciones judiciales. Las capturas cubren 1440px y 360px; la lectura móvil recibió además ajuste de botones y una confirmación dirigida. [Primer pase dirigido](logs/chromium-targeted.log) y [confirmación final: tres aprobados en 34 s](logs/chromium-confirmation.log). |
| Servidor compilado, autenticación y CSRF normales | Aprobado: sentencia y cita, grabación original/Range206/416, transcripción, revisión/historial/publicación, lectura/notas/conversación, privacidad y revocación. [Registro](logs/production-http.log). |
| Transporte IA y transcripción | Una llamada de transcripción y otra de conversación por HTTP real hacia servicios locales ficticios. Audio PCM de silencio sintético. No acredita reconocimiento de voz real ni calidad comercial del modelo. |
| Actualización38→40 | Conservadas todas las filas y columnas anteriores de 96 tablas de dominio: 745 filas. La tabla de migraciones pasa de 38 a 40 filas; esquema sin diferencias. Se utilizó una copia de la prueba anterior de 97 tablas/783 filas totales. [Huellas](logs/upgrade38-to40-preservation.json). |
| Respaldo y restauración40 | Coincidencia exacta de 104 tablas, 77 filas y 2 objetos de almacenamiento. Destino nuevo; sin reiniciar ni modificar origen. [Huellas](logs/backup-restore40.json). |
| Lectura del respaldo con proceso nuevo | Grabación validada por bytes, 2 revisiones, publicación revisada, ficha judicial/cita, mesa/notas e historial IA; privacidad incluso frente a otro administrador. Cero red y ninguna fila o archivo modificado. [Registro](logs/restored-domain-read.log). |

## Cobertura relevante

- Los originales de biblioteca y grabaciones se validan por su identidad de bytes cuando corresponde. La literalidad de una transcripción publicada se coteja con su TXT, sin afirmar cotejo de la voz. Su advertencia acompaña las citas de cualquier fragmento, aunque la cabecera del TXT no esté incluida.
- Los snapshots publicados antes y después de una revisión conservan su propia revisión. Cambiar permisos del audio bloquea ambos en las APIs comunes, evidencia e investigación. Se preservan las ediciones hechas sobre copias anteriores.
- Las mesas privadas revalidan fuentes, notas y causa antes de enviar contexto y al recibir la respuesta. El historial y la exportación ocultan el texto de materiales revocados; la copia vuelve a verificar la referencia.
- Se prueban archivo excesivo tanto declarado como transmitido por partes, formato no permitido, segmentos temporales desordenados o incompatibles, proveedor no configurado, respuesta inválida/excesiva, bloqueo de envío remoto, operaciones concurrentes, reintento de operación vencida y compensación de objetos por intentos fallidos.
- La creación de notas, importaciones y revisiones se revierte si falla la auditoría. Los registros de pruebas incluyen errores sintéticos esperados para demostrar esta reversión.

## Capturas y reproducibilidad

Las [capturas](capturas/) muestran material ficticio. Se conserva la dirección de biblioteca clásica y la identidad común de LexOpen; en audiencia se priorizan lectura y controles. Se corrigieron nombres accesibles, botones comprimidos en móvil, espaciado de revisión y presentación del archivo en español. El desplazamiento instantáneo y la espera de imagen completa evitan capturar cromo fijo en tránsito o una lectura todavía cargando.

`npm run test:courtroom:integration` y los tres E2E nuevos reproducen la cobertura. `npm run test:production:courtroom` requiere explícitamente una base local desechable, servidor compilado, almacenamiento local y autenticación normal. `PROD_TEST_KEEP_FIXTURES=1` conserva únicamente las pruebas completas para comprobar su respaldo. `scripts/courtroom-restore-probe.ts` abre ese respaldo sin modificarlo. Los manifiestos incluyen sólo identificadores ficticios; no contienen contraseñas ni claves reales.

La integración remota se comprueba sobre el commit publicado del PR. La aprobación de CI no implica que haya sido fusionado en `main` ni desplegado en el Host.
