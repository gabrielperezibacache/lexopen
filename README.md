<div align="center">
  <img src="docs/assets/lexopen-logo.svg" width="76" alt="LexOpen">
  <h1>LexOpen</h1>
  <p><strong>La causa, sus fuentes y su trabajo, en un mismo lugar.</strong></p>
  <p>Gestión jurídica abierta para profesionales y estudios en Chile.</p>
  <p>
    <a href="https://github.com/gabrielperezibacache/lexopen/actions/workflows/ci.yml"><img src="https://github.com/gabrielperezibacache/lexopen/actions/workflows/ci.yml/badge.svg" alt="Estado de las comprobaciones automáticas"></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/licencia-AGPL--3.0--or--later-1f6f78" alt="Licencia AGPL-3.0-or-later"></a>
  </p>
  <p><a href="#recorrido-visual">Recorrido visual</a> · <a href="#empezar">Empezar</a> · <a href="https://github.com/gabrielperezibacache/lexopen/releases">Descargas</a> · <a href="#desarrollo-y-pruebas">Desarrollo</a> · <a href="#documentación">Documentación</a></p>
</div>

![Demostración con datos ficticios: causa de LexOpen con Resumen, Expediente, Preparación, Audiencias y Escritos](docs/interfaz-2026-11-04/cause-desktop.png)

