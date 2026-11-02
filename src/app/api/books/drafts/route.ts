import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { bookDraftCreateSchema, createBookDraft, listBookDrafts } from "@/lib/books/drafts";
export async function GET() {
  try { return NextResponse.json(await listBookDrafts(await requireStaff()), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); }
}
export async function POST(req: Request) {
  try { assertCsrf(req); const user = await requireStaff(), result = await createBookDraft(await parseKnowledgeBody(req, bookDraftCreateSchema, 160_000), user); return NextResponse.json(result, { status: result.status === "abstained" || result.reused ? 200 : 201, headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); }
}
