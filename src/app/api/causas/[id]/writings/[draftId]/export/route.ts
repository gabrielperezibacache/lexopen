import { z } from "zod";
import { requireStaff } from "@/lib/api";
import { exportCaseWriting } from "@/lib/writings/export";
import { writingHeaders, writingRouteError } from "../../route-error";
type Context = { params: Promise<{ id: string; draftId: string }> };
export async function GET(req: Request, { params }: Context) {
  try {
    const user = await requireStaff(), { id, draftId } = await params;
    const format = z.enum(["markdown", "text"]).parse(new URL(req.url).searchParams.get("format") || "markdown");
    const output = await exportCaseWriting(id, draftId, format, user);
    return new Response(output.content, { headers: { ...writingHeaders, "Content-Type": output.contentType, "Content-Disposition": `attachment; filename="${output.filename}"` } });
  } catch (error) { return writingRouteError(error); }
}
