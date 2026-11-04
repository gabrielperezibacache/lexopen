import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { createMemoryEdgeSchema } from "@/lib/altazor/memory-types";
import { createAltazorMemoryEdge } from "@/lib/altazor/memory";
export async function POST(request: Request) { try { assertCsrf(request); const user = await requireStaff(); return NextResponse.json(await createAltazorMemoryEdge(user, await parseKnowledgeBody(request, createMemoryEdgeSchema, 32_000)), { status: 201, headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); } }
