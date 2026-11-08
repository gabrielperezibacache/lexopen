import { createHash } from "node:crypto";
import { ConnectorError } from "@/lib/personal-connectors/core";
import type { ComputerUseApproval } from "./types";

const record = (v: unknown): v is Record<string, unknown> => Boolean(v && typeof v === "object" && !Array.isArray(v));
const id = /^[A-Za-z0-9_-]{1,100}$/;
const hash = /^[a-f0-9]{64}$/;
const actions = new Set(["click", "double_click", "move", "type", "key", "scroll", "drag", "page_click", "page_type", "open", "launch", "run", "install", "machine"]);
const actionLabels: Record<string, string> = { click: "Hacer clic", double_click: "Hacer doble clic", move: "Mover el puntero", type: "Escribir en la aplicación", key: "Pulsar una tecla", scroll: "Desplazar la vista", drag: "Arrastrar un elemento", page_click: "Pulsar un elemento de la página", page_type: "Escribir en la página", open: "Abrir una dirección web", launch: "Abrir una aplicación", run: "Ejecutar un comando", install: "Instalar un programa", machine: "Cambiar el estado del computador" };
const categories = new Set(["input", "browser", "apps", "command", "install", "secret", "machine"]);
const invalid = () => new ConnectorError("computer_approval_contract", "La consulta no acredita la acción exacta de este escritorio. No se ejecutará.", 502);
function canonical(value: unknown, depth = 0): string {
  if (depth > 12) throw invalid();
  if (value === null || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (typeof value === "string") { if (value.length > 32000) throw invalid(); return JSON.stringify(value); }
  if (Array.isArray(value)) { if (value.length > 200) throw invalid(); return `[${value.map(v => canonical(v, depth + 1)).join(",")}]`; }
  if (!record(value) || Object.keys(value).length > 100) throw invalid();
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key], depth + 1)}`).join(",")}}`;
}

/** The native hash covers its exact JSON bytes. Compare its parsed target too;
 * the application never guesses the Go serializer or trusts a model summary. */
export function normalizeComputerUseApproval(value: unknown, expected: { chatId: string; kittyId: string; binding: string; revision: number }): ComputerUseApproval {
  if (!record(value) || !id.test(expected.chatId) || !id.test(expected.kittyId) || typeof value.id !== "string" || !id.test(value.id) || value.kitty !== expected.kittyId || value.chat !== expected.chatId || value.connector !== "lexopen-computer-use" || value.kind !== "computer-use" || typeof value.action !== "string" || !actions.has(value.action) || !record(value.args) || value.status !== "pending" || !record(value.computer_action)) throw invalid();
  const metadata = value.computer_action;
  if (metadata.version !== "v1" || metadata.binding !== expected.binding || !hash.test(expected.binding) || metadata.policy_revision !== expected.revision || !Number.isSafeInteger(expected.revision) || expected.revision < 1 || typeof metadata.category !== "string" || !categories.has(metadata.category) || typeof metadata.reason !== "string" || !metadata.reason || metadata.reason.length > 1000 || /[\u0000-\u001f\u007f]/.test(metadata.reason) || typeof metadata.effect_unknown !== "boolean" || typeof metadata.action_hash !== "string" || !hash.test(metadata.action_hash) || typeof metadata.action_json !== "string" || Buffer.byteLength(metadata.action_json, "utf8") > 64 * 1024 || createHash("sha256").update(metadata.action_json, "utf8").digest("hex") !== metadata.action_hash) throw invalid();
  let target: unknown; try { target = JSON.parse(metadata.action_json); } catch { throw invalid(); }
  if (!record(target) || Object.keys(target).sort().join(",") !== "action,args,binding,chat_id,kitty,policy_revision" || target.action !== value.action || target.binding !== expected.binding || target.chat_id !== expected.chatId || target.kitty !== expected.kittyId || target.policy_revision !== expected.revision || canonical(target.args) !== canonical(value.args)) throw invalid();
  let reviewable = true;
  const sanitize = (data: unknown): unknown => {
    if (Array.isArray(data)) return data.map(sanitize);
    if (!record(data)) return data;
    return Object.fromEntries(Object.entries(data).map(([key, item]) => { if (/token|password|authorization|cookie|secret/i.test(key)) { reviewable = false; return [key, "••••"]; } return [key, sanitize(item)]; }));
  };
  const args = sanitize(value.args) as Record<string, unknown>;
  const reasons: Record<string, string> = { input: "Confirma esta acción de ratón o teclado; puede producir cambios en la aplicación abierta.", browser: "Confirma la apertura de esta dirección web.", apps: "Confirma la apertura de esta aplicación local.", command: "La ejecución de este comando necesita tu confirmación.", install: "La instalación de programas necesita tu confirmación.", secret: "Este acceso requiere el flujo de Secretos o tu control manual.", machine: "Confirma este cambio en el estado del computador." };
  return { id: value.id, kittyId: expected.kittyId, chatId: expected.chatId, connector: "lexopen-computer-use", kind: "computer-use", action: value.action, args, summary: actionLabels[value.action], reviewable, at: typeof value.at === "string" ? value.at.slice(0, 80) : "", status: "pending", computerAction: { version: "v1", binding: expected.binding, policyRevision: expected.revision, category: metadata.category as ComputerUseApproval["computerAction"]["category"], reason: reasons[metadata.category], effectUnknown: metadata.effect_unknown, actionHash: metadata.action_hash } };
}
