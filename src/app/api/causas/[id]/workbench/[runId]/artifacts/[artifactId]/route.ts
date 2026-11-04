import { requireStaff } from "@/lib/api";
import { workbenchRunId } from "@/lib/workbench/schemas";
import { readWorkbenchArtifact } from "@/lib/workbench/service";
import { workbenchError, workbenchHeaders } from "@/lib/workbench/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; runId: string; artifactId: string }> };
export async function GET(_req: Request, { params }: Context) {
  try { const { id, runId, artifactId } = await params; const artifact = await readWorkbenchArtifact(id, workbenchRunId.parse(runId), workbenchRunId.parse(artifactId), await requireStaff()); return new Response(new Uint8Array(artifact.data), { headers: { ...workbenchHeaders, "Content-Type": artifact.mimeType, "Content-Disposition": `attachment; filename="${artifact.name}"`, "Content-Length": String(artifact.size), "Content-Security-Policy": "default-src 'none'; sandbox" } }); } catch (error) { return workbenchError(error); }
}