> **Interfaz real, datos de demostración.** Las capturas usan personas, causas y documentos ficticios. La reorganización de navegación mostrada corresponde a `1.1.0-preview.2`; las descargas disponibles están en [Releases](https://github.com/gabrielperezibacache/lexopen/releases). La Mesa del asistente se muestra con proveedor, eventos y resultado simulados. [Capturas de esta interfaz y alcance](docs/interfaz-2026-11-04/README.md) · [Capturas de biblioteca y reproducción](docs/assets/screenshots/README.md).

LexOpen reúne expedientes, biblioteca, investigación, audiencias y escritos con el trabajo cotidiano del estudio: clientes, plazos, calendario, tareas, comunicaciones y honorarios. Cada profesional puede preparar su causa, volver a un pasaje conservado y llevarlo a una nota o escrito con su referencia.

La aplicación se ejecuta en un **Host del estudio**: un computador o servidor que conserva PostgreSQL y los archivos. Se utiliza desde el navegador y dispone de una aplicación Desktop con modo Host o Cliente. El almacenamiento y los proveedores de IA se configuran según la instalación.

## Recorrido visual

### Encuentre el siguiente paso

**Mi jornada** es la entrada cotidiana. Siete áreas estables —Mi jornada, Causas, Agenda, Biblioteca, Clientes, Comunicaciones y Estudio— muestran sólo los destinos secundarios del área abierta. Búsqueda, avisos y cuenta permanecen a mano; el portal del cliente conserva su recorrido propio. [Guía de navegación y espacios de trabajo](docs/NAVEGACION-Y-ESPACIOS-DE-TRABAJO.md).

### Prepare la causa

La carpeta de la causa conecta antecedentes, documentos, hechos, cronología, contradicciones y próximos pasos. Bajo el título, **Resumen, Expediente, Preparación, Audiencias y Escritos** permiten continuar el trabajo; las acciones menos frecuentes se reúnen en **Más acciones**. Biblioteca y Mesa del asistente acompañan la preparación con fuentes.

### Una biblioteca propia

Incorpore libros y documentos en PDF, EPUB, DOC/DOCX, ODT, RTF o texto, entre otros formatos. Organice estantes, elija encuadernaciones y personalice su biblioteca con seis distribuciones. La colección personal es privada y las colecciones pueden compartirse con personas elegidas.

![Demostración con datos ficticios: biblioteca personal de LexOpen con libros en tres dimensiones y estantes personalizados](docs/assets/screenshots/biblioteca.png)

La importación permite conservar el original o retener sólo el texto convertido, con OCR cuando sea necesario y esté disponible. Las citas identifican qué material se conserva y con qué texto se realizó el cotejo. Las sentencias y resoluciones pueden tener ficha de tribunal, rol y fecha.

### Lea y vuelva al pasaje

El lector da el espacio principal a la página física del PDF conservado o al texto disponible. **Pasajes y citas**, **Ficha y descargas** y la personalización del ejemplar se abren en un panel contextual. Las referencias permiten regresar a su ubicación; las extracciones parciales y el OCR mantienen sus advertencias.

![Demostración con datos ficticios: original PDF conservado y panel de pasajes en el lector de LexOpen](docs/interfaz-2026-11-04/reader-desktop.png)

La investigación reúne material incorporado al Host y fuentes oficiales admitidas por los importadores. La biblioteca recupera pasajes mediante búsqueda léxica BM25; el análisis con IA utiliza el proveedor configurado y las fuentes elegidas.

### Acompañe la audiencia

Prepare un guion guardado, ordene sus puntos, tome notas y conserve registros durante la sesión. El panel en vivo ofrece control de tiempo, acceso al lector y conversión revisable a hechos propuestos, notas y borradores.

**Audiencias en vivo** (`/audiencias`) reúne sus mesas privadas vinculadas a cada causa. En la mesa puede consultar fuentes, lectura y notas, preparar el guion y conversar con pasajes elegidos. El reloj y el capturador permanecen montados al consultar las herramientas; abrir la mesa no inicia el reloj ni activa el micrófono.

![Demostración con datos ficticios: mesa de audiencia con reloj, configuración de captura y cuaderno de notas abierto](docs/interfaz-2026-11-04/hearing-notes-desktop.png)

La captura de audio requiere una acción y autorización explícitas. La transcripción aparece por tramos de unos quince segundos, después del procesamiento, y conserva originales privados. Se pueden escuchar, elegir pasajes y reintentar fallos. La recuperación temporal al navegar no activa el micrófono ni envía audio automáticamente. [Funcionamiento y límites de la transcripción](docs/ENTREGA-TRANSCRIPCION-EN-VIVO-2026-11-02.md).

### Escriba con memoria y respaldo

El editor conserva borradores privados por causa, guardado automático e historial. La hoja ocupa el espacio principal; **Incorporar fuentes**, referencias, historial y exportación comparten un panel contextual. Puede incorporar hechos, notas de audiencia y pasajes de biblioteca, con referencias que se vuelven a comprobar al consultar o exportar. Los escritos se descargan en Markdown o TXT.

![Demostración con datos ficticios: editor de escritos con hoja de trabajo, fuentes y estado de guardado](docs/interfaz-2026-11-04/writing-desktop.png)

<details>
<summary><strong>Mi jornada y uso desde el móvil</strong></summary>

Plazos, eventos y tareas acompañan el trabajo de cada causa. En móvil, el menú conserva las siete áreas y la búsqueda tiene acceso propio en la cabecera. Los paneles de lectura, escritura y audiencia se abren como diálogo, con cierre y retorno de foco.

![Demostración con datos ficticios: Mi jornada en escritorio](docs/interfaz-2026-11-04/jornada-desktop.png)

<p align="center"><img src="docs/interfaz-2026-11-04/mobile-menu.png" width="360" alt="Demostración con datos ficticios: menú móvil de LexOpen"></p>

[Ver la galería completa de escritorio y móvil](docs/interfaz-2026-11-04/README.md).

</details>

<details>
<summary><strong>Mesa del asistente: preparar, ejecutar y revisar</strong></summary>

Elija un objetivo y sus fuentes, ejecute con el destino disponible y revise el resultado antes de incorporarlo al escrito. Los trabajos guardados se pueden volver a abrir por su enlace. [Preparación del ejecutor y límites](docs/WORKBENCH.md).

![Demostración con datos ficticios: Mesa del asistente con proveedor, eventos y resultado simulados; esta captura no prueba una ejecución de Docker](docs/interfaz-2026-11-04/workbench-desktop.png)

</details>

<details>
<summary><strong>Biblioteca en modo oscuro</strong></summary>

![Demostración con datos ficticios: biblioteca de LexOpen en modo oscuro](docs/assets/screenshots/biblioteca-oscura.png)

</details>

## Qué incluye

| Apartado | Trabajo disponible |
| --- | --- |
| **Causas y clientes** | Fichas, RIT/RUC, tribunales, partes, etapas, documentos, trámites y revisión de conflictos. |
| **Documentos y fuentes** | Incorporación, versiones, páginas PDF, extracción de texto, OCR local y cotejo literal de pasajes. |
| **Biblioteca y resoluciones** | Libros personales, estantes, colecciones compartibles, ficha judicial y recuperación de pasajes. |
| **Conocimiento de la causa** | Hechos propuestos, revisión humana, cronología, incertidumbre y contradicciones vinculadas a citas. |
| **Audiencias y audios** | Mesas privadas, lector, guion, notas, conversación con fuentes, registros, originales y transcripciones. |
| **Escritos** | Borradores por causa, guardado automático, historial, referencias verificables y exportación Markdown/TXT. |
| **Operación diaria** | Tareas, plazos, calendario, minutas, mensajes, notificaciones y panel de actividad. |
| **Espacios y portal** | Archivos, miembros, wiki, publicaciones, Q&A, tablas y flujos de aprobación con permisos. |
| **Honorarios y cobros** | Horas, gastos, tarifas, provisiones, pagos y documentos internos de cobro. |
| **Acceso y trazabilidad** | Roles y capacidades, confidencialidad, sesiones firmadas, doble factor y auditoría de operaciones. |

## Empezar

<a id="-empezar-guía-sencilla"></a>

### Host del estudio

Requisitos: **Node.js 22 o superior**, npm, Git y un directorio persistente con espacio para la base de datos y los documentos.

```bash
git clone https://github.com/gabrielperezibacache/lexopen.git
cd lexopen
npm ci
npm run web:host
```

El Host prepara el runtime, aplica las migraciones y arranca la aplicación con PostgreSQL embebido. Abra `http://127.0.0.1:3000/setup` y cree el primer administrador usando el token de instalación del archivo `.env` de la carpeta de datos.

Para elegir una carpeta de datos en macOS o Linux:

```bash
LEXOPEN_DATA_DIR=/ruta/persistente/lexopen npm run web:host
```

En PowerShell:

```powershell
$env:LEXOPEN_DATA_DIR="C:\LexOpenData"
npm run web:host
```

La configuración genera sus propios secretos y mantiene desactivadas las opciones de demostración. Al volver a abrir una instalación, ejecute `npm run web:host` desde el mismo clon y conserve su carpeta de datos.

Las páginas físicas de PDF y el OCR utilizan herramientas locales como Poppler y Tesseract. Consulte su instalación y diagnóstico en la [guía del Host](docs/WEB-HOST.md#ocr-local-para-pdfs-escaneados).

**Otros equipos:** el Host escucha en loopback por defecto. El acceso por LAN o Tailscale requiere configurar la dirección pública o el enlace de red, además de los orígenes permitidos. Siga la [guía de acceso de clientes](docs/WEB-HOST.md#acceso-desde-los-clientes). La captura del navegador necesita HTTPS o loopback.

**Desktop:** consulte los [instaladores preliminares para Windows, macOS y Linux](docs/INSTALADORES.md) y los [modos Host/Cliente](docs/DESKTOP.md). La disponibilidad del micrófono y del audio compartido también depende del navegador y del sistema operativo.

**Mesa del asistente:** cada causa dispone de un espacio para preparar un objetivo con fuentes elegidas, generar documentos revisables y convertirlos en escritos con sus referencias. El ejecutor local se habilita expresamente; consulte [el recorrido y su preparación](docs/WORKBENCH.md).

### Actualizaciones y respaldos

El panel de actualización de **Configuración** ofrece el flujo integrado cuando está disponible. Para una actualización manual, detenga primero el Host y ejecute desde su clon:

```bash
git pull origin main
npm ci
npm ci --prefix desktop
npm run desktop:build
npm run web:host
```

Conserve la carpeta de datos y un respaldo consistente antes de actualizar. El flujo integrado sólo termina al verificar la versión, compilación y revisión esperadas después del reinicio; las dependencias se instalan desde sus locks. Los comandos de seed o reinicialización se reservan para bases de desarrollo. Consulte [actualizaciones y recuperación](docs/ACTUALIZACIONES.md) y [operación y respaldos](docs/WEB-HOST.md).

<a id="-cómo-desinstalar"></a>

Para retirar una instalación, use el [procedimiento de desinstalación](docs/DESINSTALAR.md) y revise las opciones de conservación de datos antes de ejecutarlo.

## Integraciones y alcance

Las integraciones son opcionales y necesitan su configuración o credenciales:

- **Google Workspace:** archivos elegidos de Drive, carpetas por causa, Calendar y funciones de correo admitidas.
- **IA y transcripción:** proveedores configurables, con política de envío del estudio y opción de servicios locales.
- **Codex personal:** cada profesional puede conectar su cuenta de ChatGPT/Codex desde **Mi cuenta**, elegir modelo y activar su uso en las próximas consultas de texto, sin API key. Requiere Codex CLI en el Host y respeta la política de sólo IA local. [Preparación, uso y límites verificados](docs/CODEX.md).
- **PJUD / OJV:** consulta por RIT/ROL y tribunal, candidatos por RUT y Mis Causas con ClaveÚnica; lectura separada del registro y resultados parciales identificados. Importación CSV y seguimiento según el acceso y la configuración. Las consultas automatizadas son opt-in; no se presentan como un canal oficial. [Guía PJUD](docs/PJUD.md) · [Ingreso manual, cuadernos y verificación](docs/ojv-interfaz-2026-11-03/README.md).
- **Obsidian y almacenamiento:** exportación Markdown y archivos locales o almacenamiento compatible con S3.

Las citas comprueban pasajes, versiones, huellas y permisos; la fidelidad de una transcripción, la pertinencia jurídica y la vigencia de las fuentes necesitan revisión profesional. Los importadores oficiales admiten determinados tipos de documentos y no constituyen un corpus completo de toda la legislación o jurisprudencia.

La facturación registra la operación interna del estudio: **no emite DTE del SII**. El motor de plazos es una ayuda de trabajo y requiere revisar el cómputo aplicable a la causa.

## Desarrollo y pruebas

El proyecto utiliza **Next.js 16, React 19, TypeScript, Prisma y PostgreSQL**, con almacenamiento local o compatible con S3. [Variables y opciones de configuración](.env.example).

Para desarrollar, prepare una **base PostgreSQL vacía y exclusiva para desarrollo**, configure su conexión en `.env` y ejecute:

```bash
cp .env.example .env
# Configure DATABASE_URL y SESSION_SECRET antes de continuar.
npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

El seed carga datos y usuarios ficticios; no debe ejecutarse contra información del estudio. La guía para colaborar está en [CONTRIBUTING.md](CONTRIBUTING.md).

Comprobaciones habituales:

```bash
npm run lint
npm test
npm run build
```

Las pruebas de integración usan `DATABASE_URL` y `E2E_DATABASE_URL` apuntando a la misma base local desechable, con nombre que incluya `test` o `e2e`. Las pruebas de navegador reinicializan su base dedicada:

```bash
npm run e2e:install
E2E_DATABASE_URL=postgresql://lexopen:lexopen@127.0.0.1:5432/lexopen_e2e npm run e2e
```

El [workflow de CI](.github/workflows/ci.yml) comprueba migraciones y diferencias de esquema, pruebas unitarias y de integración, lint, compilación y recorridos Chromium. La [galería de esta interfaz](docs/interfaz-2026-11-04/README.md) documenta la procedencia y el alcance de las imágenes; el [procedimiento de capturas anteriores](docs/assets/screenshots/README.md) conserva sus instrucciones de reproducción.

## Documentación

| Guía | Contenido |
| --- | --- |
| [Navegación y espacios de trabajo](docs/NAVEGACION-Y-ESPACIOS-DE-TRABAJO.md) | Áreas, recorrido de la causa, paneles, ajustes y continuidad del trabajo. |
| [Galería de la interfaz](docs/interfaz-2026-11-04/README.md) | Capturas reales con datos ficticios, procedencia y alcance de la validación visual. |
| [Host web](docs/WEB-HOST.md) | Instalación, red, configuración, respaldos y operación. |
| [Desktop](docs/DESKTOP.md) | Aplicación de escritorio, modos Host y Cliente. |
| [Instaladores](docs/INSTALADORES.md) | Matriz de plataformas, construcción, firma y comprobantes de distribución. |
| [Actualizaciones](docs/ACTUALIZACIONES.md) | Canales, respaldos, dependencias y recuperación. |
| [Mesa del asistente](docs/WORKBENCH.md) | Fuentes elegidas, ejecutor separado, documentos y revisión por causa. |
| [Asistente](docs/ASISTENTE.md) | Inicio, herramientas operativas y permisos. |
| [Codex personal](docs/CODEX.md) | Cuenta de ChatGPT/Codex por profesional, preparación del Host, modelos y política de envío. |
| [Biblioteca](docs/BIBLIOTECA-PERSONAL-2026-11-01.md) | Archivos personales, colecciones, lectores y citas. |
| [Audiencias en vivo](docs/ENTREGA-AUDIENCIAS-EN-VIVO-2026-11-02.md) | Guion, sesión, notas y continuidad con escritos. |
| [Transcripción y conversiones](docs/ENTREGA-TRANSCRIPCION-EN-VIVO-2026-11-02.md) | Captura, recuperación, fuentes y destinos revisables. |
| [Plan de mejora y distribución](docs/PLAN-MEJORA-DISTRIBUCION-2026-11-04.md) | Pasos por apartado, dependencias, prioridades y criterios de aceptación. |

## Contribuir y licencia

Las contribuciones se coordinan mediante issues y pull requests. Incluya el problema, el cambio y la validación; mantenga los datos de demostración separados de los expedientes reales. [Cómo contribuir](CONTRIBUTING.md).

LexOpen se distribuye bajo **AGPL-3.0-or-later**. Consulte [LICENSE](LICENSE) para sus términos.
