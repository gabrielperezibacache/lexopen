import { handleRouteError, requireStaff } from "@/lib/api";
import { altazorId } from "@/lib/altazor/schemas";
import { attachmentFor } from "@/lib/altazor/attachments";
export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) { try { const user = await requireStaff(); const { id, attachmentId } = await params; const { row } = await attachmentFor(altazorId.parse(id), altazorId.parse(attachmentId), user); return new Response(new Uint8Array(row.originalData!), { headers: { "Cache-Control": "private, no-store", "Content-Type": row.mimeType, "X-Content-Type-Options": "nosniff", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.sourceName)}` } }); } catch (error) { return handleRouteError(error); } }
