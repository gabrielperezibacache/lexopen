import type { HearingNoteView } from "./types";
export type HearingLivePhase = "idle" | "running" | "paused" | "finished";
export type HearingLiveKind = "observation" | "objection" | "decision" | "commitment";
export type HearingLivePlan = { opening: string; closing: string; noteIds: string[]; noteRevisions: Record<string, number>; addressedNoteIds: string[]; activeNoteId: string | null };
export type HearingLiveEntry = { id: string; available: false } | (Extract<HearingNoteView, { available: true }> & { kind: HearingLiveKind; elapsedSeconds: number; createdAt: string });
export type HearingLiveView = {
  workspaceId: string; workspaceRevision: number; workspaceStatus: "preparation" | "live" | "closed"; revision: number; phase: HearingLivePhase;
  elapsedSeconds: number; runningSince: string | null; startedAt: string | null; endedAt: string | null; serverNow: string;
  plan: HearingLivePlan; changedNoteIds: string[]; notes: HearingNoteView[]; entries: HearingLiveEntry[]; nextBefore: string | null;
  canWrite: boolean; limited: boolean; warnings: string[];
};
export type HearingLiveMutation = { live: HearingLiveView; reused: boolean; note?: HearingNoteView };
