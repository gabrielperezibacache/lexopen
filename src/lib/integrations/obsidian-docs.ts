/** Resolve markdown body and relative path for Obsidian document export. */

export function resolveDocumentoExport(doc: {
  nombre: string;
  ruta?: string | null;
  contenido?: string | null;
  extractedMarkdown?: string | null;
}): { body: string; relativeFile: string } | null {
  const body = (doc.extractedMarkdown || doc.contenido || "").trim();
  if (!body) return null;

  const baseName = doc.nombre.replace(/\\/g, "/").split("/").pop() || doc.nombre;
  const stem = baseName.replace(/\.[^.]+$/i, "");
  const file = `${stem || baseName}.md`;
  const safeFile = file.replace(/[<>:"/\\|?*]/g, "-").trim();
  const ruta = (doc.ruta || "")
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/[<>:"/\\|?*]/g, "-"))
    .join("/");

  return {
    body,
    relativeFile: ruta ? `${ruta}/${safeFile}` : safeFile,
  };
}
