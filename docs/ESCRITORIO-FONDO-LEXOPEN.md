# Fondo del escritorio de Altazor

El escritorio utiliza el lector clásico y la firma aprobada de LexOpen sobre índigo, con el lado izquierdo despejado para trabajar. La firma transparente se conserva sin editar. El fondo está disponible en [1280 × 800](../public/branding/lexopen-desktop-midnight-1280.png), [2560 × 1600](../public/branding/lexopen-desktop-midnight-2560.png) y [SVG](../public/branding/lexopen-desktop-midnight.svg).

![Fondo de LexOpen](../public/branding/lexopen-desktop-midnight-1280.png)

El archivo de origen es `public/icons/lexopen-logo.png`. Para regenerar la composición se utiliza `node scripts/altazor/render-desktop-wallpaper.mjs`; el SVG conserva la huella SHA-256 de esa firma. Este proceso compone el fondo y no modifica el logo.

La preparación del escritorio incorpora el PNG de mayor tamaño y la configuración de PCManFM. La comprobación local de la imagen verifica las dimensiones y que ese archivo sea el fondo seleccionado. Las pruebas de empaquetado se ejecutan con `python3 scripts/altazor/prepare-desktop-source.test.py`.

Cambiar estos archivos prepara las próximas imágenes que se construyan. No actualiza una imagen ya instalada ni acredita nuevos instaladores publicados. Los escritorios existentes requieren aplicar el fondo expresamente o abrirse con una imagen reconstruida y verificada. El identificador del perfil y la imagen que esté en uso se conservan hasta completar esa construcción.

## Validación local

El 7 de noviembre de 2026 se construyó una imagen local con el nuevo fondo sobre la imagen de herramientas existente, que se conservó. El [comprobante de la prueba](ESCRITORIO-FONDO-LEXOPEN.prueba.json) registra la imagen `sha256:bb64ff77f5dabce9fa3f94975e0862c55f43f717646b9760d5fc35725c6c835a`.

Pasaron las diez comprobaciones: Word, conversión con LibreOffice, PDF, OCR en español e inglés, Excel, EPUB, bibliografía, búsqueda local, audio y fondo de LexOpen. La prueba se ejecutó con el usuario del escritorio, sin red, sin montar carpetas del equipo y con el sistema de archivos raíz en modo de lectura. Los archivos del fondo, su configuración y la comprobación coinciden con los del repositorio.

Esta evidencia corresponde a una imagen local. La activación en un escritorio y la publicación de instaladores se verifican por separado. Las tres pruebas offline de empaquetado también comprueban que el SVG conserva exactamente la firma original, ambas resoluciones y los avisos de licencia del contexto.
