import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { altazorId, patchConversationSchema } from "@/lib/altazor/schemas";
import { patchAltazorConversation, readAltazorConversation } from "@/lib/altazor/conversations";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) { try { const { id } = await params; const raw = new URL(request.url).searchParams.get("beforeOrdinal"); const beforeOrdinal = raw === null ? undefined : z.coerce.number().int().positive().parse(raw); return NextResponse.json(await readAltazorConversation(altazorId.parse(id), await requireStaff(), undefined, { beforeOrdinal }), { headers }); } catch (error) { return handleRouteError(error); } }
export async function PATCH(request: Request, { params }: Context) { try { assertCsrf(request); const { id } = await params; return NextResponse.json(await patchAltazorConversation(altazorId.parse(id), await parseKnowledgeBody(request, patchConversationSchema, 16_384), await requireStaff()), { headers }); } catch (error) { return handleRouteError(error); } }
