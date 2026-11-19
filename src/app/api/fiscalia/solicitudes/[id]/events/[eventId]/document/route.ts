import { handleRouteError, requireStaff } from "@/lib/api";
import { fiscaliaEvidenceBytes } from "@/lib/fiscalia/detail";
import { downloadResponseHeaders } from "@/lib/security/download";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; eventId: string }> }) {
  try {
    const user = await requireStaff(), { id, eventId } = await params;
    const { bytes, name, mimeType } = await fiscaliaEvidenceBytes(id, eventId, user);
    return new Response(new Uint8Array(bytes), { headers: downloadResponseHeaders(name, mimeType, { attachment: true }) });
  } catch (error) {
    const response = handleRouteError(error);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
