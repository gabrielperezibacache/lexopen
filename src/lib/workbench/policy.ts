import { sha256 } from "@/lib/evidence/fragments";
import { getAssistantFirmPolicy } from "@/lib/assistant/firm-policy";
import { getLlmConfig, llmEndpointHash } from "@/lib/integrations/llm";
import { personalCodexPreference } from "@/lib/integrations/codex-preference";
import { codexDestinationFor } from "@/lib/integrations/codex-destination";
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
  const codex = preference.enabled ? await codexDestinationFor(userId, preference) : null;
  const value = { mode, provider: codex ? "codex" : config.preset, model: codex ? preference.model : config.model, endpoint: codex?.endpoint ?? endpoint, endpointHash: codex?.endpointHash ?? llmEndpointHash(config), remote: Boolean(codex) || remote, permitted: (policy.assistantLlmMode !== "local_only" || !codex && !remote) && (codex ? codex.permitted : Boolean(config.model)) };
  return { ...value, key: sha256(JSON.stringify(value)) };
}
