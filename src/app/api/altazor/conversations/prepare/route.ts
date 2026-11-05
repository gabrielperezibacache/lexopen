import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { prepareAltazorConversation, prepareConversationSchema } from "@/lib/altazor/prepare-conversation";
import { rateLimitAsync } from "@/lib/auth/rate-limit";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    assertCsrf(request);
    const user = await requireStaff(), limited = await rateLimitAsync(`altazor:prepare:${user.id}`, 60, 60_000);
    if (!limited.ok) return NextResponse.json({ error: "Espera un momento antes de continuar." }, { status: 429 });
    const result = await prepareAltazorConversation(await parseKnowledgeBody(request, prepareConversationSchema, 65_536), user);
    return NextResponse.json(result, { status: "clarify" in result || result.reused ? 200 : 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return handleRouteError(error); }
}
