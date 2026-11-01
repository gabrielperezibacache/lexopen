import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { createBookCollection, listBookCollections } from "@/lib/books/service";
export async function GET() { try { const user = await requireStaff(); return NextResponse.json({ collections: await listBookCollections(user) }, { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); } }
export async function POST(req: Request) { try { assertCsrf(req); const user = await requireStaff(); return NextResponse.json(await createBookCollection(await parseKnowledgeBody(req, z.object({ name: z.string() }).strict(), 4096), user), { status: 201, headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); } }
