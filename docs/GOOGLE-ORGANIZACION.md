# Una cuenta de Google del estudio y una Organización compartida

## Preparación, una sola vez

La administración conecta **la cuenta compartida de Google del estudio** en Configuración → Google. La misma autorización se utiliza para Drive, Calendar y Gmail. Los tokens quedan cifrados en el Host y no se copian a las preferencias de cada profesional ni al navegador.

La autorización solicita gestión de Drive, eventos de Calendar y lectura/envío de Gmail. Una cuenta ya conectada con permisos menores puede necesitar ampliar esa misma autorización una vez. Google debe tener habilitadas las APIs correspondientes en la aplicación OAuth.

El envío de avisos y la sincronización de Calendar reutilizan los consumidores compartidos existentes. El callback de Google prepara el buzón PJUD del administrador mediante una referencia a esa autorización, sin duplicar los tokens. No sobrescribe un buzón distinto ya conectado. El buzón compartido sólo puede conectarlo y leerlo la administración del Host; los profesionales no reciben acceso automático al correo completo por poder trabajar en una causa. Las conexiones personales antiguas se conservan para compatibilidad y no se fusionan con la cuenta del estudio.

## Elegir Organización

Sólo la administración puede elegir o cambiar la carpeta raíz y explorar la cuenta compartida con ese fin. Puede seleccionarla en Drive o pegar su enlace desde Configuración → Google, una causa o la portada de un espacio. Debe ser una carpeta real; Mi unidad no se admite como Organización. Todos los profesionales ven la misma raíz.

Cada integrante autorizado puede pulsar **Preparar carpeta organizada** en una causa o espacio, o **Preparar mi carpeta de usuario** en Configuración:

```text
Organización compartida
├── Clientes
│   ├── Cliente · identificador estable
│   │   ├── Causas
│   │   │   ├── RIT — Título · identificador estable
│   │   │   └── Otra causa · identificador estable
│   │   └── Espacios de trabajo
│   │       └── Espacio · identificador estable
│   └── Sin cliente · identificador del profesional
└── Usuarios
    └── Nombre del profesional · identificador estable
```

Un espacio vinculado a una causa utiliza su carpeta; los espacios independientes se sitúan bajo su cliente. Sin cliente se separa por profesional. Los nombres se normalizan y acotan; los identificadores distinguen nombres iguales y no incluyen RUT.

Se vincula la carpeta final a la causa. La sincronización queda pausada hasta que se active. Los controles existentes reciben documentos y guardan copias/versiones usando la misma cuenta compartida. Preparar carpetas no copia automáticamente todos los documentos, no cambia permisos de Drive y no activa sincronización de los archivos de un espacio.

## Permisos, colaboración y recuperación

Se conserva la identidad del profesional en la auditoría y se comprueban acceso y permiso de escritura sobre cada causa o espacio. La carpeta personal sólo puede prepararla su dueño. La raíz está ligada a la revisión de la cuenta del estudio; si cambia la cuenta, se exige revisar el destino.

Dos profesionales reutilizan los nodos confirmados de un cliente. Un paso pendiente de otra persona debe confirmarlo su propietario. Antes de escribir se revalidan cuenta, sesión, cancelación, cliente, destino y los padres de las carpetas ya recorridas. Los permisos de Google no sustituyen los permisos de LexOpen, ni viceversa.

Las escrituras de la cuenta compartida reservan primero un ID de Drive y lo registran antes del POST. Tras perder una respuesta, sólo se consulta ese ID: no se reenvía la creación. Una respuesta incierta permanece pendiente; los fallos previos al envío confirmados pueden reintentarse con otra identidad de operación. Las copias recuperadas se descargan y verifican con SHA256 antes de confirmar sus bytes.

Cambiar Organización sólo afecta a destinos nuevos. Las causas con una carpeta existente la conservan. Elegir otra vez la raíz actual no duplica la estructura. Si una carpeta desaparece o se mueve fuera de su padre esperado, se interrumpe la preparación.

## Validación y límites

`npm run test:drive:organization` exige PostgreSQL local desechable (`DATABASE_URL` y `E2E_DATABASE_URL`). Simula Google y comprueba estructura compartida, reutilización entre causas y profesionales, espacio independiente, carpeta personal, pérdida de confirmación, reserva de IDs, reconciliación, bytes exactos, revocación y buzón administrativo sin duplicar tokens.

Chromium comprueba la selección de raíz y la preparación de una carpeta personal con respuestas simuladas. Estas pruebas no modifican cuentas reales ni acreditan el consentimiento o permisos de una cuenta concreta. Las políticas del estudio y de Google deben contemplar que la cuenta es compartida. Este cambio no migra automáticamente archivos ni buzones personales existentes.
