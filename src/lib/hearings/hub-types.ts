export type AudienceHubStatus = "active" | "closed" | "all";
export type AudienceHubCause = { id: string; titulo: string; rit: string | null; tribunal: string; canWrite: boolean };
export type AudienceHubWorkspace = {
  id: string;
  title: string;
  status: "preparation" | "live" | "closed";
  scheduledFor: string | null;
  updatedAt: string;
  livePhase: "idle" | "running" | "paused" | "finished";
  causa: Omit<AudienceHubCause, "canWrite">;
};
export type AudienceHubCatalog = {
  workspaces: AudienceHubWorkspace[];
  causas: AudienceHubCause[];
  nextAfter: string | null;
  limited: { workspaces: boolean; causas: boolean };
};
