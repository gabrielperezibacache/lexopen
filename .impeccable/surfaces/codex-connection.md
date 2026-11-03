# Conexión personal de Codex

## Mode

Configure. Extensión local de Mi cuenta dentro del mundo editorial establecido. Hereda las familias, colores y controles de LexOpen; no añade identidad, tokens ni un sistema de componentes paralelo.

## Outcome

Permitir que cada profesional conecte su propia cuenta de ChatGPT/Codex en este Host, elija un modelo y decida si la utiliza en próximas solicitudes de IA. La conexión personal mantiene los permisos vigentes sobre causas, libros y fuentes. Mientras esté desactivada, se utiliza la configuración de IA del estudio.

## Hierarchy

`/cuenta#codex` reúne el título Tu cuenta de Codex, propósito, propiedad por usuario y configuración alternativa del estudio antes de cualquier acción. Una franja textual separa el estado de cuenta y su identificación; después aparecen la autorización o las preferencias. La ayuda de preparación del Host permanece plegada al final.

La autorización por dispositivo muestra un código temporal, Continuar en OpenAI y Cancelar autorización. La conexión se confirma al volver a consultar su estado; abrir Mi cuenta no autoriza ni prueba la cuenta. La interfaz no pide contraseñas, claves API ni tokens, y no expone las credenciales conservadas por el Host.

Con cuenta conectada, el orden es modelo, Actualizar modelos, activación personal, explicación del envío y acciones. **Guardar preferencia** es la acción primaria; **Probar conexión** envía explícitamente un mensaje breve sin documentos al modelo elegido; **Desconectar cuenta** revoca la conexión personal y deja desactivado su uso. La selección de modelo y el catálogo disponible no equivalen a una prueba de acceso.

## States and recovery

- Consulta inicial, cuenta sin conectar, autorización pendiente, cuenta conectada y Host pendiente de preparación se nombran en texto legible.
- Una consulta fallida presenta alerta y Volver a consultar conexión. El reintento inicial recupera las preferencias guardadas; las comprobaciones posteriores de estado conservan la edición del formulario.
- Guardado, prueba y desconexión muestran progreso y resultado. Los controles impiden solicitudes concurrentes mientras se confirma una acción.
- Si la política del estudio permite sólo IA local, el aviso explica que Codex envía solicitudes a OpenAI y queda desactivado. Con una preferencia personal incompatible se ofrece volver a la configuración del estudio.
- Un modelo guardado que ya no figura en el catálogo permanece identificado para volver a comprobarlo. Actualizar modelos es una acción recuperable y no inicia una conversación.

## Layout and decisions

Una superficie de papel contiene el flujo completo, con títulos Fraunces y texto de interfaz Sora. Divisores discretos separan estado y ayuda; verde mar señala estado, vínculos y foco; el cobre sostiene el guardado o la continuación de autorización. El estado de cuenta no depende sólo del color.

En escritorio, las acciones comparten una fila con ajuste; por debajo de 600px pasan a una columna y los botones principales ocupan el ancho disponible. Identificación de cuenta y código admiten ajuste de línea; selector, enlaces y acciones conservan controles de 44 píxeles y foco visible. La información de alcance permanece junto a la activación y la prueba.

## Routes and evidence

Superficie `/cuenta#codex`, enlazada desde `/audiencias`; API `/api/integrations/codex`. Fuentes: `src/components/config/CodexConnection.tsx`, `CodexConnection.css` y `src/app/(app)/cuenta/page.tsx`. La superficie se presenta a personal con permiso para usar el asistente.

Las cuatro capturas `codex-authorization-desktop.png`, `codex-authorization-mobile.png`, `codex-connected-desktop.png` y `codex-connected-mobile.png` están en `docs/codex-audiencias-2026-11-02/`. Muestran autorización y conexión con datos ficticios en escritorio y 360px. El ensayo `e2e/codex-connection.spec.ts` usa un servidor Codex simulado para comprobar cancelación, preferencia, consulta recuperable, prueba explícita, aislamiento por profesional, política local y desconexión. Esta evidencia no acredita autorización de una cuenta real ni disponibilidad de modelos en una cuenta de producción.
