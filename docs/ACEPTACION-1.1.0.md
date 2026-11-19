# Aceptación de LexOpen 1.1.0

LexOpen 1.1.0 estará lista para producción cuando dos integrantes del estudio hayan tramitado y retomado una causa durante un piloto de diez días hábiles, comprobado que pueden recuperarla en otro Mac conservando sus documentos, permisos y plazos, y aprobado los mismos instaladores que se publiquen. El estado de partida del 19 de noviembre de 2026 es **piloto pendiente**. La última descarga pública verificada en esa fecha era `v1.1.0-preview.10`. El PR 305 integró el recorrido de jurisprudencia, Fiscalía, Ícaros y plazos. Sus cuatro paquetes nativos eran de verificación. [PR 305](https://github.com/gabrielperezibacache/lexopen/pull/305) · [CI de la aplicación](https://github.com/gabrielperezibacache/lexopen/actions/runs/44619765096) · [Instaladores de verificación](https://github.com/gabrielperezibacache/lexopen/actions/runs/44619765048)

| Criterio | Evidencia técnica disponible en el repositorio | Lo que debe registrar el estudio |
| --- | --- | --- |
| 1. Instalar, actualizar y recuperar | El ensayo del Host empaquetado restaura una copia en otro directorio y verifica sus datos. En Linux se ejercitó la copia y restauración por CLI con PostgreSQL 17, el directorio de origen desconectado y dos usuarios con permisos distintos. La matriz nativa incluye Mac Apple Silicon. | El responsable del Host instala el DMG firmado en un Mac limpio con Gatekeeper activo, actualiza una instalación con datos de preview 10 y restaura una copia en un segundo equipo con el origen desconectado. Compara cliente y causa, bytes del documento, responsable y fecha del plazo. Verifica el acceso de un integrante autorizado y la denegación de otro. |
| 2. Tramitar una causa | El alta permite elegir equipo o estudio desde el primer guardado. Las pruebas de Drive, jurisprudencia, Fiscalía y permisos usan cuentas ficticias. El ensayo público del Buscador Unificado del 19 de noviembre recuperó una sentencia en memoria. El acceso OJV desde el entorno de desarrollo fue rechazado antes de ClaveÚnica. | Un profesional usa una causa autorizada, la cuenta compartida de Google y la carpeta Organización → cliente → causa. Compara el archivo descargado de OJV con el que abre en el expediente, coteja una cita con el texto público y registra un plazo. Verifica en Mi Fiscalía que el comprobante corresponde a la solicitud y versión elegidas. Un colega autorizado retoma el expediente y un usuario ajeno comprueba la restricción. |
| 3. Confiar en el estado | La cobertura judicial, el estado de causa y la reserva de turnos tienen pruebas en PostgreSQL. La edición civil del CPC requiere revisión profesional de fuentes, vigencia y casos de referencia para activarse. | El abogado coteja un vencimiento, una espera y una actuación con los enlaces de la ficha. Comprueba el aviso tras una consulta judicial fallida y los registros automáticos de las 08:00 y 22:00 de Santiago, más una consulta manual fuera de esos turnos. Registra manualmente las fechas para regímenes pendientes. |
| 4. Retomar el trabajo de Altazor | El Host conserva encargos, fuentes, recuerdos seleccionados y recibos de las acciones. Las suites de ayuda usan transportes simulados. | El operador delega a un Ícaro la lectura del texto de un documento o del navegador, recibe una petición real en ntfy, cierra la ventana y reinicia el Host. Responde y comprueba que el encargo correcto continúa con sus fuentes y permisos. Tras un corte durante el guardado comprueba una sola acción registrada. |
| 5. Completar el piloto y publicar | La etiqueta 1.1.0 prepara un borrador verificable con los archivos de la matriz nativa. | Dos integrantes identificables en el registro privado del estudio documentan diez días hábiles distintos en Santiago. Se anotan los defectos, la corrección y su verificación. La persona responsable aprueba la misma revisión y los mismos archivos que se ofrecerán en GitHub. |

## Comprobar la interfaz del piloto

Registrar la revisión de la interfaz que se instale y el SHA-256 de sus archivos. Los recibos de PR anteriores corresponden a sus propias compilaciones. Al iniciar cada jornada, abrir un vencimiento desde Inicio, cotejar fecha y responsable, y volver a la lista. Desde móvil, abrir una causa, descargar el original y retomar un borrador de Altazor después de consultar Herramientas. Comprobar con una cuenta de cliente que su pregunta abre la conversación correcta. [Recorridos por pantalla y rol](JERARQUIA-INFORMACION.md)

## Preparar el candidato

1. El administrador del repositorio habilita el entorno protegido `desktop-release` para etiquetas y carga las credenciales de firma y el perfil público OAuth. La integración de Codex recibió HTTP 403 al intentar crear ese entorno el 19 de noviembre. [Configuración de firma](INSTALADORES.md) · [Seguimiento en GitHub](https://github.com/gabrielperezibacache/lexopen/issues/266)
2. Con la revisión de `main` aprobada, preparar la etiqueta `v1.1.0` sobre ese commit. El workflow valida la aplicación, los paquetes y las firmas, y deja el borrador en GitHub. Quienes vayan a descargarlo necesitan acceso al borrador o recibir esos archivos por el canal privado autorizado del estudio.
3. Desde el checkout probado y con acceso de lectura al borrador, ejecutar `node desktop/scripts/verify-pilot-draft.mjs <SHA-del-commit>`. Anotar los identificadores y huellas del candidato. Antes de instalar, comparar el SHA-256 del DMG descargado con `SHA256SUMS`. Usar la descarga original sometida a cuarentena por macOS y conservar los resultados de Gatekeeper y notarización.
4. Registrar cómo se actualizó la instalación de preview 10. El DMG firmado permite comprobar la actualización manual manteniendo los datos. El actualizador público solo puede ofrecer la edición estable después de la publicación. Si preview 10 está bloqueada en un Mac, documentar la recuperación manual del directorio del Host. [Actualización](ACTUALIZACIONES.md) · [Recuperación y protección del respaldo](WEB-HOST.md)

En el Mac Apple Silicon, con el DMG descargado en Descargas y LexOpen copiada en Aplicaciones, se pueden conservar estas salidas en el acta privada. Compare la primera huella con la entrada del DMG en `SHA256SUMS`. Abra LexOpen desde Finder para completar el ensayo de primer inicio.

```sh
shasum -a 256 "$HOME/Downloads/LexOpen-1.1.0-mac-arm64.dmg"
spctl --status
spctl --assess --type execute --verbose=2 "/Applications/LexOpen.app"
codesign --verify --deep --strict --verbose=2 "/Applications/LexOpen.app"
```

El resultado esperado de Gatekeeper es que las evaluaciones estén activas y se acepte la aplicación de Developer ID notarizada. Cuando el equipo tiene las herramientas de desarrollo de Apple, `xcrun stapler validate /Applications/LexOpen.app` permite cotejar también el ticket incorporado.

## Registrar y cerrar el piloto

El acta privada se abre con el SHA del commit, el identificador del borrador, la huella de `SHA256SUMS`, los dos equipos y las personas que participarán. Por cada jornada guardar la fecha local, el alias de quien participó, el criterio ejercitado, el resultado observado y la referencia privada al respaldo de esa observación. Contar una sola jornada por fecha hábil en Santiago aunque trabajen dos personas. Asociar cada observación al candidato instalado. Para el cierre cuentan las jornadas de uso efectivo.

Si un fallo compromete el acceso al expediente, la integridad de sus datos o la ejecución única de una actuación, registrar la incidencia y verificar la corrección con el recorrido que la detectó. Un cambio de código o de instalador exige identificar el nuevo candidato y repetir las comprobaciones afectadas. Conservar el acta anterior ligada a sus propios archivos.

Al finalizar las diez jornadas, adjuntar al seguimiento del repositorio un resumen autorizado que identifique la revisión, las huellas, las fechas, la participación de dos personas y el resultado de los cinco criterios. Conservar nombres de clientes, credenciales, contenido de expedientes y respaldos en el estudio.

Antes de publicar, repetir el cotejo del borrador y comparar su identidad con la del acta aceptada. Promover ese mismo borrador en GitHub, conservando la etiqueta, las notas y sus adjuntos. Comprobar desde la publicación pública que el DMG y el archivo de sumas mantienen las huellas aceptadas. Registrar la URL pública y el resultado en el acta. [Publicaciones de LexOpen](https://github.com/gabrielperezibacache/lexopen/releases)
