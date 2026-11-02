import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { createLibraryCollection, libraryCreateSchema, listLibraryCollections } from "@/lib/knowledge/library";

export async function GET() {
  try { return NextResponse.json(await listLibraryCollections(await requireStaff()), { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } }); }
  catch (error) { return handleRouteError(error); }
}
export async function POST(req: Request) {
  try {
    assertCsrf(req); const user = await requireStaff();
    const result = await createLibraryCollection(await parseKnowledgeBody(req, libraryCreateSchema, 20000), user);
    return NextResponse.json(result, { status: result.reused ? 200 : 201, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
  } catch (error) { return handleRouteError(error); }
}
