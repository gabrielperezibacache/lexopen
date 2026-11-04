import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { rateLimitAsync } from "@/lib/auth/rate-limit";
import { createMemoryNodeSchema, memoryScopeSchema } from "@/lib/altazor/memory-types";
import { createAltazorMemoryNode, readAltazorMemory } from "@/lib/altazor/memory";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) { try { const user = await requireStaff(), input = memoryScopeSchema.parse({ causaId: new URL(request.url).searchParams.get("causaId") || null }); return NextResponse.json(await readAltazorMemory(user, input), { headers }); } catch (error) { return handleRouteError(error); } }
export async function POST(request: Request) { try { assertCsrf(request); const user = await requireStaff(); if (!(await rateLimitAsync(`altazor-memory:${user.id}`, 30, 60_000)).ok) return NextResponse.json({ error: "Espera un momento antes de guardar otro recuerdo" }, { status: 429, headers }); return NextResponse.json(await createAltazorMemoryNode(user, await parseKnowledgeBody(request, createMemoryNodeSchema, 32_000)), { status: 201, headers }); } catch (error) { return handleRouteError(error); } }
