# LexOpen Desktop

Shell Electron opcional para **Host** (servidor del estudio) y **Cliente** (URL Tailscale).
Distribución preliminar nativa para Windows x64, macOS Intel/Apple Silicon y Linux x64: consulte [instaladores, firma y verificaciones](../docs/INSTALADORES.md). El clon sigue disponible para desarrollo.

Documentación completa: [../docs/DESKTOP.md](../docs/DESKTOP.md)

```bash
# Desde la raíz del clon
git clone https://github.com/gabrielperezibacache/lexopen.git
cd lexopen
npm ci
npm run desktop:install
npm run desktop:test
npm run desktop:dev
```

Para construir paquetes utilice un clon público limpio y un caché nuevo de Chromium según la guía. `desktop:dist` construye únicamente para el sistema y arquitectura actuales; `desktop:smoke` prueba el Host empaquetado con datos ficticios temporales. No apunte estas pruebas a la carpeta del estudio.
