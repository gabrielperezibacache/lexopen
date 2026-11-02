import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { libraryRevisionSchema, removeLibraryItem } from "@/lib/knowledge/library";
export async function DELETE(req: Request, context: { params: Promise<{ id: string; itemId: string }> }) {
  try { assertCsrf(req); const user = await requireStaff(); const { id, itemId } = await context.params; return NextResponse.json(await removeLibraryItem(id, itemId, await parseKnowledgeBody(req, libraryRevisionSchema, 4096), user), { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } }); }
  catch (error) { return handleRouteError(error); }
}
