# Contribuciones a LexOpen

1. Fork y rama `cursor/<feature>-xxxx` o `feat/<nombre>`.
2. `npm run setup && npm run dev` para datos demo Chile.
3. Mantenga el español en la UI orientada a la práctica jurídica en Chile
   (abogados independientes y estudios).
4. No agregue secretos reales a commits; use `.env.example`.
5. PR con descripción de módulos tocados (causas, jurisprudencia, integraciones).

Antes de entregar un cambio, ejecute `npm run typecheck`. Este comando regenera
el cliente de Prisma y los tipos de rutas de Next.js antes de comprobar TypeScript;
evita errores en cadena al añadir campos o relaciones, como las opciones y el
orden de las acciones de una minuta. No aplica migraciones ni modifica datos.

Para ejecutar las pruebas de navegador, use una base PostgreSQL local desechable:

```bash
npm run e2e:install
E2E_DATABASE_URL=postgresql://lexopen:lexopen@127.0.0.1:5432/lexopen_e2e npm run e2e
```

El runner reinicia esa base antes de cada ejecución y rechaza URLs remotas o
nombres que no indiquen `e2e`/`test`.

`npm run e2e` conserva la suite de Chromium. `npm run e2e:cross` añade los
recorridos breves de Firefox y WebKit y es el comando empleado en CI.
La captura de audio se verifica por separado, con micrófono sintético y el
servidor compilado, para evitar recargas de desarrollo durante la grabación:

```bash
npm run build
E2E_DATABASE_URL=postgresql://lexopen:lexopen@127.0.0.1:5432/lexopen_e2e npm run e2e:audio
```

Ese ejecutor conserva los controles de autenticación y CSRF de producción.
Prepara los ejemplos bajo entorno de prueba y permite almacenamiento local
únicamente para su Host HTTP de prueba y su base desechable.

Licencia del proyecto: AGPL-3.0-or-later.

## Design system / agentes

- No cree `.jules/` ni `.Jules/` (scratch de agentes; eliminado en main y
  ignorado en `.gitignore` por colisión en FS case-insensitive).
- Tokens UI: `src/app/globals.css` (Tailwind 4 `@theme`, light/`html.dark`).
- Primitivos: `src/components/ui/` — importe desde `@/components/ui`.
- Strings nuevas de UI vía diccionarios `src/lib/i18n/dictionaries/{es,en}.ts`.
- Next.js 16: lea `node_modules/next/dist/docs/` antes de layouts/rutas (AGENTS.md).

## Release / Host

- Versión canónica: `package.json` (Desktop: `desktop/package.json`).
- Upgrade Host: `docs/UPGRADE-1.0.md` — siempre `prisma migrate deploy` sobre datos reales.
- Asistente vs Agente: `docs/ASISTENTE.md`. Checklist prod: `npm run prod:check`.

