# Animaciones integradas con el fondo editorial

Los vídeos de expediente, libro contable, reloj y lupa conservan sus archivos de Google Flow. La corrección afecta a su composición dentro de la cabecera y a los controles de reproducción.

- Un filtro SVG compartido convierte el fondo oscuro de Flow en transparencia a partir de su luminancia. Conserva el color plateado y el detalle iris del objeto, sin invertir la imagen en el tema claro. El fondo visible es la superficie real de la aplicación.
- El mismo tratamiento se aplica al póster y al vídeo. Cada póster procede del primer fotograma de su MP4, para conservar encuadre y escala al iniciar la reproducción. El vídeo se muestra cuando el navegador ha presentado un fotograma válido; mientras carga permanece la imagen. Los reinicios descartan fotogramas anteriores que pudieran quedar pendientes tras un cambio de posición.
- La figura ocupa un único espacio de proporción 16:9, sin placa de color ni fila independiente con «Animar». El control de pausa aparece al pasar el cursor o recibir foco de teclado; en dispositivos táctiles conserva una presencia tenue. Toda la figura es pulsable y conserva un área mínima de 44 px, etiqueta accesible, pausa, reanudación y recuperación de errores.
- Los vídeos se reproducen automáticamente, silenciados y en línea, después de 900 ms dentro de la pantalla. La velocidad es 0,8× y cada ciclo deja 14 segundos de reposo con la imagen fija. Un fundido de 240 ms suaviza el cambio entre imagen y vídeo.
- Salir de pantalla u ocultar la pestaña suspende la reproducción y cancela el temporizador. Una pausa manual se conserva al volver. Movimiento reducido y ahorro de datos mantienen la imagen sin descargar automáticamente el MP4; permiten una reproducción explícita. Si el navegador bloquea el autoplay, se conserva el grabado y queda disponible el control manual. No se modificaron las figuras del filósofo y Atenea del fondo.

Implementación: `EditorialInkFilter.tsx` define el filtro una vez en `AppShell`; `EditorialInk.module.css` lo comparte entre `EditorialHeading` y `EditorialMotion`. Los pósteres y su procedencia están registrados en `posters-provenance.json` y en el manifiesto público.

El pulido de continuidad usa `requestVideoFrameCallback` para mostrar el vídeo cuando su fotograma corresponde a la posición actual; recurre a un turno de pintura cuando esa API no está disponible. Pausar, cambiar de visibilidad o desmontar el componente cancela los callbacks pendientes e invalida las solicitudes anteriores. El reintento manual ejecuta `play()` dentro del evento del usuario, montando el elemento de forma síncrona cuando hace falta. Cada motivo tiene una identidad propia en la cabecera para reiniciar el reproductor al cambiar de grabado.

Verificación local del fundido, anterior al autoplay, con datos ficticios: 16 vistas animadas en Chromium, ocho vistas estáticas y dos vistas animadas en WebKit, con ambos temas y tamaños de escritorio/móvil según cada registro. Sin fallos de imagen, errores de JavaScript ni desbordamientos. Los píxeles de fondo muestreados en las esquinas del vídeo y del póster coinciden exactamente con el fondo de la página. Los hashes de los cuatro MP4 coinciden con la procedencia anterior.

La validación inicial de los ciclos automáticos se conserva por separado en `autoplay/`. Sus diez pruebas Chromium comprobaron inicio sin interacción, velocidad y silencio, pausa/reanudación, reposo real entre ciclos, visibilidad, pausa manual persistente, movimiento reducido, ahorro de datos, bloqueo de autoplay y recuperación de errores. La visibilidad de pestaña y el ahorro de datos se simulan dentro de las pruebas; no constituyen una verificación física de ahorro de batería o del teléfono. No se ha desplegado.

La revisión visual del autoplay cubre 20 vistas sin interacción previa: los cuatro vídeos en Chromium y la lupa en WebKit, con ambos temas, escritorio y móvil táctil. Todos se reproducen silenciados a 0,8×, sin desbordamientos ni errores de JavaScript; el control de escritorio permanece oculto hasta la interacción. Las muestras del fondo coinciden con la página. Evidencia en [autoplay/validation.json](autoplay/validation.json).

El pulido de continuidad verifica 13 casos funcionales, incluidos fotogramas retrasados, permiso de reproducción limitado al evento del usuario y navegación real entre apartados. Estos dos primeros casos usan simulaciones controladas del navegador. La revisión visual posterior cubre otras 20 vistas en Chromium y WebKit: los vídeos están completamente visibles y sus pósteres ocultos al reproducir, sin diferencias de color en las muestras del fondo, errores de JavaScript ni desbordamientos. TypeScript global y ESLint pasan. Alcance y resultados de cada ejecución en [pulido/validation.json](pulido/validation.json).

- [Vista de la integración actual](pulido/integracion-final.jpg)
- [Detalle de los cuatro grabados](revision-grabados.jpg)
- [Validación](validation.json)
- Evidencia: `results.json`, `static-results.json` y `webkit-results.json`.
