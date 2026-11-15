/** Safe historical metadata only; never paths, file contents, tokens or raw gateway results. */
export type FileHistoryItem = {
  id: string; at: string; connector: string; kind: "google-workspace" | "github" | "dropbox";
  name: string; status: "confirmed" | "failed" | "unknown"; bytes?: number; pages?: number;
};
export type FileHistoryPage = { items: FileHistoryItem[]; connectors: string[]; nextCursor: string | null };
