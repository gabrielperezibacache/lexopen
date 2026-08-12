/** Helpers for incorporating investigative folders and loose documents. */

const SKIP_BASENAMES = new Set([
  ".ds_store",
  "thumbs.db",
  "desktop.ini",
  ".gitkeep",
]);

const SKIP_DIR_SEGMENTS = new Set([
  ".git",
  ".svn",
  ".hg",
  "node_modules",
  "__macosx",
  ".trash",
]);

const TIPO_BY_SEGMENT: Array<{ match: RegExp; tipo: string }> = [
  { match: /escrito|demanda|contestaci[oó]n|recurso|apelaci[oó]n/i, tipo: "escrito" },
  { match: /contrato|mandat|poder|anexo/i, tipo: "contrato" },
  { match: /minuta|acta|reunion|reuni[oó]n/i, tipo: "minuta" },
  { match: /evidencia|prueba|anexo.?prob|captura|foto|imagen/i, tipo: "evidencia" },
  { match: /notificaci[oó]n|receptor|c[eé]dula/i, tipo: "notificacion" },
];

export type IngestPathParts = {
  /** Relative folder path without filename (posix, no leading slash). */
  ruta: string | null;
  /** Basename only. */
  nombre: string;
  /** Full relative path used for display / storage key hints. */
  relativePath: string;
};

/** Normalize a browser File path (`webkitRelativePath` or bare name) into LexOpen parts. */
export function normalizeIngestPath(input: string): IngestPathParts | null {
  if (!input?.trim()) return null;
  const segments = input
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .split("/")
    .map((seg) => seg.trim())
    .filter(Boolean);

  if (segments.length === 0) return null;
  if (segments.some((seg) => SKIP_DIR_SEGMENTS.has(seg.toLowerCase()))) return null;

  const cleaned = segments;

  const nombre = cleaned[cleaned.length - 1]!;
  if (SKIP_BASENAMES.has(nombre.toLowerCase())) return null;
  if (nombre.startsWith("._")) return null;

  const dir = cleaned.slice(0, -1);
  const ruta = dir.length ? dir.join("/") : null;
  return {
    ruta,
    nombre,
    relativePath: ruta ? `${ruta}/${nombre}` : nombre,
  };
}

/** Infer document tipo from relative path + filename when the user leaves "auto". */
export function inferDocumentoTipo(relativePath: string, fallback = "otro"): string {
  const haystack = relativePath.replace(/\\/g, "/");
  for (const rule of TIPO_BY_SEGMENT) {
    if (rule.match.test(haystack)) return rule.tipo;
  }
  const ext = haystack.split(".").pop()?.toLowerCase() || "";
  if (["jpg", "jpeg", "png", "gif", "webp", "heic", "tif", "tiff"].includes(ext)) {
    return "evidencia";
  }
  return fallback;
}

export function shouldSkipIngestFile(file: { name: string; size: number; webkitRelativePath?: string }) {
  if (!file.size || file.size <= 0) return true;
  const path = file.webkitRelativePath || file.name;
  return normalizeIngestPath(path) === null;
}

/** Sort files so parent folders appear before nested ones (stable tree ingest). */
export function sortIngestFiles<T extends { webkitRelativePath?: string; name: string }>(files: T[]): T[] {
  return [...files].sort((a, b) => {
    const pa = (a.webkitRelativePath || a.name).replace(/\\/g, "/");
    const pb = (b.webkitRelativePath || b.name).replace(/\\/g, "/");
    return pa.localeCompare(pb, "es", { sensitivity: "base" });
  });
}

/** Split a relative folder path into ordered segments for VDR folder creation. */
export function folderSegmentsFromRuta(ruta: string | null | undefined): string[] {
  if (!ruta?.trim()) return [];
  return ruta
    .replace(/\\/g, "/")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !SKIP_DIR_SEGMENTS.has(s.toLowerCase()));
}
