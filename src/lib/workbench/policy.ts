import { sha256 } from "@/lib/evidence/fragments";
import { getAssistantFirmPolicy } from "@/lib/assistant/firm-policy";
import { getLlmConfig } from "@/lib/integrations/llm";
import { personalCodexPreference } from "@/lib/integrations/codex-preference";
import type { WorkbenchMode } from "./schemas";
export type WorkbenchDestination = { mode: WorkbenchMode; provider: string; model: string; endpoint: string; endpointHash: string; remote: boolean; permitted: boolean; key: string };
export async function workbenchDestination(userId: string, mode: WorkbenchMode): Promise<WorkbenchDestination> {
  if (mode === "source_packet") {
    const value = { mode, provider: "local_recipe", model: "none", endpoint: "Contenedor local sin red", endpointHash: sha256("none"), remote: false, permitted: true };
    return { ...value, key: sha256(JSON.stringify(value)) };
  }
  const [config, preference, policy] = await Promise.all([getLlmConfig(), personalCodexPreference(userId), getAssistantFirmPolicy()]);
  let endpoint = "Proveedor no configurado", remote = true;
  try { const url = new URL(config.apiUrl); endpoint = url.origin + url.pathname; remote = !["localhost", "127.0.0.1", "[::1]", "::1"].includes(url.hostname); } catch { /* Keep the unavailable destination explicit. */ }
  const value = { mode, provider: preference.enabled ? "codex" : config.preset, model: preference.enabled ? preference.model || "" : config.model, endpoint: preference.enabled ? "OpenAI · Codex personal" : endpoint, endpointHash: sha256(preference.enabled ? "codex" : config.apiUrl), remote: preference.enabled || remote, permitted: (policy.assistantLlmMode !== "local_only" || !preference.enabled && !remote) && Boolean(preference.enabled ? preference.model : config.model) };
  return { ...value, key: sha256(JSON.stringify(value)) };
}
