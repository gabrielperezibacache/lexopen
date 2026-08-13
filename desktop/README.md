# LexOpen Desktop

Shell Electron opcional para **Host** (servidor del estudio) y **Cliente** (URL Tailscale).
La instalación soportada es clonar el repositorio (Node 22), no un `.dmg` / `.exe`.

Documentación completa: [../docs/DESKTOP.md](../docs/DESKTOP.md)

```bash
# Desde la raíz del clon
git clone https://github.com/gabrielperezibacache/lexopen.git
cd lexopen
npm install
npm --prefix desktop install
npm run desktop:test
npm run desktop:dev
```
