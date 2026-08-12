# Contribuciones a LexOpen

1. Fork y rama `cursor/<feature>-xxxx` o `feat/<nombre>`.
2. `npm run setup && npm run dev` para datos demo Chile.
3. Mantenga el español en la UI orientada a la práctica jurídica en Chile
   (abogados independientes y estudios).
4. No agregue secretos reales a commits; use `.env.example`.
5. PR con descripción de módulos tocados (causas, jurisprudencia, integraciones).

Para ejecutar las pruebas de navegador, use una base PostgreSQL local desechable:

```bash
npm run e2e:install
E2E_DATABASE_URL=postgresql://lexopen:lexopen@127.0.0.1:5432/lexopen_e2e npm run e2e
```

El runner reinicia esa base antes de cada ejecución y rechaza URLs remotas o
nombres que no indiquen `e2e`/`test`.

Licencia del proyecto: AGPL-3.0-or-later.
