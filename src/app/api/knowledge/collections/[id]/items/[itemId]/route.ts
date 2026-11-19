import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { checkLibraryPublicCitation, libraryRevisionSchema, removeLibraryItem } from "@/lib/knowledge/library";
export async function DELETE(req: Request, context: { params: Promise<{ id: string; itemId: string }> }) {
  try { assertCsrf(req); const user = await requireStaff(); const { id, itemId } = await context.params; return NextResponse.json(await removeLibraryItem(id, itemId, await parseKnowledgeBody(req, libraryRevisionSchema, 4096), user), { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } }); }
  catch (error) { return handleRouteError(error); }
}

export async function GET(_req: Request, context: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const user = await requireStaff();
    const { id, itemId } = await context.params;
    const result = await checkLibraryPublicCitation(id, itemId, user);
    return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
  } catch (error) { return handleRouteError(error); }
}
