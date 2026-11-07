# Modelos de IA local

En **Configuración → IA → Modelos de IA local**, LexOpen detecta el equipo que aloja la aplicación y los modelos que Ollama tiene instalados. Si entras desde otro dispositivo, la detección corresponde al equipo del estudio.

1. Pulsa **Detectar equipo y modelos**. Revisa memoria total, memoria disponible y espacio de disco de referencia.
2. Elige el uso principal: revisar documentos, redactar u ordenar notas, o apoyar el trabajo con navegador y conectores. La recomendación cambia según los recursos disponibles; puedes elegir otro modelo del catálogo.
3. Si falta el modelo, pulsa **Descargar**. Los términos adicionales de algunos modelos se presentan antes de iniciar la descarga. Una edición ya instalada se verifica antes de reutilizarla.
4. Pulsa **Probar y usar en el estudio** para activarlo. Elegir un modelo o ejecutar una detección no cambia la conexión activa. Puedes volver a la conexión anterior desde el mismo panel.

**Modelos ya instalados** muestra el inventario de Ollama, incluidos modelos fuera del catálogo. Los perfiles verificados se pueden seleccionar desde la lista. Los demás pueden configurarse en la conexión avanzada de IA; su presencia en el equipo no los activa ni acredita su compatibilidad con todas las funciones.

## Qué hace la recomendación

Es una estimación conservadora, no una prueba de velocidad. Considera memoria disponible, espacio de referencia y un margen para mantener LexOpen y las aplicaciones abiertas. El tamaño de descarga y la memoria necesaria durante el uso son distintos. La detección no certifica una GPU ni el espacio de una carpeta de modelos configurada en otro disco. Si faltan recursos o datos suficientes, el panel lo indica sin descargar nada.

El catálogo actual ofrece Qwen3 0.6B, Qwen3 1.7B y Gemma 3 1B en ediciones concretas verificadas. Sirven como apoyo para texto breve. Los documentos extensos se trabajan por pasajes; las citas y conclusiones requieren revisión. Los límites del catálogo no se convierten en una promesa de rendimiento del equipo.

## Navegador, aplicaciones y documentos

La IA redacta y analiza texto. El escritorio de Altazor, sus permisos y sus conectores ejecutan las operaciones en aplicaciones. El OCR, la transcripción y la lectura de archivos tienen sus propias herramientas. Cambiar el modelo no instala esas herramientas, no concede acceso a cuentas ni permite ejecutar cualquier operación automáticamente.

Ollama debe estar instalado y abierto en el equipo del estudio, en modo local. LexOpen consulta su dirección local fija y no recorre las carpetas personales buscando archivos. Reconocer un modelo no envía documentos al proveedor ni a Internet. Las descargas de modelos sí necesitan Internet.

La implementación utiliza el [inventario oficial de Ollama](https://docs.ollama.com/api/tags), sus [ajustes de ejecución local y memoria](https://docs.ollama.com/faq) y las ediciones del [catálogo Qwen3](https://ollama.com/library/qwen3/tags). Las decisiones sobre el perfil recomendado pertenecen a LexOpen.
