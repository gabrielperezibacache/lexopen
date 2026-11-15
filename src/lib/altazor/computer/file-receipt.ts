import type { ExplicitFileTask } from "./file-task";
import { ConnectorError } from "@/lib/personal-connectors/core";
import type { VerifiedComputerFile } from "./types";
import { assertEasyConnectorRead } from "../connectors/desktop-read-policy";

export type FileReceiptBinding = {
  requestId: string; approvalId: string; chatId: string; kittyId: string;
  connector: string; kind: "google-workspace" | "github" | "dropbox"; action: "download_file";
  args: Record<string, unknown>;
};
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const identifier = /^[A-Za-z0-9_-]{1,100}$/;
const invalid = () => new ConnectorError("file_receipt_unknown", "La descarga no tiene un archivo local verificado para esta petición. No se confirmará ni se repetirá automáticamente.", 502);
const text = (value: unknown, limit: number): value is string => typeof value === "string" && Buffer.byteLength(value, "utf8") <= limit && Buffer.from(value).toString("utf8") === value;

export function fileReceiptTarget(args: Record<string, unknown>) {
  const target = Object.fromEntries(Object.entries(args).filter(([key]) => key !== "action"));
  if (args.action !== undefined && args.action !== "download_file" || Object.values(target).some(value => typeof value !== "string")) throw invalid();
  return target as Record<string, string>;
}
function sameTarget(a: Record<string, unknown>, b: Record<string, unknown>) {
  return Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([key, value]) => Object.hasOwn(b, key) && b[key] === value);
}

/** Only native, structured evidence may confirm a completed download. Never
 * infer paths, page counts or success from an assistant or connector summary. */
export function normalizeVerifiedFileReceipt(value: unknown, expected: FileReceiptBinding): VerifiedComputerFile {
  if (!record(value)) throw invalid();
  const fields = new Set(["state", "request_id", "approval_id", "chat_id", "kitty", "connector", "kind", "action", "target", "local_path", "name", "bytes", "sha256", "pages", "first_line"]);
  if (Object.keys(value).some(key => !fields.has(key)) || ![expected.requestId, expected.approvalId, expected.chatId, expected.kittyId].every(id => identifier.test(id))) throw invalid();
  const pattern = expected.kind === "google-workspace" ? /^altazor-google-[a-f0-9]{16}$/ : expected.kind === "github" ? /^altazor-github-[a-f0-9]{16}$/ : expected.kind === "dropbox" ? /^altazor-dropbox-[a-f0-9]{16}$/ : null;
  const allowed = expected.kind === "google-workspace" ? ["id", "name", "format"] : expected.kind === "dropbox" ? ["path", "name"] : ["repo", "path", "ref", "name"];
  const target = fileReceiptTarget(expected.args);
  try { assertEasyConnectorRead({ kind: expected.kind, connector: expected.connector, action: expected.action, args: { action: expected.action, ...target } }); } catch { throw invalid(); }
  if (!pattern?.test(expected.connector) || Object.keys(target).some(key => !allowed.includes(key)) || !record(value.target) || !sameTarget(value.target, target)) throw invalid();
  if (value.state !== "desktop_verified" || value.request_id !== expected.requestId || value.approval_id !== expected.approvalId || value.chat_id !== expected.chatId || value.kitty !== expected.kittyId || value.connector !== expected.connector || value.kind !== expected.kind || value.action !== "download_file" || expected.action !== "download_file") throw invalid();
  if (!text(value.name, 180) || !value.name || value.name.startsWith(".") || /[\\/\u0000-\u001f\u007f]/.test(value.name) || typeof value.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.sha256) || !Number.isInteger(value.bytes) || (value.bytes as number) < 0 || (value.bytes as number) > 4 * 1024 * 1024) throw invalid();
  if (value.local_path !== `/home/kitty/work/imports/${value.sha256}/${value.name}`) throw invalid();
  if (target.name && value.name !== target.name) throw invalid();
  if (value.pages !== undefined && (!Number.isInteger(value.pages) || (value.pages as number) < 1 || (value.pages as number) > 100_000)) throw invalid();
  if (value.first_line !== undefined && (!text(value.first_line, 800) || [...value.first_line].length > 200 || /[\u0000-\u0008\u000a-\u001f\u007f]/.test(value.first_line))) throw invalid();
  if (value.pages !== undefined && value.first_line !== undefined) throw invalid();
  return { state: "desktop_verified", requestId: expected.requestId, approvalId: expected.approvalId, chatId: expected.chatId, kittyId: expected.kittyId, connector: expected.connector, kind: expected.kind, action: "download_file", target, localPath: value.local_path, name: value.name, bytes: value.bytes as number, sha256: value.sha256, ...(value.pages === undefined ? {} : { pages: value.pages as number }), ...(value.first_line === undefined ? {} : { firstLine: value.first_line as string }) };
}

/** Revalidate the application's durable receipt using the separately stored
 * staged request, not the receipt's own claims about its target or identity. */
export function normalizeStoredFileReceipt(value: unknown, expected: FileReceiptBinding): VerifiedComputerFile {
  if (!record(value)) throw invalid();
  return normalizeVerifiedFileReceipt({ state: value.state, request_id: value.requestId, approval_id: value.approvalId, chat_id: value.chatId, kitty: value.kittyId, connector: value.connector, kind: value.kind, action: value.action, target: value.target, local_path: value.localPath, name: value.name, bytes: value.bytes, sha256: value.sha256, ...(value.pages === undefined ? {} : { pages: value.pages }), ...(value.firstLine === undefined ? {} : { first_line: value.firstLine }) }, expected);
}

export function stagedFileRequest(row: { id: string; kind: string; status: string; resultJson: string | null }, names: readonly string[]) {
  if (row.kind !== "message" || row.status !== "completed" || !row.resultJson) return null;
  try {
    const value: unknown = JSON.parse(row.resultJson);
    if (!record(value) || value.staged !== true || value.accepted !== true || value.state !== "pending" || value.requestId !== row.id || typeof value.approvalId !== "string" || !/^[A-Za-z0-9_-]{1,100}$/.test(value.approvalId) || !record(value.fileTask)) return null;
    const task = value.fileTask;
    if (!["google-workspace", "github", "dropbox"].includes(String(task.kind)) || typeof task.connector !== "string" || !names.includes(task.connector) || task.action !== "download_file" || !record(task.args)) return null;
    assertEasyConnectorRead({ kind: task.kind as "github" | "google-workspace" | "dropbox", connector: task.connector, action: task.action, args: { action: task.action, ...task.args } });
    return { approvalId: value.approvalId, requestId: row.id, task: task as ExplicitFileTask };
  } catch { return null; }
}
