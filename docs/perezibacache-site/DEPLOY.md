# Despliegue — perezibacache.cl/proyectos

Espejo del sitio estático de la firma (Render + Cloudflare) con **LexOpen** añadido en `Proyectos.jsx`.

## Qué cambió

- Nueva sección **LexOpen** (cover + ficha) entre MCP Legal Chile y «Otros proyectos»
- Badges: Plataforma legal · Open source · En desarrollo
- CTAs a GitHub e inicio rápido del README
- Nota al pie actualizada
- CSS responsive (`.lexopen-grid`)

## Cómo publicar en perezibacache.cl

El sitio en producción **no tiene un repositorio GitHub accesible** desde este agente (solo aparecen `lexopen`, `mcp-legal-chile`, `minimapdf`). Está servido como static site en Render (`rndr-id` en headers).

### Opción A — Reemplazar archivo en el servicio actual

1. Abra el static site de `perezibacache.cl` en el [Dashboard de Render](https://dashboard.render.com).
2. Suba / reemplace al menos:
   - `Proyectos.jsx`
   - `proyectos.html`
3. Redeploy (o deje que el sync de Git haga deploy si el servicio está conectado a un repo privado).

### Opción B — Autenticar Render MCP y redeploy desde aquí

1. En Cursor: conectar Render MCP con API key (`https://dashboard.render.com` → Account Settings → API Keys).
2. Confirmar el `workspaceId` con `list_workspaces`.
3. Pedir al agente: «despliega `docs/perezibacache-site` al servicio de perezibacache.cl».

### Opción C — Conectar este directorio como publish path

Si crea (o reasigna) un Static Site en Render apuntando a un repo que contenga esta carpeta:

| Campo | Valor |
| --- | --- |
| Build command | `true` (o vacío / `echo ok`) |
| Publish directory | `docs/perezibacache-site` |
| Domain | `perezibacache.cl` |

## Vista local

```bash
cd docs/perezibacache-site
python3 -m http.server 4173
# abrir http://localhost:4173/proyectos.html
```
