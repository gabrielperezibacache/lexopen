# Capturas reales de LexOpen

Las nueve imágenes se capturaron directamente desde la aplicación con Chromium. Las personas, causas, hechos, documentos y títulos de biblioteca son demostrativos. No son cuentas, expedientes ni obras jurídicas reales. No se usaron maquetas ni composición o generación de imágenes.

`manifest.json` registra fecha, revisión de la aplicación, ruta, dimensiones y SHA-256 de cada PNG. `demo-constancia.pdf` es el documento de ejemplo propio abierto en el lector. La captura de audiencia muestra el panel y sus fuentes; no acredita reconocimiento de voz de un proveedor.

El README principal utiliza ahora la captura del panel independiente de la [entrega de Codex y audiencias](../../codex-audiencias-2026-11-02/README.md). Esa entrega conserva su propio manifiesto y las capturas nuevas de escritorio y móvil, también con datos ficticios.

| Archivo | Superficie |
| --- | --- |
| `causa.png` | Preparación de la causa y continuidad de sus materiales. |
| `biblioteca.png` | Biblioteca personal con seis volúmenes demostrativos. |
| `escrito.png` | Editor con un hecho incorporado y su referencia. |
| `lector-pdf.png` | Página física del PDF de demostración conservado. |
| `audiencia.png` | Panel en vivo junto al lector de una fuente. |
| `cronologia.png` | Hechos con fechas literales, citas y revisión pendiente. |
| `dashboard.png` | Panel operativo con datos del seed y de la demostración. |
| `movil.png` | Biblioteca en una pantalla de 390 × 844. |
| `biblioteca-oscura.png` | La misma biblioteca en modo oscuro. |

## Reproducir

Prepare una base PostgreSQL local exclusiva llamada `lexopen_readme_e2e`. Ajuste el usuario y la contraseña de los ejemplos. El servidor E2E **reinicializa esa base**; no use una instalación con datos que quiera conservar.

Ejemplo para macOS o Linux, desde la raíz del repositorio. Use `/tmp/lexopen-readme-storage` como carpeta temporal; el script también admite el directorio temporal del sistema en otras plataformas.

En una primera terminal:

```bash
E2E_DATABASE_URL=postgresql://lexopen:lexopen@127.0.0.1:5432/lexopen_readme_e2e \
E2E_PORT=3224 \
STORAGE_PATH=/tmp/lexopen-readme-storage \
node scripts/e2e-server.mjs
```

Cuando el servidor esté listo, en otra terminal:

```bash
E2E_BASE_URL=http://127.0.0.1:3224 \
DATABASE_URL=postgresql://lexopen:lexopen@127.0.0.1:5432/lexopen_readme_e2e \
E2E_DATABASE_URL=postgresql://lexopen:lexopen@127.0.0.1:5432/lexopen_readme_e2e \
STORAGE_PATH=/tmp/lexopen-readme-storage \
node --import tsx scripts/capture-readme.mts
```

El recorrido requiere Chromium de Playwright y las herramientas PDF locales. Crea un usuario y materiales temporales, utiliza las pantallas y servicios de LexOpen, captura los PNG y retira sus fixtures al terminar. El script comprueba servidor local, nombre de base desechable y carpeta temporal de almacenamiento.

Tras inspeccionar las capturas, detenga el servidor y PostgreSQL temporal. Los archivos de este directorio son la evidencia pública; la base utilizada no forma parte del repositorio.
