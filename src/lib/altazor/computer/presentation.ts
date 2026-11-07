import type { ConnectorApproval } from "../connectors/types";

type SourceField = { label: string; value: string; href?: string };
export type ComputerOperationPresentation = { title: string; fields: SourceField[]; warning?: string };
const segment = /^[A-Za-z0-9_.-]{1,150}$/;
const idPattern = /^[A-Za-z0-9_-]{1,200}$/;
function repository(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parts = value.split("/");
  return parts.length === 2 && parts.every(part => segment.test(part) && part !== "." && part !== "..") ? value : null;
}
function filePath(value: unknown): string | null {
  if (typeof value !== "string" || !value || value.length > 1500) return null;
  const path = value.replace(/^\//, "");
  return path && path.split("/").every(part => {
    try { const decoded = decodeURIComponent(part); return decoded && decoded !== "." && decoded !== ".." && !/[\\/\u0000-\u001f%?#]/.test(decoded); }
    catch { return false; }
  }) ? path : null;
}
const string = (value: unknown) => typeof value === "string" ? value : "";
function requestUrl(args: ConnectorApproval["args"]) {
  if (typeof args.path !== "string" || !args.path.startsWith("/") || args.path.startsWith("//") || /[\\\u0000-\u001f#]/.test(args.path)) return null;
  try {
    const url = new URL(args.path, "https://service.invalid");
    if (url.origin !== "https://service.invalid" || url.pathname !== args.path.split("?")[0] || ![undefined, "GET"].includes(args.method as string | undefined)) return null;
    if (args.query !== undefined) {
      if (!args.query || typeof args.query !== "object" || Array.isArray(args.query)) return null;
      for (const [key, value] of Object.entries(args.query)) {
        if (typeof value !== "string" && typeof value !== "number") return null;
        url.searchParams.set(key, String(value));
      }
    }
    return url;
  } catch { return null; }
}
const formats: Readonly<Record<string, string>> = { text: "Texto plano", pdf: "PDF", docx: "Word", "text/plain": "Texto plano", "application/pdf": "PDF", "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word" };
function googleFile(id: string, title: string, format?: string): ComputerOperationPresentation {
  const fields: SourceField[] = [{ label: "Archivo de Drive", value: id, href: `https://drive.google.com/file/d/${encodeURIComponent(id)}/view` }];
  if (format) fields.push({ label: "Formato", value: formats[format] || format });
  return { title, fields };
}
function githubFile(repo: string, path: string, title: string, ref?: string): ComputerOperationPresentation {
  return { title, fields: [{ label: "Repositorio", value: repo, href: `https://github.com/${repo}` }, { label: "Archivo", value: path }, ...(ref ? [{ label: "Versión o rama", value: ref }] : [])] };
}

/** Presentation only. Authorization still checks the complete original arguments. */
export function computerOperationPresentation(approval: Pick<ConnectorApproval, "kind" | "connector" | "action" | "args">): ComputerOperationPresentation | null {
  const google = approval.kind === "google-workspace" && /^altazor-google-[a-f0-9]{16}$/.test(approval.connector);
  const github = approval.kind === "github" && /^altazor-github-[a-f0-9]{16}$/.test(approval.connector);
  if (!google && !github) return null;
  const invalid = { title: google ? "Revisar consulta de Google Drive" : "Revisar consulta de GitHub", fields: [], warning: "No se pudo identificar el origen de esta consulta. Revisa sus detalles o recházala para preparar un encargo más preciso." };
  const { action, args } = approval;
  if (args.action !== action) return invalid;
  if (google && action === "download_file") {
    const id = string(args.id);
    if (args.format !== undefined && !Object.hasOwn(formats, string(args.format))) return invalid;
    return idPattern.test(id) ? googleFile(id, "Descargar archivo de Google Drive", string(args.format) || "Formato original") : invalid;
  }
  if (github && ["download_file", "get_file"].includes(action)) {
    const repo = repository(args.repo), path = filePath(args.path);
    return repo && path ? githubFile(repo, path, action === "download_file" ? "Descargar archivo de GitHub" : "Leer archivo de GitHub", string(args.ref)) : invalid;
  }
  if (github && ["list_issues", "get_issue"].includes(action)) {
    const repo = repository(args.repo);
    if (!repo) return invalid;
    const result: ComputerOperationPresentation = { title: "Consultar incidencias de GitHub", fields: [{ label: "Repositorio", value: repo, href: `https://github.com/${repo}` }] };
    if (action === "get_issue") {
      const number = string(args.number || args.issue);
      if (!/^\d{1,10}$/.test(number)) return invalid;
      result.title = "Leer incidencia de GitHub";
      result.fields.push({ label: "Incidencia", value: `#${number}`, href: `https://github.com/${repo}/issues/${number}` });
    } else if (typeof args.state === "string") result.fields.push({ label: "Estado solicitado", value: args.state });
    return result;
  }
  if (action !== "request") return invalid;
  const url = requestUrl(args);
  if (!url) return invalid;
  if (google) {
    if (url.pathname === "/drive/v3/files") return { title: "Buscar archivos en Google Drive", fields: [{ label: "Criterio de búsqueda", value: url.searchParams.get("q") || "Archivos accesibles en esta cuenta" }, ...(url.searchParams.has("pageSize") ? [{ label: "Resultados por página", value: url.searchParams.get("pageSize")! }] : [])] };
    const file = /^\/drive\/v3\/files\/([A-Za-z0-9_-]{1,200})(\/export)?$/.exec(url.pathname);
    if (!file) return invalid;
    if (file[2]) { const format = url.searchParams.get("mimeType") || ""; return Object.hasOwn(formats, format) ? googleFile(file[1], "Leer documento de Google Drive", format) : invalid; }
    return googleFile(file[1], url.searchParams.get("alt") === "media" ? "Leer archivo de Google Drive" : "Consultar ficha de Google Drive");
  }
  if (url.pathname === "/user/repos" && url.searchParams.get("visibility") === "public") return { title: "Listar tus repositorios públicos", fields: [{ label: "Origen", value: "Tu cuenta de GitHub · repositorios públicos" }] };
  const owner = /^\/users\/([^/]+)\/repos$/.exec(url.pathname);
  if (owner && segment.test(owner[1]) && ![".", ".."].includes(owner[1])) return { title: "Consultar repositorios públicos", fields: [{ label: "Cuenta de GitHub", value: owner[1], href: `https://github.com/${owner[1]}` }] };
  const source = /^\/repos\/([^/]+)\/([^/]+)(?:\/contents(?:\/(.+))?|\/issues(?:\/(\d{1,10}))?)?$/.exec(url.pathname);
  const repo = source && repository(`${source[1]}/${source[2]}`);
  if (!source || !repo) return invalid;
  if (source[3]) { const path = filePath(source[3]); return path ? githubFile(repo, path, "Leer archivo de GitHub", url.searchParams.get("ref") || undefined) : invalid; }
  return { title: url.pathname.includes("/issues") ? "Consultar incidencias de GitHub" : url.pathname.endsWith("/contents") ? "Explorar archivos de GitHub" : "Consultar repositorio de GitHub", fields: [{ label: "Repositorio", value: repo, href: `https://github.com/${repo}` }, ...(source[4] ? [{ label: "Incidencia", value: `#${source[4]}` }] : [])] };
}

const environmentPrefix = "INSTRUCCIONES DEL ENTORNO (no son contenido de archivos):\n";
const taskSeparator = "\n\nENCARGO DE LA PERSONA:\n";
/** The stored message remains unchanged; only the known generated wrapper folds. */
export function computerUserMessagePresentation(text: string) {
  if (!text.startsWith(environmentPrefix)) return { text, environment: null };
  const split = text.indexOf(taskSeparator, environmentPrefix.length);
  if (split < 0 || !text.slice(split + taskSeparator.length).trim()) return { text, environment: null };
  return { text: text.slice(split + taskSeparator.length), environment: text.slice(0, split) };
}
