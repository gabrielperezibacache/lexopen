# Integración de LexOpen y verificación conjunta

La cadena de desarrollo se fusionó en `main` mediante operaciones normales de GitHub, conservando su ascendencia. Cada operación usó el HEAD esperado y se comprobó con `merged=true` y lectura posterior de `main`. No se cambiaron reglas de protección ni se usó una fusión forzada.

| PR | Resultado | Commit de integración en main |
| --- | --- | --- |
| #207 Núcleo, equipo y avisos corregidos | Fusionado | `825935a144dae72feb2bee055058907abee23558` |
| #208 PDF e investigación propia | Fusionado | `3a4a76ed4a3a797399462b56106032807dd06407` |
| #209 Espacios, Drive y fuentes oficiales | Fusionado | `63ac4a7229012d94adf91cae686d48f0b87e6cef` |
| #210 Hechos, cronología y biblioteca de fuentes | Fusionado | `6fc8c95be132a114c175433a031982cca687df2e` |
| #211 Biblioteca personal | Fusionado | `a7fd1f979455385abb01c43c84a0831723cd0001` |
| #212 Sentencias, audiencia y audios | Fusionado | `f4ca7b602d8514055f67a59dfa07b98a365d2905` |
| #202 y #203 originales | Cerrados como sustituidos | Sus capacidades y migraciones están incorporadas y corregidas en #207; no se fusionaron otra vez |

Los ocho PR anteriores eran todos los pendientes al iniciar esta integración. Los HEAD de #202 y #203 no eran ancestros de #207, por lo que no se confundió su cierre con una fusión automática. Se cotejaron sus 69 y 75 rutas respectivamente, incluidas sus tres migraciones originales, conservadas byte a byte. Los seis PR de la cadena tenían CI aprobado sobre sus HEAD exactos antes de integrarse. La instantánea resultante de `main` coincidió exactamente con el árbol ya probado de `28cad5c0`.

## Corrección de conexión entre herramientas

La verificación descubrió que publicar una transcripción en el gestor de audio no actualizaba inmediatamente las fuentes disponibles del dossier de audiencia. El usuario debía recargar la página, con riesgo de perder una nota todavía sin guardar.

Ahora una publicación o una grabación incorporada emite un aviso local acotado a la causa. El panel obtiene nuevamente el catálogo desde el servidor con sus permisos actuales y actualiza la carpeta documental. Se conservan mesa, página, pasajes seleccionados y borrador. El aviso sólo contiene el identificador de causa; no incluye texto, audio ni credenciales. Las suscripciones se retiran al desmontar y las solicitudes anteriores se cancelan.

La ejecución de CI sobre `main` integrado terminó aprobada con 38 pruebas directas y un reintento de la conversión de biblioteca. Se identificó una carrera al abrir la importación inmediatamente después de guardar sus preferencias: podía inicializarse con la elección anterior de conservar el original, mientras llegaba la lectura actualizada. Esta entrega aplica la respuesta confirmada del guardado antes de cerrar la personalización y descarta lecturas anteriores a esa confirmación. No reescribe las opciones manuales de una tanda abierta. La regresión mantiene detenida la lectura posterior y exige las opciones nuevas sin recargar ni ampliar tiempos.

## Recorrido comprobado

1. Un profesional comparte una colección con una sentencia PDF ficticia. Otro accede a su ficha judicial, tribunal/rol y página física 2 con OCR.
2. El profesional crea una audiencia y añade esa resolución al dossier. Selecciona un pasaje y deja una nota sin guardar.
3. Desde la misma página incorpora una grabación sintética, importa un TXT manual y registra revisión humana. La prueba identifica que ese texto ficticio no representa el silencio del audio.
4. Publica una copia en `Audiencias/Transcripciones`. El documento aparece inmediatamente para añadirlo al dossier, sin recargar y conservando nota y pasaje.
5. Prepara la evidencia del TXT desde el panel. Su original, huella y fragmentos quedan conservados; no se le atribuyen páginas PDF.
6. Una conversación extractiva combina la sentencia y la transcripción con dos referencias. Copia y exportación vuelven a comprobar ambas fuentes y conservan sus advertencias.
7. Se recarga para comprobar persistencia y se revisa la interfaz a 1440 y 360 píxeles.
8. Se revoca la colección: se ocultan la nota judicial y la conversación mixta, se deniega su copia y la transcripción propia de la causa permanece accesible. La exportación no revela los derivados revocados.

El ensayo de servidor compilado repite la combinación con autenticación y CSRF normales, usando transporte HTTP real hacia un transcriptor y un modelo locales ficticios. La respuesta de IA incorpora los dos pasajes; su contexto recibe el aviso de que la transcripción se coteja como TXT, sin certificar voz ni tiempos. Tras revocar la sentencia se bloquea el derivado mixto y permanece legible el TXT autorizado. Se limpian las filas y objetos creados por el ensayo.

## Evidencia y límites

- [Recorrido de navegador](integracion-conjunta-2026-11-01/logs/browser-final.log) y [confirmación final: recorrido completo en 20,9 segundos](integracion-conjunta-2026-11-01/logs/browser-confirmation.log).
- [Servidor compilado](integracion-conjunta-2026-11-01/logs/production.log), [compilación](integracion-conjunta-2026-11-01/logs/build.log), [tipos](integracion-conjunta-2026-11-01/logs/types-final.log) y [lint](integracion-conjunta-2026-11-01/logs/lint-final.log).
- Migraciones aplicadas hasta esquema 40 y comprobación sin diferencias. Esta corrección no añade ni modifica migraciones anteriores.
- [Regresión de preferencias con GET detenido](integracion-conjunta-2026-11-01/logs/preferences-final.log): aprobada en 9,3 segundos, sin reintentos.
- Prueba unitaria de avisos: aislamiento entre causas, contenido mínimo, eventos inválidos y retirada de suscripciones. Los controles de permisos siguen en servidor.
- Capturas conjuntas en [escritorio](integracion-conjunta-2026-11-01/capturas/integrated-legal-workspace-desktop.png) y [móvil](integracion-conjunta-2026-11-01/capturas/integrated-legal-workspace-mobile.png).
- La prueba conserva las políticas de salida de red y verifica que los flujos usan únicamente los transportes autorizados. Los conectores jurídicos y los proveedores configurables mantienen sus políticas.

Se ensayó exclusivamente con bases, cuentas y archivos ficticios. El primer pase tenía una expectativa de importe incorrecta en la prueba: el generador del PDF contiene 25000, no 250000. Se corrigió esa expectativa y se reforzó el cotejo de página, imagen, pasaje literal, huellas y advertencia OCR; no era un defecto del reconocimiento. No se acredita calidad jurídica ni precisión de reconocimiento de voz real. La integración en `main` no actualiza el Host ni migra datos del estudio.
