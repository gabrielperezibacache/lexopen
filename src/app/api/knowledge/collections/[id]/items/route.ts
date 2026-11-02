import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { addLibraryItem, libraryItemSchema } from "@/lib/knowledge/library";
export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(req); const user = await requireStaff(); const { id } = await context.params;
    const result = await addLibraryItem(id, await parseKnowledgeBody(req, libraryItemSchema, 60000), user);
    return NextResponse.json(result, { status: result.reused ? 200 : 201, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
  } catch (error) { return handleRouteError(error); }
}
