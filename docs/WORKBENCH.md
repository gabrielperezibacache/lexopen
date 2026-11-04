# Mesa del asistente por causa

La Mesa está en `/causas/<id>/mesa`, junto a Preparar la causa y al recorrido de Expediente, Biblioteca, Audiencias y Escritos. Es privada por profesional y por causa. No es una máquina virtual de escritorio: esta versión utiliza un contenedor Docker local por trabajo para fabricar archivos, con originales y resultados durables administrados por LexOpen.

## Recorrido construido

1. El profesional escribe un objetivo y selecciona expresamente hasta ocho pasajes de versiones de evidencia ya preparadas. La ventana muestra veinte pasajes por página; cada selección se limita a 3.000 caracteres y anuncia su abreviación. Ningún otro documento de la cartera se incorpora automáticamente.
2. Elige **Cuaderno de fuentes**, sin modelo ni inferencias, o **Propuesta de borrador**, con el proveedor de IA que ya tiene configurado. La Mesa identifica el destino. Un proveedor remoto requiere autorización expresa para el objetivo y los pasajes elegidos. La política de sólo IA local prevalece.
3. **Preparar trabajo** conserva objetivo, destino, imagen y copias de fuentes con identidad, versión y hash. **Ejecutar trabajo** vuelve a comprobar permisos y fuentes antes de enviar texto o crear archivos.
4. La Mesa muestra pasos, estado y **Cancelar trabajo**. Tras completar conserva Markdown y DOCX, con su hash, para revisión y descarga. El DOCX es OOXML real, con texto Unicode, títulos y referencias; no contiene macros ni componentes externos. No se ofrece PDF en esta versión.
5. **Revisado: incorporar al escrito** crea un escrito privado con referencias nativas y recibo idempotente. La acción no presenta escritos judiciales, envía mensajes ni modifica los originales. Repetirla recupera el mismo escrito.

El cotejo comprueba pasajes y material conservado. La inferencia, la vigencia, la pertinencia y las conclusiones requieren revisión profesional. Las descargas conservan enlaces relativos que requieren una sesión vigente en el mismo LexOpen.

## Preparar el ejecutor local

El ejecutor está desactivado por defecto. No se inicia Docker ni se descarga una imagen como efecto de abrir una causa. El administrador prepara Docker Linux en el equipo del Host y, desde el código de esta versión, ejecuta:

```sh
node scripts/workbench/build-image.mjs
```

El script construye la receta y muestra su identificador local `sha256:…`; no cambia la configuración del Host. Configure explícitamente:

```text
LEXOPEN_WORKBENCH_ENABLED=1
LEXOPEN_WORKBENCH_IMAGE_ID=sha256:<identificador exacto mostrado al construir>
LEXOPEN_WORKBENCH_DOCKER_HOST=unix:///var/run/docker.sock
```

En macOS con otro socket de Docker Desktop se utiliza su dirección local `unix:///…`; Windows admite `npipe:////./pipe/docker_engine`. No se aceptan endpoints Docker TCP, SSH ni remotos. `LEXOPEN_WORKBENCH_DOCKER_BIN` permite indicar el ejecutable local. El usuario que administra el Host y controla ese socket debe ser de confianza: controlar Docker es una capacidad del equipo, no un permiso que se entrega al modelo.

Reinicie el Host y verifique el recorrido con una causa ficticia. El preflight requiere un daemon Linux accesible y exactamente la imagen fijada. Un tag como `latest` no se admite para ejecutar trabajos; actualizar la receta requiere construir otra imagen y revisar su nuevo identificador. Los trabajos pendientes con otra imagen o destino quedan bloqueados y deben prepararse de nuevo.

## Fronteras de ejecución

- Sólo se ejecuta la receta incluida en `scripts/workbench/recipe.py`. No recibe comandos, programas, paquetes ni instrucciones de shell del modelo. La inferencia y sus credenciales permanecen en el Host; el contenedor recibe únicamente el texto seleccionado y la propuesta preparada.
- Un contenedor por trabajo, `--network none`, raíz de sólo lectura, UID/GID 65532, sin capacidades Linux, `no-new-privileges`, un CPU, 256 MiB de memoria y swap total, 64 procesos, límites de archivos y descriptores. La propia imagen termina su receta a los 35 segundos; el cliente impone 40 segundos y el trabajo completo 100 segundos.
- Sólo la carpeta de inputs del trabajo se monta en lectura y su output en escritura. No se montan el almacenamiento general, base de datos, credenciales ni socket Docker. Los directorios temporales están bajo una raíz privada y se eliminan después de conservar los resultados o ante error/cancelación.
- Hay un trabajo activo por Host. El acceso actual se comprueba en selección, ejecución, lectura, descarga e importación. Las copias de entrada, cuerpo y artefactos se verifican por hash. No se reutiliza material al perder acceso a una fuente.
- Los archivos de salida permitidos son `borrador.md` y `borrador.docx`, hasta 2 MB cada uno; se rechazan archivos ajenos, vacíos, enlaces simbólicos y DOCX con partes fuera de la receta. No se extrae el ZIP de Word en el Host ni se renderiza HTML del modelo en el navegador.

