import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { updateMemorySchema } from "@/lib/altazor/memory-types";
import { updateAltazorMemory } from "@/lib/altazor/memory";
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, { params }: Context) { try { assertCsrf(request); const user = await requireStaff(), { id } = await params; return NextResponse.json(await updateAltazorMemory(user, id, await parseKnowledgeBody(request, updateMemorySchema, 8000)), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); } }
