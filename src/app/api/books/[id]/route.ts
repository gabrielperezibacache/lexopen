import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { bookPatchSchema, bookRevisionSchema } from "@/lib/books/ingest";
import { deleteBook, readBook, updateBook } from "@/lib/books/service";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, { params }: Context) { try { const user = await requireStaff(), { id } = await params, sp = new URL(req.url).searchParams; return NextResponse.json(await readBook(id, user, { after: Number(sp.get("after") || 0), ...(sp.has("page") ? { page: Number(sp.get("page")) } : {}) }), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); } }
export async function PATCH(req: Request, { params }: Context) { try { assertCsrf(req); const user = await requireStaff(), { id } = await params; return NextResponse.json(await updateBook(id, await parseKnowledgeBody(req, bookPatchSchema, 20_000), user), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); } }
export async function DELETE(req: Request, { params }: Context) { try { assertCsrf(req); const user = await requireStaff(), { id } = await params; return NextResponse.json(await deleteBook(id, await parseKnowledgeBody(req, bookRevisionSchema, 4096), user), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); } }
