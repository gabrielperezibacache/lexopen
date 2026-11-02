import { z } from "zod";

export type AudioTranscriptCitation = {
  audioId: string; revision: number | null; reviewStatus: "reviewed" | "unreviewed" | "unknown";
  provider: string | null; model: string | null; verificationBasis: "transcript_text";
};
type PublicationDocument = { extractionJson: string | null; audioPublication: { audioId: string } | null };
export const audioTranscriptNotice = "Cotejo contra la transcripción TXT; no acredita fidelidad al audio ni exactitud de sus marcas de tiempo. Corrobore el pasaje escuchando la grabación.";
const snapshotSchema = z.object({
  method: z.literal("audio-transcript-snapshot"), audioId: z.string().min(1).max(100), revision: z.number().int().positive().max(2_000_000_000),
  reviewStatus: z.enum(["reviewed", "unreviewed"]), provider: z.string().max(100).nullable().optional(), model: z.string().max(120).nullable().optional(),
});
export function formatAudioTranscriptNotice(value: AudioTranscriptCitation): string {
  const review = value.reviewStatus === "reviewed" ? "Esta publicación registra revisión humana." : value.reviewStatus === "unknown" ? "No se pudo determinar la revisión humana de esta publicación." : value.provider === "manual" ? "Publicación manual sin revisión humana confirmada." : "Publicación automática sin revisión humana confirmada.";
  return `${audioTranscriptNotice} ${review}`;
}
/** The immutable publication's metadata is used, never the recording's later review status. */
export function audioPublicationContext(document: PublicationDocument | null | undefined): { audioTranscript?: AudioTranscriptCitation; warnings: string[] } {
  if (!document?.audioPublication) return { warnings: [] };
  const audioId = document.audioPublication.audioId;
  const value: AudioTranscriptCitation = { audioId, revision: null, reviewStatus: "unknown", provider: null, model: null, verificationBasis: "transcript_text" };
  try {
    if (typeof document.extractionJson === "string" && document.extractionJson.length <= 16_384) {
      const parsed = snapshotSchema.safeParse(JSON.parse(document.extractionJson));
      if (parsed.success && parsed.data.audioId === audioId) Object.assign(value, { revision: parsed.data.revision, reviewStatus: parsed.data.reviewStatus, provider: parsed.data.provider ?? null, model: parsed.data.model ?? null });
    }
  } catch { /* A missing or damaged description must never remove the transcript warning. */ }
  return { audioTranscript: value, warnings: [formatAudioTranscriptNotice(value)] };
}
