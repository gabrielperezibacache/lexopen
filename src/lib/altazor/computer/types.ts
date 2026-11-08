export type ComputerScope = { causaId?: string | null };
export type ComputerStatus = {
  enabled: boolean; configured: boolean; policyAllowed: boolean; canConfigure: boolean; state: "disabled" | "unconfigured" | "configured" | "error";
  workspaceId: string | null; provider: string | null; version: string | null; lastVerifiedAt: string | null; reason: string | null;
  runtime: "container"; sessions: ComputerSessionSummary[];
};
export type ComputerSessionSummary = { id: string; state: string; expiresAt: string; renewableUntil: string; canRenew: boolean; requiresStop?: boolean; held: boolean; createdAt: string; connectors: string[] };
export type ComputerTurn = { index: number; from: "user" | "assistant" | "system"; origin?: "connector-result"; text: string; working: boolean; needsHelp: boolean; actionCount?: number; help?: { stepIndex: number; question: string }; steps: { action: string; at: string }[] };
export function computerTurnNeedsHelp(turn?: ComputerTurn) {
  // A live request pauses inside a working turn. The terminal help flag is set
  // separately when a turn finishes without being able to continue.
  return turn?.from === "assistant" && (turn.needsHelp || (turn.working && turn.steps.at(-1)?.action === "ask_help"));
}
export type ComputerUseApproval = { id: string; kittyId: string; chatId: string; connector: "lexopen-computer-use"; kind: "computer-use"; action: string; args: Record<string, unknown>; summary: string; reviewable: boolean; at: string; status: "pending"; computerAction: { version: "v1"; binding: string; policyRevision: number; category: "input" | "browser" | "apps" | "command" | "install" | "secret" | "machine" | "local_read"; reason: string; effectUnknown: boolean; actionHash: string } };
export type ComputerApproval = (import("../connectors/types").ConnectorApproval & { requestId?: string }) | ComputerUseApproval;
export type ComputerAuthorizationSettings = { mode: import("./authorization-policy").ComputerAuthorizationMode; allowInput: boolean; allowBrowser: boolean; allowApps: boolean; maxActions: number; maxConsultations: number };
export type ComputerAuthorizationView = { workspaceId: string; revision: number; desired: ComputerAuthorizationSettings; applied: import("./authorization-policy").ComputerAuthorizationSnapshot | null; sessionId: string | null; state: "default" | "saved" | "applied" | "unknown" | "unsupported" | "mismatch"; canConfigure: boolean; reason?: string };
export type VerifiedComputerFile = { state: "desktop_verified"; requestId: string; approvalId: string; chatId: string; kittyId: string; connector: string; kind: "google-workspace" | "github" | "dropbox"; action: "download_file"; target: Record<string, string>; localPath: string; name: string; bytes: number; sha256: string; pages?: number; firstLine?: string };
export type ComputerSessionView = { session: ComputerSessionSummary; runtime: "container"; kittyStatus: string; working: boolean; turns: ComputerTurn[]; approvals: ComputerApproval[]; verifiedFiles?: VerifiedComputerFile[]; authorization?: ComputerAuthorizationView };
export type ComputerActivityState = "disabled" | "unconfigured" | "restricted" | "idle" | "starting" | "ready" | "working" | "approval" | "help" | "paused" | "expired" | "unavailable";
export type ComputerReview = "approval" | "help";
export type ComputerActivity = { state: ComputerActivityState; sessionId: string | null; monitor: boolean; causaId?: string | null; detail?: { connections: string[]; step: { label: string; at: string } | null }; consultation?: { action: string; reason: string; effectUnknown: boolean }; outcomeUnknown?: boolean; verifiedFiles?: VerifiedComputerFile[] };
export type ComputerFile = { name: string; mime: string; data: string };
export const COMPUTER_ATTACHMENT_FORMATS = ".pdf,.docx,.xlsx,.pptx,.odt,.epub,.txt,.md,.csv,.png,.jpg,.jpeg,.gif,.webp,.mp3,.wav,.m4a,.ogg,.webm,.flac";
export type ComputerMessage = { requestId: string; text: string; files: ComputerFile[]; confirmed: true };
