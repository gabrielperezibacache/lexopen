"use client";

import { useAgenteCopilot } from "@/components/agente/useAgenteCopilot";
import { AgenteCopilotView } from "@/components/agente/AgenteCopilotView";

export function AgenteInner() {
  const copilot = useAgenteCopilot();
  return <AgenteCopilotView {...copilot} />;
}
