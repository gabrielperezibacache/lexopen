import { requireStaff, handleRouteError } from "@/lib/api";
import { httpError } from "@/lib/auth/access";
import { exportBookDraft } from "@/lib/books/drafts";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, { params }: Context) {
  try {
    const user = await requireStaff(), format = new URL(req.url).searchParams.get("format") || "md";
    if (format !== "md" && format !== "txt") throw httpError("Elija formato md o txt", 400);
    const exported = await exportBookDraft((await params).id, format, user);
    return new Response(exported.content, { headers: { "Content-Type": exported.mimeType, "Content-Disposition": `attachment; filename="${exported.filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return handleRouteError(error); }
}
