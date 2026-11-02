# Desinstalar LexOpen

Distinga la aplicación, el clon del código y la carpeta de datos del Host. La carpeta de datos contiene PostgreSQL, documentos y configuración. Retirar el código o la aplicación Desktop no equivale a retirar esos datos.

## Antes de retirar datos

1. Detenga el Host y cualquier servicio o tarea que lo inicie automáticamente.
2. Compruebe qué carpeta utiliza la instalación y conserve el respaldo que necesite. La [guía del Host](WEB-HOST.md) describe los respaldos y la restauración.
3. Revise la ruta sin eliminar archivos:

```bash
npm run web:uninstall -- --dry-run
```

Si configuró una carpeta propia, repita la variable al consultar:

```bash
LEXOPEN_DATA_DIR=/ruta/persistente/lexopen npm run web:uninstall -- --dry-run
```

Rutas predeterminadas habituales:

| Sistema | Carpeta de datos |
| --- | --- |
| macOS | `~/Library/Application Support/LexOpen/` |
| Windows | `%APPDATA%\LexOpen\` |
| Linux | `~/.local/share/LexOpen/` |

## Eliminar la carpeta de datos

El comando exige `--yes` y elimina permanentemente los datos de la ruta seleccionada. Ejecútelo sólo después de revisar la ruta y sus respaldos:

```bash
npm run web:uninstall -- --yes
```

Para una ubicación personalizada:

```bash
LEXOPEN_DATA_DIR=/ruta/persistente/lexopen npm run web:uninstall -- --yes
```

## Retirar el resto de la instalación

Desactive el servicio systemd, agente launchd o tarea programada que haya creado para iniciar LexOpen. En Windows, el instalador del Host puede haber creado una tarea mediante `deploy/windows/install-web-host.ps1`.

Después puede retirar la aplicación Desktop y el clon del repositorio mediante las herramientas de su sistema. Conserve por separado cualquier respaldo o documento que quiera mantener. La caché de navegadores de Playwright se administra mediante `npx playwright uninstall`; puede estar compartida con otros proyectos.
