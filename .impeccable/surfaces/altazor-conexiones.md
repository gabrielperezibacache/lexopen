# Conexiones y Secretos de ALTAZOR

## Mode

Operate: elegir aplicaciones y cuentas para un escritorio privado, revisar cada operación y escribir una credencial sólo con control manual y autorización de uso.

## Brief

Ampliación de Conexiones dentro de ALTAZOR en Mi jornada. Aplicaciones, Secretos y Compartir en LinkedIn son apartados internos; se conservan las cinco herramientas de ALTAZOR y las siete áreas globales de LexOpen. La superficie continúa Sora, Fraunces, cobre, verde mar, papel y tinta de DESIGN.md. No introduce otra identidad ni extiende la materialidad de Biblioteca a estos controles.

## Hierarchy

Navegación de Conexiones; título y explicación breve; límite de autorización y accesos que conservan su administración propia; estado del espacio y avisos; búsqueda, categorías, recuento y lista de aplicaciones. Elegir una aplicación abre su detalle con retorno al catálogo, cuentas existentes, configuración y acciones. Secretos presenta la promesa de privacidad, lista de metadatos y formulario dentro del flujo. Computadora conserva la selección de aplicaciones antes de crear un escritorio y reúne control, ampliación, destino de un secreto y autorizaciones junto a la sesión.

## Construido

- El catálogo contiene 48 adaptadores, ordenados mediante búsqueda y categorías. Las filas usan icono de categoría, nombre, estado textual y flecha; los filetes separan registros sin convertirlos en tarjetas decorativas. El número de adaptadores no expresa cuentas autorizadas ni servicios comprobados. Sin gateway configurado se puede explorar el catálogo; los campos efectivos dependen de lo que confirme el gateway.
- El detalle distingue configuración guardada, inicio de sesión pendiente y sesión autorizada. Los campos tienen etiquetas visibles y explican si son obligatorios o dependen de la modalidad. Slack separa webhook, token de bot con canal e inicio de sesión con una aplicación propia. Las credenciales no vuelven a mostrarse; al editar una conexión, dejar un secreto vacío conserva el guardado. Guardar, probar acceso, iniciar sesión y retirar son acciones distintas. Los cambios quedan bloqueados mientras exista un escritorio activo, y una operación de resultado incierto ofrece comprobarla sin repetirla.
- Computadora empieza sin aplicaciones elegidas. La selección de cuentas corresponde al próximo escritorio y queda fijada para esa sesión; requiere el refuerzo de permisos del gateway. Las operaciones de aplicaciones presentan destino, contenido, autorización de una sola operación y rechazo. Configurar una cuenta no autoriza sus acciones futuras. ChatGPT / Codex, Correo y Google del estudio conservan sus recorridos existentes; Compartir en LinkedIn conserva borrador, previsualización, confirmación y recibo.
- Secretos conserva nombre, aplicación o sitio, usuario opcional, tipo y revisión como metadatos privados. El valor se introduce en un campo de contraseña y se guarda cifrado; no se devuelve para lectura ni se incorpora al chat o a la memoria. Sustituirlo exige introducir un nuevo valor y revoca autorizaciones anteriores. Eliminarlo requiere una confirmación explícita y elimina el valor cifrado junto a sus permisos pendientes.
- Escribir un secreto guardado aparece sólo mientras la persona mantiene el control manual de una sesión disponible. Primero selecciona el campo en la captura y declara origen HTTPS exacto, nombre y tipo de campo. Después revisa el destino, el vencimiento de la autorización y confirma escribir una vez. El sistema comprueba la sesión y el control manual; el origen y el campo son declaraciones humanas y no una inspección del DOM remoto. La escritura no pulsa Enter ni envía el formulario. Un resultado no confirmado permanece identificado y no se repite automáticamente.
- La vista del escritorio ofrece Vista completa, Tamaño real · 100 % y Ampliar · 150 %. La ampliación usa las dimensiones naturales de la imagen y conserva el desplazamiento dentro de su región con foco de teclado; los clics se traducen a las coordenadas del escritorio. La ayuda explica cómo ampliar y desplazarse antes de elegir un campo en móvil. Tomar control, devolverlo, cancelar tarea y detener escritorio siguen siendo acciones distintas.

## Composición y adaptación

Las secciones usan papel continuo, filetes de baja opacidad y texto de tinta. Fraunces encabeza catálogo, detalle y secretos; Sora sostiene listas, formularios y avisos. Verde mar identifica selección, enlaces, iconos de apoyo y foco. Los botones de acción local usan tinta y superficie sólida, con radio de 10 px y altura mínima de 44 px; los campos tienen al menos 46 px. No se añaden tokens globales.

El catálogo tiene tres columnas, pasa a dos a 950 px y a una a 600 px. A 600 px también se apilan los campos, se redistribuyen los apartados internos y Administrar pasa bajo los metadatos del secreto. Las categorías y las acciones se ajustan por líneas; los textos largos admiten salto. La región del escritorio contiene su propio desplazamiento en ambos ejes y tiene una altura máxima de 62 svh. El foco es visible y el cambio de fondo de botones pierde su transición con movimiento reducido.

## Fuentes y alcance de la evidencia

Las fuentes de interfaz son `src/components/altazor/AltazorConnections.tsx`, `AltazorConnectorCatalog.tsx`, `AltazorSecrets.tsx`, `AltazorSecretUse.tsx`, `AltazorComputer.tsx` y sus módulos CSS. El catálogo y la presentación de campos están en `src/lib/altazor/connectors/`; el cifrado, la revisión y los permisos de uso están en `src/lib/altazor/secrets/`.

Las capturas de escritorio y móvil se conservan con dimensiones y huellas en [docs/altazor-conexiones-2026-11-04](../../docs/altazor-conexiones-2026-11-04/README.md). Usan profesionales, causas y credenciales ficticios, un gateway simulado y una imagen sintética dentro del escritorio. Documentan la interfaz local y su contrato de revisión; no prueban 48 cuentas reales, OAuth externo, publicación en LinkedIn, un contenedor Docker operativo, despliegue ni una revisión completa de accesibilidad. Este registro no asigna un veredicto de publicación. El frontmatter y el sidecar globales, así como las superficies anteriores, se conservan.
