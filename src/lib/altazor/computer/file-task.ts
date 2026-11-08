import { digest } from "@/lib/personal-connectors/core";
import { assertEasyConnectorRead } from "../connectors/desktop-read-policy";

export type ExplicitFileTask = {
  kind: "google-workspace";
  connector: string;
  action: "download_file";
  args: { id: string; name?: string; format?: "pdf" | "docx" | "text" };
} | {
  kind: "github";
  connector: string;
  action: "download_file";
  args: { repo: string; path: string; ref?: string; name?: string };
};

type Argument = { value: string; start: number; end: number };
const segment = /^[A-Za-z0-9_.-]{1,150}$/;
const fileId = /^[A-Za-z0-9_-]{1,200}$/;
const intent = /^[¿¡]?\s*(?:(?:por\s+favor|please)[,:\s]*)?(?:(?:(?:quiero|necesito)\s+(?:que\s+)?|(?:puedes|podr[ií]as|can\s+you|could\s+you|i\s+(?:want|need)\s+to)\s+))?(?:desc[aá]rga(?:r|me|lo|la|melo|mela)?|descargues|download)\b/i;
const ambiguous = /\b(?:no|ni|nunca|jam[aá]s|not|never|don['’]?t|without|sin|excepto|unless|if|si|ambos|ambas|varios|varias|todos|todas|dos|tres|multiple|both|all|archivos|documentos|files|documents)\b/i;
const filename = (value: string) => Boolean(value && value.length <= 160 && value === value.trim() && !value.startsWith(".") && !/[\\/\u0000-\u001f\u007f%?#]/.test(value));
const refAllowed = (value: string) => Boolean(value && value.length <= 200 && value === value.trim() && !/[\u0000-\u001f\u007f?#\\]/.test(value) && value.split("/").every(part => part && ![".", ".."].includes(part)));

/** Read an explicitly labelled argument, preserving quoted names and paths. */
function argumentsAfter(text: string, label: RegExp): Argument[] {
  const found: Argument[] = [];
  for (const match of text.matchAll(label)) {
    const start = match.index!, rest = text.slice(start + match[0].length);
    const token = /^(?:`([^`\r\n]+)`|"([^"\r\n]+)"|'([^'\r\n]+)'|([^\s`"'<>]+))/.exec(rest);
    if (!token) { found.push({ value: "", start, end: start + match[0].length }); continue; }
    const quoted = token[1] ?? token[2] ?? token[3];
    found.push({ value: quoted ?? token[4].replace(/[.,;!]$/, ""), start, end: start + match[0].length + token[0].length });
  }
  return found;
}
function removeArguments(text: string, args: readonly Argument[]) {
  let result = text;
  for (const item of [...args].sort((a, b) => b.start - a.start)) result = result.slice(0, item.start) + " ".repeat(item.end - item.start) + result.slice(item.end);
  return result;
}
function repository(value: string) {
  const parts = value.split("/");
  return parts.length === 2 && parts.every(part => segment.test(part) && ![".", ".."].includes(part));
}
function decodePath(value: string) {
  try {
    if (!value || value.startsWith("/") || value.length > 1500) return null;
    const parts = value.split("/").map(part => decodeURIComponent(part));
    if (parts.some(part => !part || [".", ".."].includes(part) || /[\\/\u0000-\u001f\u007f%?#]/.test(part))) return null;
    return parts.join("/");
  } catch { return null; }
}
function targetFiles(text: string) {
  const explicit = argumentsAfter(text, /\b(?:archivo|file)\s+(?:(?:llamado|named)\s+)?/gi);
  const paths: string[] = [];
  for (const argument of explicit) {
    if (!argument.value) continue;
    if (["de", "del", "from", "en", "in"].includes(argument.value.toLowerCase())) continue;
    if (!decodePath(argument.value)) return null;
    paths.push(argument.value);
  }
  for (const match of text.matchAll(/(?:^|\s)([`"']?)([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*\.[A-Za-z0-9]{1,12})\1(?=$|\s|[.,;!?])/g)) paths.push(match[2]);
  return [...new Set(paths)];
}

/** Prepare one exact, explicitly requested file download. This performs no I/O,
 * account lookup, approval or download; the caller must retain those controls.
 * The gateway's complete-file action retains its 4 MiB download limit. */
export function prepareExplicitFileTask(text: string, ownerId: string, workspaceId: string, selected: readonly string[]): ExplicitFileTask | null {
  if (typeof text !== "string" || !text.trim() || text.length > 15_000 || /\u0000/.test(text) || !ownerId || !workspaceId || !Array.isArray(selected)) return null;
  const urls = [...text.matchAll(/https?:\/\/[^\s<>`"']+/gi)];
  if (urls.length > 1) return null;
  let semantic = text;
  if (urls.length) semantic = text.slice(0, urls[0].index) + " ".repeat(urls[0][0].length) + text.slice(urls[0].index! + urls[0][0].length);
  const labelledNames = argumentsAfter(semantic, /\b(?:con\s+(?:el\s+)?nombre(?:\s+de)?|guardar?\s+como|gu[aá]rd(?:alo|ala|ame)?\s+como|save\s+as|named|ll[aá]m(?:alo|ala))\s*[:=]?\s*/gi);
  const shortNames = argumentsAfter(semantic, /\b(?:como|as)\s+(?=[`"']|[^\s]+\.[A-Za-z0-9]{1,12}(?:$|\s|[.,;!?]))/gi);
  const names = [...labelledNames, ...shortNames.filter(item => !labelledNames.some(label => label.start <= item.start && label.end >= item.end))];
  if (names.length > 1 || names.some(name => !filename(name.value))) return null;
  semantic = removeArguments(semantic, names);
  if (!intent.test(semantic.trim()) || ambiguous.test(semantic) || /\b(?:y|and)\s+(?:(?:el|the|otro|another)\s+)?(?:archivo|file|documento|document)\b/i.test(semantic)) return null;
  const suffix = digest(`${ownerId}:${workspaceId}`).slice(0, 16);
  const refs = argumentsAfter(semantic, /\b(?:rama|branch|ref|revisi[oó]n|commit)\s*[:=]?\s*/gi);
  if (refs.length > 1 || refs.some(ref => !refAllowed(ref.value))) return null;
  semantic = removeArguments(semantic, refs);
  const repos = argumentsAfter(semantic, /\b(?:repositorio|repository|repo|de|from)\s*[:=]?\s*/gi).filter(argument => argument.value.includes("/"));
  if (repos.length > 1 || repos.some(repo => !repository(repo.value))) return null;
  const files = targetFiles(removeArguments(semantic, repos));
  if (!files || files.length > 1) return null;
  let unassigned = removeArguments(semantic, repos);
  for (const file of files) unassigned = unassigned.replaceAll(file, " ".repeat(file.length));
  // Another unlabelled owner/repository or path is a second possible target.
  if (unassigned.includes("/")) return null;
  const name = names[0]?.value;
  let task: ExplicitFileTask | null = null;
  if (urls.length) {
    let raw = urls[0][0];
    // A Markdown link has a syntactic closing parenthesis outside its URL.
    if (text[urls[0].index! - 1] === "(" && raw.endsWith(")")) raw = raw.slice(0, -1);
    let url: URL;
    try { url = new URL(raw); } catch { return null; }
    const rawPath = /^https:\/\/[^/?#]+([^?#]*)/i.exec(raw)?.[1] || "/";
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.href.length > 3000 || /[\\\u0000-\u001f\u007f]/.test(raw) || !decodePath(rawPath.replace(/^\//, "").replace(/\/$/, ""))) return null;
    if (url.hostname === "docs.google.com" || url.hostname === "drive.google.com") {
      if (repos.length || refs.length || files.length) return null;
      const native = url.hostname === "docs.google.com" && /^\/(?:document|spreadsheets|presentation)\/d\/([A-Za-z0-9_-]{1,200})(?:\/(?:edit|view|preview))?\/?$/.exec(url.pathname);
      const ordinary = url.hostname === "drive.google.com" && /^\/file\/d\/([A-Za-z0-9_-]{1,200})(?:\/(?:view|preview|edit))?\/?$/.exec(url.pathname);
      const open = url.hostname === "drive.google.com" && url.pathname === "/open" && url.searchParams.getAll("id").length === 1 ? url.searchParams.get("id") : null;
      const id = native ? native[1] : ordinary ? ordinary[1] : open;
      if (!id || !fileId.test(id) || (native || ordinary) && url.searchParams.has("id")) return null;
      const formats = [...semantic.matchAll(/\b(?:en|como|a|formato|as|to)\s+(?:formato\s+)?(pdf|docx|word|txt|texto\s+plano|texto|plain\s+text|text)\b/gi)].map(match => /^(?:texto|plain|text|txt)/i.test(match[1]) ? "text" as const : /^word$/i.test(match[1]) ? "docx" as const : match[1].toLowerCase() as "pdf" | "docx");
      if (new Set(formats).size > 1) return null;
      if (native && !formats.length && /\boriginal\b/i.test(semantic)) return null;
      // A native document needs an export. The pending human approval must show
      // this PDF default before execution; ordinary files are never converted.
      task = { kind: "google-workspace", connector: `altazor-google-${suffix}`, action: "download_file", args: { id, ...(name ? { name } : {}), ...(native ? { format: formats[0] || "pdf" } : {}) } };
    } else if (url.hostname === "github.com") {
      const match = /^\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/.exec(url.pathname);
      if (!match) return null;
      const repo = `${match[1]}/${match[2]}`, path = decodePath(match[4]);
      let ref: string;
      try { ref = decodeURIComponent(match[3]); } catch { return null; }
      if (!repository(repo) || !path || !refAllowed(ref) || ref.includes("/") || repos.some(item => item.value !== repo) || files.some(item => item !== path) || refs.some(item => item.value !== ref)) return null;
      task = { kind: "github", connector: `altazor-github-${suffix}`, action: "download_file", args: { repo, path, ref, ...(name ? { name } : {}) } };
    }
  } else if (repos.length === 1 && files.length === 1 && decodePath(files[0])) {
    task = { kind: "github", connector: `altazor-github-${suffix}`, action: "download_file", args: { repo: repos[0].value, path: decodePath(files[0])!, ...(refs[0] ? { ref: refs[0].value } : {}), ...(name ? { name } : {}) } };
  }
  if (!task || !selected.includes(task.connector) || [...text.matchAll(/\baltazor-(?:google|github)-[a-f0-9]{16}\b/g)].some(match => match[0] !== task.connector)) return null;
  try { assertEasyConnectorRead({ ...task, args: { action: task.action, ...task.args } }); } catch { return null; }
  return task;
}
