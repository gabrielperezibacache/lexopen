export type StoredChatMessage = {
  role?: string;
  content?: string;
  discarded?: boolean;
  source?: string;
};

export type LlmHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

/**
 * Replay persisted AgentChat messages for multi-turn LLM calls.
 * Mirrors Hermes copilot behaviour (skip errors/discarded, cap length).
 */
export function buildChatHistoryForLlm(
  messages: StoredChatMessage[],
  opts?: { maxMessages?: number; maxCharsPerMessage?: number }
): LlmHistoryMessage[] {
  const maxMessages = opts?.maxMessages ?? 12;
  const maxChars = opts?.maxCharsPerMessage ?? 12_000;
  const history: LlmHistoryMessage[] = [];

  for (const m of messages.slice(-16)) {
    if (
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string" &&
      m.content.trim() &&
      !m.discarded &&
      m.source !== "error"
    ) {
      history.push({
        role: m.role,
        content: m.content.slice(0, maxChars),
      });
    }
  }

  if (history.length > maxMessages) {
    history.splice(0, history.length - maxMessages);
  }

  return history;
}
