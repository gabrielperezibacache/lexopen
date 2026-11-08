# Serie editorial para los módulos restantes

Ocho ilustraciones generadas exclusivamente en Google Flow, con Nano Banana 2.1. Comparten grabado de acero en plata, fondo índigo y un detalle iris. Los originales se conservan en `../media-sources/`; prompts e identificadores completos en `../media-sources/serie-modulos-flow-v1.json`. Los ocho WebP públicos suman 171.216 bytes.

| Motivo | Integración |
| --- | --- |
| Lupa sobre fichas | Búsqueda, Jurisprudencia y Auditoría |
| Tintero, pluma y folios | Minutas, minuta de causa y nueva minuta |
| Micrófono y cuaderno | Panel de audiencias |
| Registro de fichas | Personas y Portal |
| Tarjetas enlazadas por un hilo | Flujos, Espacios, Panorama y navegación compartida dentro de un espacio |
| Eslabones y cartera documental | Integraciones, Archivos conectados y cabeceras de conexión PJUD |
| Campanilla y recordatorios | Historial de avisos y preferencias de notificación |
| Compás de precisión | Configuración y Mi cuenta |

Se extienden los recursos existentes a los apartados financieros: libro contable en Facturas, Gastos, Cuenta corriente, UF y Tarifas, y reloj en Horas. Feedback comparte la correspondencia. Las cabeceras de Biblioteca, Académico, Calendario e Inicio conservan sus motivos existentes.

Las ilustraciones son decorativas y no añaden ruido a lectores de pantalla. Sus dimensiones reservan espacio; los WebP se sirven localmente. La generación no recibió datos de la aplicación. Se preservan texto, controles, permisos y comportamiento. No se ha desplegado ni publicado.

La primera comprobación se interrumpió por navegación y respuestas JSON inestables del servidor de desarrollo. La verificación final se realizó en una copia temporal del código, con su propia caché de Next.js, modo de desarrollo estándar (`NODE_ENV=development`, sin registro PWA) y datos ficticios. Las rutas comprobadas y las capturas quedan en este directorio; los componentes PJUD condicionales conservan sus propias reglas de visibilidad.


## Validación final

- 26 rutas y 104 vistas: escritorio de 1440×1000 y móvil de 360×900, en claro y oscuro.
- Todos los grabados visibles y cargados; respuestas 200; sin solapamientos de texto e imagen, desbordamiento horizontal ni errores de JavaScript.
- TypeScript global (`tsc --noEmit --incremental false`) y ESLint de los 30 archivos TS/TSX afectados: correctos.
- Cuatro pruebas Chromium de animaciones editoriales: correctas, en 23,9 s. Comprueban reproducción a petición, pausa/reanudación, regreso al grabado y recuperación tras error.
- `results.json` conserva los resultados por vista; `validation.json` resume las comprobaciones. `revision-1.jpg` a `revision-4.jpg` reúnen las cabeceras para revisión, y `integracion-ui.jpg` muestra cuatro ejemplos reales.

La comprobación del Portal corresponde a la vista previa de personal autorizado. Las cabeceras PJUD condicionales se validaron mediante TypeScript y ESLint, sin activar esa modalidad ni probar conexiones judiciales. No se ha realizado un despliegue ni una comprobación de producción.