Docker separa procesos y recursos, pero comparte el kernel Linux de su entorno. Los permisos y aprobaciones no sustituyen las fronteras de archivos y red. Un contenedor local no autoriza enviar información a un proveedor remoto.

## Persistencia, fallos y cancelación

`WorkbenchRun`, `WorkbenchInputSnapshot`, `WorkbenchEvent`, `WorkbenchArtifact` y `WorkbenchImportReceipt` se guardan en PostgreSQL. Los bytes de los artefactos forman parte de la base; entran en sus respaldos habituales. No se guardan credenciales del modelo en estos registros. Las auditorías conservan identificadores y resultados operativos, no el objetivo ni los pasajes completos.

El flujo es `queued → running → awaiting_review → imported`, con estados terminales `cancelled`, `blocked`, `failed` e `interrupted`. Preparación e importación admiten reintentos sin duplicados. La ejecución se reclama mediante lease y token; sólo su titular puede publicar el resultado. Un cierre del proceso no se presenta como éxito: al vencer la lease se informa interrupción y se prepara otro trabajo. Esta versión no tiene reanudación automática de un contenedor interrumpido.

Cancelar se guarda antes de detener el proceso. El ejecutor observa ese estado, transmite `AbortSignal` al proveedor elegido y fuerza la eliminación del contenedor por nombre, incluso si el cliente Docker se interrumpió. Los resultados cancelados no se publican ni incorporan. Cancelar una solicitud no retira datos que el proveedor haya recibido antes de la cancelación.

## Verificación y límites de evidencia

Pruebas locales disponibles:

```sh
node --import tsx --test src/lib/workbench/runtime.test.ts src/lib/workbench/docx.test.ts
node --import tsx src/lib/workbench/llm-boundary.test.ts
python3 scripts/workbench/test_recipe.py
node --import tsx src/lib/workbench/service.integration.test.ts
```

La integración exige `E2E_DATABASE_URL` y `DATABASE_URL` iguales, locales y con nombre test/e2e, más almacenamiento ficticio. Verifica selección, versión, hashes, permisos, privacidad por propietario, cancelación, destino, importación simultánea y recibos. Su renderer Python es una fixture explícita: esas pruebas no acreditan Docker. El test de navegador `e2e/workbench.spec.ts` verifica preflight ausente y controles con eventos simulados; tampoco acredita un contenedor.

Para CI con Docker real, primero construya la imagen y fije el identificador; después ejecute `scripts/workbench/docker-smoke.ts` con `CI=true`, `LEXOPEN_WORKBENCH_TEST_DOCKER=1` y la configuración del ejecutor. Usa exclusivamente material ficticio, fabrica los archivos en el contenedor y prueba UID, red bloqueada y ausencia del socket y del filesystem general del Host. `LEXOPEN_WORKBENCH_TEST_OUTPUT` permite conservar los artefactos ficticios para comprobar su render en LibreOffice. El script rehúsa ejecutarse sin la doble habilitación de prueba. La evidencia de CI sólo queda establecida cuando ese job termina correctamente.

Se comprobó localmente la estructura del DOCX ficticio y su apertura/render A4 en LibreOffice, con inspección visual y conservación de acentos y referencias. No se ha ejercitado Docker real en el equipo de esta entrega, ni un escritorio remoto, ni una cuenta real de modelos desde la Mesa.

## Ampliación hacia un escritorio

[Dots](https://learn.chatgpt.com/docs/dots) inspira el patrón de responsabilidad continua y computadora propia; la documentación consultada no establece una API para incrustar o controlar Dots desde LexOpen. [Codex app-server](https://learn.chatgpt.com/docs/app-server) sí documenta sesiones, streaming, interrupción y políticas de ejecución; la integración de texto personal existente se mantiene deliberadamente sin comandos ni navegador.

[Kitties](https://github.com/madkoding/kitties/blob/main/docs/ARCHITECTURE.md) ofrece escritorios Docker/Podman y una [API HTTP](https://github.com/madkoding/kitties/blob/main/docs/API.md). Su posible adaptador es una etapa posterior: gateway dedicado o broker con autorización por propietario y causa, transferencia de inputs seleccionados, cancelación, revisión e importación por las mismas fronteras. Su bearer y biblioteca global no deben convertirse en permisos implícitos sobre toda la cartera. Antes de integrarlo se fijan versión y contratos; demo, documentación y código pueden diferir. No se instaló ni conectó Kitties en esta entrega.

Referencias de las fronteras técnicas: [Docker Engine security](https://docs.docker.com/engine/security/), [red none](https://docs.docker.com/engine/network/drivers/none/), [OpenAI sandbox security](https://developers.openai.com/api/docs/guides/agents-api/environments/security).
