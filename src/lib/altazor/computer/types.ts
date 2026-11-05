export type ComputerScope = { causaId?: string | null };
export type ComputerStatus = {
  enabled: boolean; configured: boolean; policyAllowed: boolean; canConfigure: boolean; state: "disabled" | "unconfigured" | "configured" | "error";
  workspaceId: string | null; provider: string | null; version: string | null; lastVerifiedAt: string | null; reason: string | null;
  runtime: "container"; sessions: ComputerSessionSummary[];
};
export type ComputerSessionSummary = { id: string; state: string; expiresAt: string; held: boolean; createdAt: string; connectors: string[] };
export type ComputerTurn = { index: number; from: "user" | "assistant" | "system"; text: string; working: boolean; needsHelp: boolean; steps: { action: string; at: string }[] };
export type ComputerSessionView = { session: ComputerSessionSummary; runtime: "container"; kittyStatus: string; working: boolean; turns: ComputerTurn[]; approvals: import("../connectors/types").ConnectorApproval[] };
export type ComputerFile = { name: string; mime: string; data: string };
export type ComputerMessage = { requestId: string; text: string; files: ComputerFile[]; confirmed: true };
