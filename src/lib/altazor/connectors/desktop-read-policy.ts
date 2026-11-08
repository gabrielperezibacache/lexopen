import { ConnectorError } from "@/lib/personal-connectors/core";
import type { ConnectorApproval } from "./types";

const segment = /^[A-Za-z0-9_.-]{1,150}$/;
const fileId = /^[A-Za-z0-9_-]{1,200}$/;
function safeSegments(path: string) {
  return path.length <= 1500 && path.split("/").every(part => {
    if (!part) return false;
    let decoded: string;
    try { decoded = decodeURIComponent(part); } catch { return false; }
    return decoded !== "." && decoded !== ".." && !/[\\/\u0000-\u001f%?#]/.test(decoded);
  });
}
function stringsOnly(args: Record<string, unknown>, keys: readonly string[]) {
  return Object.entries(args).every(([key, value]) => keys.includes(key) && typeof value === "string" && value.length <= 1500);
}
function queryAllowed(query: URLSearchParams, names: readonly string[]) {
  return [...query].every(([key, value]) => names.includes(key) && value.length <= 1500) && [...query.keys()].length <= 12;
}
function cloudReadAllowed(approval: Pick<ConnectorApproval, "kind" | "connector" | "action" | "args">) {
  const { args, action, kind } = approval;
  if (args.action !== action) return false;
  const limit = args.limit === undefined || typeof args.limit === "string" && /^(?:[1-9]|[1-4][0-9]|50)$/.test(args.limit);
  const name = args.name === undefined || typeof args.name === "string" && args.name.length > 0 && args.name.length <= 180 && !args.name.startsWith(".") && !/[\\/\u0000-\u001f\u007f]/.test(args.name);
  if (kind === "dropbox") {
    const path = args.path;
    const root = path === undefined || path === "" || path === "/";
    const exact = typeof path === "string" && path.startsWith("/") && !/[\\%?#\u0000-\u001f\u007f]/.test(path) && safeSegments(path.slice(1));
    if (["download_file", "read"].includes(action)) return stringsOnly(args, ["action", "path", "name"]) && !root && exact && name;
    if (action === "list") return stringsOnly(args, ["action", "path", "limit"]) && (root || exact) && limit;
    return action === "search" && stringsOnly(args, ["action", "query", "limit"]) && typeof args.query === "string" && Boolean(args.query.trim()) && args.query.length <= 500 && !/[\u0000-\u001f\u007f]/.test(args.query) && limit;
  }
  const item = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9!_-]{1,200}$/.test(value);
  if (action === "download_file") return stringsOnly(args, ["action", "id", "name"]) && item(args.id) && name;
  if (action === "list") return stringsOnly(args, ["action", "id", "limit"]) && (args.id === undefined || item(args.id)) && limit;
  if (action === "search") return stringsOnly(args, ["action", "query", "limit"]) && typeof args.query === "string" && Boolean(args.query.trim()) && args.query.length <= 500 && !/[\u0000-\u001f\u007f]/.test(args.query) && limit;
  if (action !== "request" || Object.keys(args).some(key => !["action", "path", "method", "query"].includes(key)) || ![undefined, "GET"].includes(args.method as undefined | string) || typeof args.path !== "string" || !/^\/v1\.0\/me\/drive\/(?:root(?:\/children)?|items\/[A-Za-z0-9!_-]{1,200}(?:\/children)?)$/.test(args.path)) return false;
  if (args.query === undefined) return true;
  if (!args.query || typeof args.query !== "object" || Array.isArray(args.query) || Object.keys(args.query).length > 3) return false;
  return Object.entries(args.query).every(([key, value]) => {
    if (typeof value !== "string" || !value.trim() || value.length > 500 || /[\u0000-\u001f\u007f]/.test(value)) return false;
    if (key === "$top") return /^(?:[1-9]|[1-4][0-9]|50)$/.test(value);
    if (key === "$select") return value.split(",").every(field => ["id", "name", "size", "file", "folder", "lastModifiedDateTime", "parentReference"].includes(field));
    return key === "$orderby" && ["name", "lastModifiedDateTime desc"].includes(value);
  });
}
/** These easy sign-ins offer file reads. A broader native API must not turn them into writes. */
export function easyConnectorReadAllowed(approval: Pick<ConnectorApproval, "kind" | "connector" | "action" | "args">) {
  const generated = /^altazor-(google|github|dropbox|microsoft)-[a-f0-9]{16}$/.exec(approval.connector);
  const expectedKind: Record<string, string> = { google: "google-workspace", github: "github", dropbox: "dropbox", microsoft: "microsoft-365" };
  if (generated && expectedKind[generated[1]] !== approval.kind) return false;
  if (approval.kind === "microsoft-365" && /^altazor-microsoft-[a-f0-9]{16}$/.test(approval.connector) || approval.kind === "dropbox" && /^altazor-dropbox-[a-f0-9]{16}$/.test(approval.connector)) return cloudReadAllowed(approval);
  const isGoogle = approval.kind === "google-workspace" && /^altazor-google-[a-f0-9]{16}$/.test(approval.connector);
  const isGithub = approval.kind === "github" && /^altazor-github-[a-f0-9]{16}$/.test(approval.connector);
  if (!isGoogle && !isGithub) return true;
  const args = approval.args;
  if (args.action !== approval.action) return false;
  if (approval.action === "download_file") {
    if (!stringsOnly(args, isGoogle ? ["action", "id", "name", "format"] : ["action", "repo", "path", "ref", "name"])) return false;
    if (args.name !== undefined && (String(args.name).startsWith(".") || String(args.name).length > 180 || /[\\/\u0000-\u001f\u007f]/.test(String(args.name)))) return false;
    if (isGoogle) return fileId.test(String(args.id || "")) && (args.format === undefined || ["text", "pdf", "docx"].includes(String(args.format)));
    const repo = String(args.repo || "").split("/");
    return repo.length === 2 && repo.every(part => segment.test(part) && part !== "." && part !== "..") && typeof args.path === "string" && safeSegments(args.path.replace(/^\//, "")) && (args.ref === undefined || String(args.ref).length <= 200 && !/[\u0000-\u001f?#]/.test(String(args.ref)));
  }
  if (isGithub && ["get_file", "list_issues", "get_issue"].includes(approval.action)) {
    if (!stringsOnly(args, ["action", "repo", "path", "ref", "number", "issue", "state", "limit"])) return false;
    const repo = String(args.repo || "").split("/");
    if (repo.length !== 2 || repo.some(part => !segment.test(part) || part === "." || part === "..")) return false;
    if (approval.action === "get_file") return typeof args.path === "string" && safeSegments(args.path.replace(/^\//, "")) && (args.ref === undefined || !/[\u0000-\u001f?#]/.test(String(args.ref)));
    if (approval.action === "get_issue") return /^\d{1,10}$/.test(String(args.number || args.issue || ""));
    return args.state === undefined || ["open", "closed", "all"].includes(String(args.state));
  }
  if (approval.action !== "request" || Object.keys(args).some(key => !["action", "method", "path", "query"].includes(key)) || ![undefined, "GET"].includes(args.method as undefined | string) || typeof args.path !== "string" || args.path.length > 2000 || !args.path.startsWith("/") || args.path.startsWith("//") || /[\\\u0000-\u001f#]/.test(args.path)) return false;
  let url: URL;
  try { url = new URL(args.path, "https://service.invalid"); } catch { return false; }
  if (url.origin !== "https://service.invalid" || url.pathname !== args.path.split("?")[0]) return false;
  if (args.query !== undefined) {
    if (!args.query || typeof args.query !== "object" || Array.isArray(args.query)) return false;
    for (const [key, value] of Object.entries(args.query)) {
      if (typeof value !== "string" && typeof value !== "number" || String(value).length > 1500) return false;
      url.searchParams.set(key, String(value));
    }
  }
  if (isGoogle) {
    const match = /^\/drive\/v3\/files(?:\/([A-Za-z0-9_-]{1,200})(\/export)?)?$/.exec(url.pathname);
    if (!match || match[1] && !fileId.test(match[1])) return false;
    if (!queryAllowed(url.searchParams, ["q", "fields", "pageSize", "pageToken", "orderBy", "spaces", "alt", "mimeType"])) return false;
    if (url.searchParams.has("pageSize") && !/^(?:[1-9]|[1-4][0-9]|50)$/.test(url.searchParams.get("pageSize")!)) return false;
    if (url.searchParams.has("alt") && (!match[1] || url.searchParams.get("alt") !== "media")) return false;
    if (match[2]) return ["text/plain", "application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(url.searchParams.get("mimeType") || "");
    return !url.searchParams.has("mimeType");
  }
  if (!queryAllowed(url.searchParams, ["visibility", "per_page", "page", "sort", "direction", "type", "ref", "state"])) return false;
  if (url.searchParams.has("per_page") && !/^(?:[1-9]|[1-4][0-9]|50)$/.test(url.searchParams.get("per_page")!)) return false;
  if (url.pathname === "/user/repos") return url.searchParams.get("visibility") === "public" && !url.searchParams.has("type");
  const users = /^\/users\/([^/]+)\/repos$/.exec(url.pathname);
  if (users) return segment.test(users[1]);
  const repo = /^\/repos\/([^/]+)\/([^/]+)(?:\/(contents)(?:\/(.+))?|\/(issues)(?:\/(\d{1,10}))?)?$/.exec(url.pathname);
  return Boolean(repo && segment.test(repo[1]) && segment.test(repo[2]) && ![".", ".."].includes(repo[1]) && ![".", ".."].includes(repo[2]) && (!repo[4] || safeSegments(repo[4])));
}

export function assertEasyConnectorRead(approval: Pick<ConnectorApproval, "kind" | "connector" | "action" | "args">) {
  if (!easyConnectorReadAllowed(approval)) throw new ConnectorError("connector_read_only", "Esta conexión permite consultar los archivos autorizados. Pida una lectura concreta; no se autorizó la operación propuesta.", 409);
}
