import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { deleteLibraryCollection, libraryRevisionSchema, libraryUpdateSchema, readLibraryCollection, updateLibraryCollection } from "@/lib/knowledge/library";

type Context = { params: Promise<{ id: string }> };
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function GET(_req: Request, context: Context) {
  try { const user = await requireStaff(); const { id } = await context.params; return NextResponse.json(await readLibraryCollection(id, user), { headers }); }
  catch (error) { return handleRouteError(error); }
}
export async function PATCH(req: Request, context: Context) {
  try { assertCsrf(req); const user = await requireStaff(); const { id } = await context.params; return NextResponse.json(await updateLibraryCollection(id, await parseKnowledgeBody(req, libraryUpdateSchema, 20000), user), { headers }); }
  catch (error) { return handleRouteError(error); }
}
export async function DELETE(req: Request, context: Context) {
  try { assertCsrf(req); const user = await requireStaff(); const { id } = await context.params; return NextResponse.json(await deleteLibraryCollection(id, await parseKnowledgeBody(req, libraryRevisionSchema, 4096), user), { headers }); }
  catch (error) { return handleRouteError(error); }
}
