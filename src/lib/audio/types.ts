export type AudioSegment = { startMs: number; endMs: number; text: string; speaker?: string };
export type CaseAudioView = {
  id: string; causaId: string; sourceDocumentId: string; transcriptDocumentId: string | null;
  title: string; sourceName: string; mimeType: string; sizeBytes: number; sourceSha256: string;
  durationMs: number | null; status: string; reviewStatus: string; revision: number;
  provider: string | null; model: string | null; lastError: string | null; createdAt: string; updatedAt: string;
  transcriptText?: string; segments?: AudioSegment[]; transcriptSha256?: string | null;
};
export type AudioRevisionView = { id: string; revision: number; text: string; segments: AudioSegment[]; textSha256: string; reviewStatus: string; actorName: string; provider: string | null; model: string | null; createdAt: string };
export type CaseAudioDetail = { audio: CaseAudioView; history: AudioRevisionView[]; canWrite: boolean; canConfigure: boolean };
export type TranscriptionConfigView = { enabled: boolean; preset: "openai" | "local"; apiUrl: string; model: string; responseFormat: "json" | "verbose_json"; hasApiKey: boolean; localOnly: boolean };
