import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectorActor, connectorFailure, privateHeaders } from "@/lib/personal-connectors/http";
import { ConnectorError } from "@/lib/personal-connectors/core";
import { localSetupAllowed } from "@/lib/altazor/computer/policy";
import { requestIdSchema } from "@/lib/altazor/computer/http";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { startEasyOAuth } from "@/lib/altazor/connectors/easy-oauth";
import { EASY_OAUTH_PROVIDERS } from "@/lib/altazor/connectors/easy-oauth-providers";
const schema = z.object({ workspaceId: z.string().min(1).max(100), provider: z.enum(EASY_OAUTH_PROVIDERS), access: z.enum(["basic", "files"]).optional(), requestId: requestIdSchema, confirmed: z.literal(true) }).strict();
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const actor = await connectorActor(request, true);
    if (!localSetupAllowed(request)) throw new ConnectorError("local_setup_only", "Conecte esta aplicación desde LexOpen en el equipo local del profesional.", 403);
    const body = await parseKnowledgeBody(request, schema, 2048), origin = new URL(request.headers.get("origin") || "").origin;
    return NextResponse.json(await startEasyOAuth(actor, body, origin), { headers: privateHeaders });
  } catch (error) { return connectorFailure(error); }
}
