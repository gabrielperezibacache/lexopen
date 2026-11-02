import { handleRouteError, requireStaff } from "@/lib/api";
import { audioOriginalResponse } from "@/lib/audio/http";
import { readCaseAudioOriginal } from "@/lib/audio/service";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; audioId: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const user = await requireStaff(), { id, audioId } = await context.params, { audio, bytes } = await readCaseAudioOriginal(id, audioId, user);
    return audioOriginalResponse(audio, bytes, request.headers.get("range"), new URL(request.url).searchParams.get("download") === "1");
  } catch (error) { return handleRouteError(error); }
}
