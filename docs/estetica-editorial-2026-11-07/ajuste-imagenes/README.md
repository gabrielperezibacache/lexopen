# Ajuste de integración de imágenes

Se conserva el lenguaje editorial, las imágenes existentes, la paleta índigo/plata/iris y el funcionamiento de las cuatro animaciones de Flow.

## Cambios

- Encuadre individual de los doce grabados de GPT. Se compensan sus márgenes transparentes mediante escala y desplazamiento CSS, sin modificar los originales. La referencia óptica es la caja de alfa superior a 40, ajustada hasta un máximo del 90 % del ancho y el 84 % del alto del marco.
- Marco compartido de 16:9, de 136 a 168 px en escritorio. La ilustración queda alineada al extremo de la cabecera y su tamaño coincide con el de los vídeos existentes.
- En móvil, marco de 84 a 100 px junto al título. El título reserva el espacio necesario; los subtítulos recuperan todo el ancho disponible.
- Transparencia original y opacidad del 90 % en tema oscuro para que el azul participe en el grabado, sin placas de fondo añadidas. Los vídeos conservan su filtro de recorte y su fundido entre póster y fotograma.
- Ajuste de la cabecera de los espacios: la imagen se alinea con el título, por debajo del enlace de regreso en móvil.
- En Académico, el botón de ayuda pasa a la siguiente línea cuando el ancho disponible no permite mantener una columna de texto cómoda.
- Se corrige un desborde de Configuración en tablet: una etiqueta accesible con posición absoluta escapaba de la tabla de modelos. Su contenedor desplazable ahora establece el bloque de referencia. El ancho de documento baja de 867 a 820 px en la comprobación específica, sin ocultar contenido ni impedir desplazar la tabla.

## Verificación

- Primera revisión: 168 capturas de 40 rutas, con temas claro y oscuro, escritorio de 1440 px y móvil de 360 px, más casos de 820 y 320 px.
- Confirmación: 12 capturas de cabeceras y contextos representativos. Las imágenes se decodifican correctamente y no se solapan con el texto de los títulos. Se esperó a la hidratación, las fuentes y el pintado del navegador para las capturas finales.
- Comprobación adicional del desborde ya detectado en Configuración, aplicando en el navegador la misma propiedad CSS que queda guardada en el archivo. Resultado: documento de 820 px en viewport de 820 px.
- ESLint y TypeScript de los componentes modificados: correctos. TypeScript se ejecutó con una configuración acotada a `EditorialHeading` y `SiteNav`, incluidas sus dependencias.
- Cuatro pruebas de reproducción automática, velocidad de 0,8, silencio y pausa/reanudación: correctas en 51 segundos. La ejecución inicial encontró un timeout de navegación; la ejecución completa pasó con una configuración temporal que bloquea el service worker.

Entorno local aislado con datos ficticios. Las medidas móviles se emularon en Chromium; no constituyen una prueba en teléfonos físicos. No se publicó ni se ejecutó una compilación de producción o una comprobación global de tipos en esta revisión.

## Evidencias

- `vista-final.jpg`: captura real de Minutas en escritorio y móvil.
- `galeria-1.jpg` a `galeria-4.jpg`: revisión conjunta de las cabeceras en ambos temas y tamaños.
- `galeria-estrecho-portal.jpg`: casos estrechos y portal de clientes de la primera revisión.
- `results.json`: métricas de la primera revisión.
- `confirmacion/`: capturas y métricas finales de los casos seleccionados.
- `tablet-overflow-check.json`: comprobación de la corrección del desborde.
- `validation.json`: resultado estructurado de las verificaciones.
