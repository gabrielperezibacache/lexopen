# Integración de Altazor, Ícaros y permisos — 8 de noviembre de 2026

Esta integración incorpora la orquestación de Altazor y la revisión de permisos
sobre `main` (`9c16ad4`), conservando sus conexiones persistentes, Drive por causa,
autorizaciones del escritorio, docencia y trabajo sin conexión.

## Comportamiento incorporado

- Altazor consulta primero texto y controles del navegador de su contenedor.
  La lectura es paginada, admite búsqueda y limita el contenido; excluye valores
  sensibles de formularios. Las capturas siguen disponibles para tareas visuales.
- El mismo contenedor puede extraer texto de PDF, DOCX, ODT, PPTX, XLSX y archivos
  de texto. El lector usa descriptores y rechaza escapes por enlaces simbólicos.
  Conserva la comprobación de integridad de archivos importados y la autorización
  requerida por el modo supervisado.
- El chat presenta un plan resumido y el número total de acciones. Los detalles
  pueden expandirse. El visor admite ampliación, pantalla completa y salida con
  Escape, manteniendo los controles de autorización y archivos verificados.
- Los Ícaros reciben un objetivo explícito y pueden seleccionar otro modelo del
  proveedor configurado o la conexión personal de Codex. Cada perfil tiene memoria
  independiente y opcional. El orquestador recoge resultados con procedencia y
  vuelve a comprobar el acceso a las fuentes antes de mostrarlos o reutilizarlos.
- Las solicitudes de ayuda quedan pendientes hasta recibir una respuesta válida.
  ntfy y WhatsApp Meta emplean la configuración de ayuda del titular y una
  correlación de un solo uso. El envío de notificaciones generales por WhatsApp
  conserva su propia configuración Meta/Twilio, sin mezclar ambos alcances.
- Los permisos efectivos consideran rol, concesiones y revocaciones. Un integrante
  del equipo puede recibir administración del Host; clientes y externos conservan
  su límite de acceso. Las revocaciones y la política de segundo factor se aplican
  con información vigente. Los cambios parciales del estudio conservan los campos
  omitidos y la cuenta personal de Codex se administra por usuario.

## Integración con el escritorio actual

La receta `scripts/altazor/prepare-gateway-source.mjs` es la única entrada de
preparación del gateway: aplica veinte etapas y produce `gateway.18`. La lectura
es la última etapa, después de los refuerzos existentes de autorizaciones,
metadatos y Drive. No se deben ejecutar los refuerzos por segunda vez sobre esa
misma copia del código fuente.

Las instalaciones existentes necesitan el gateway actualizado y reconstruir el
perfil `lexopen-desktop-tools-2` para disponer del lector. Consulta
[las instrucciones de conexiones](ALTAZOR-CONEXIONES.md). Integrar el código en
Git no actualiza automáticamente una instalación ni conecta cuentas personales.

## Actualización de datos

La migración `20261108000000_altazor_icaros_and_help` es aditiva. La actualización
desde las 74 migraciones de `main` a las 75 integradas se comprobó en PostgreSQL
desechable, conservando exactamente usuarios, permisos, causas, conversaciones y
configuración previos. `prisma migrate diff` no detectó diferencias con el esquema.
En una instalación existente se utiliza `prisma migrate deploy`; no un reset.

## Validación

La versión combinada pasó `npm test`, `npm run typecheck`, ESLint y la compilación
de producción. Pasaron 46 pruebas de navegador y 145 pruebas de contratos del
escritorio, además de las integraciones PostgreSQL de permisos, autenticación, Drive, workflows, Ícaros,
conversación, ayuda y WhatsApp general. La suite completa `test:integration` pasó
en GitHub Actions. La receta real sobre la revisión fijada
del gateway pasó sus veinte etapas y sus veinte pruebas de scripts; las pruebas
Go focales aprobaron en siete paquetes.

Las pruebas de servicios externos usan adaptadores ficticios; no acreditan una
suscripción ni el consentimiento de una cuenta real, y no enviaron mensajes reales.
