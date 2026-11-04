import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { createConversationSchema } from "@/lib/altazor/schemas";
import { createAltazorConversation, listAltazorConversations } from "@/lib/altazor/conversations";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store" };
export async function GET() { try { return NextResponse.json(await listAltazorConversations(await requireStaff()), { headers }); } catch (error) { return handleRouteError(error); } }
export async function POST(request: Request) { try { assertCsrf(request); const user = await requireStaff(); const result = await createAltazorConversation(await parseKnowledgeBody(request, createConversationSchema, 16_384), user); return NextResponse.json(result, { status: result.reused ? 200 : 201, headers }); } catch (error) { return handleRouteError(error); } }
