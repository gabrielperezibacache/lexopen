import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { bookRevisionSchema } from "@/lib/books/ingest";
import { collectionPatchSchema, deleteBookCollection, readBookCollection, updateBookCollection } from "@/lib/books/service";
type Context = { params: Promise<{ id: string }> };
export async function GET(_req: Request, { params }: Context) { try { const user = await requireStaff(), { id } = await params; return NextResponse.json(await readBookCollection(id, user), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); } }
export async function PATCH(req: Request, { params }: Context) { try { assertCsrf(req); const user = await requireStaff(), { id } = await params; return NextResponse.json(await updateBookCollection(id, await parseKnowledgeBody(req, collectionPatchSchema, 40_000), user), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); } }
export async function DELETE(req: Request, { params }: Context) { try { assertCsrf(req); const user = await requireStaff(), { id } = await params; return NextResponse.json(await deleteBookCollection(id, await parseKnowledgeBody(req, bookRevisionSchema, 4096), user), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); } }
