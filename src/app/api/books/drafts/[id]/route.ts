import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { bookDraftUpdateSchema, readBookDraft, updateBookDraft } from "@/lib/books/drafts";
type Context = { params: Promise<{ id: string }> };
export async function GET(_req: Request, { params }: Context) {
  try { return NextResponse.json(await readBookDraft((await params).id, await requireStaff()), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); }
}
export async function PATCH(req: Request, { params }: Context) {
  try { assertCsrf(req); const user = await requireStaff(), input = await parseKnowledgeBody(req, bookDraftUpdateSchema, 200_000); return NextResponse.json(await updateBookDraft((await params).id, input, user), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); }
}
