import { requireStaff } from "@/lib/api";
import { exportHearingLive } from "@/lib/hearings/live-export";
import { liveHeaders, liveRouteError, type LiveContext } from "../route-helper";
export async function GET(_request: Request, { params }: LiveContext) { try { const actor = await requireStaff(), { id, workspaceId } = await params; const output = await exportHearingLive(id, workspaceId, actor); return new Response(output.text, { headers: { ...liveHeaders, "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${output.name}"` } }); } catch (error) { return liveRouteError(error); } }
