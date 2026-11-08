import { z } from "zod";
import { requireStaff } from "@/lib/api";
import { exportCaseWriting, exportCaseWritingDocx } from "@/lib/writings/export";
import { writingHeaders, writingRouteError } from "../../route-error";
type Context = { params: Promise<{ id: string; draftId: string }> };
export async function GET(req: Request, { params }: Context) {
  try {
    const user = await requireStaff(), { id, draftId } = await params;
    const paramsUrl = new URL(req.url).searchParams;
    const purpose = z.enum(["draft", "approved"]).parse(paramsUrl.get("purpose") || "draft");
    const expectedRevision = paramsUrl.has("revision") ? z.coerce.number().int().positive().parse(paramsUrl.get("revision")) : undefined;
    const options = { purpose, expectedRevision };
    const format = z.enum(["markdown", "text", "docx"]).parse(paramsUrl.get("format") || "markdown");
    if (format === "docx") {
      const output = await exportCaseWritingDocx(id, draftId, user, undefined, options);
      return new Response(Uint8Array.from(output.content), { headers: { ...writingHeaders, "Content-Type": output.contentType, "X-LexOpen-Export-Receipt": output.receiptId, "Content-Disposition": `attachment; filename="${output.filename}"` } });
    }
    const output = await exportCaseWriting(id, draftId, format, user, undefined, options);
    return new Response(output.content, { headers: { ...writingHeaders, "Content-Type": output.contentType, "X-LexOpen-Export-Receipt": output.receiptId, "Content-Disposition": `attachment; filename="${output.filename}"` } });
  } catch (error) { return writingRouteError(error); }
}
