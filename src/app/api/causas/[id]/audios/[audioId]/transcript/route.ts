import { handleRouteError, httpError, requireStaff } from "@/lib/api";
import { readCaseAudio, transcriptTextFile } from "@/lib/audio/service";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string; audioId: string }> }) {
  try {
    const user = await requireStaff(), { id, audioId } = await context.params, { audio } = await readCaseAudio(id, audioId, user);
    if (!audio.transcriptText) throw httpError("No hay transcripción disponible", 409);
    if (new URL(request.url).searchParams.get("format") === "vtt") {
      const stamp = (ms: number) => `${Math.floor(ms / 3600000).toString().padStart(2, "0")}:${Math.floor(ms % 3600000 / 60000).toString().padStart(2, "0")}:${(Math.floor(ms % 60000 / 1000)).toString().padStart(2, "0")}.${Math.round(ms % 1000).toString().padStart(3, "0")}`;
      const plain = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replace(/\r?\n/g, " ");
      const vtt = `WEBVTT\n\nNOTE Transcripción ${audio.reviewStatus === "reviewed" ? "con revisión humana registrada" : "sin revisión confirmada"}; corroborar escuchando el audio.\n\n${(audio.segments || []).map((s, i) => `${i + 1}\n${stamp(s.startMs)} --> ${stamp(s.endMs)}\n${plain(s.text)}\n`).join("\n")}`;
      return new Response(vtt, { headers: { "Content-Type": "text/vtt; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    }
    const text = transcriptTextFile({ ...audio, transcriptText: audio.transcriptText, segments: audio.segments || [] });
    const filename = encodeURIComponent(`transcripcion-${audio.id}-v${audio.revision}.txt`);
    return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return handleRouteError(error); }
}
