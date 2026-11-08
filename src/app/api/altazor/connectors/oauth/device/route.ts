import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectorActor, connectorFailure, privateHeaders } from "@/lib/personal-connectors/http";
import { ConnectorError } from "@/lib/personal-connectors/core";
import { localSetupAllowed } from "@/lib/altazor/computer/policy";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { continueEasyOAuth } from "@/lib/altazor/connectors/easy-oauth";

const schema = z.object({ attemptId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/) }).strict();
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const actor = await connectorActor(request, true);
    if (!localSetupAllowed(request)) throw new ConnectorError("local_setup_only", "Complete el ingreso desde LexOpen en su computador.", 403);
    const { attemptId } = await parseKnowledgeBody(request, schema, 1024);
    return NextResponse.json(await continueEasyOAuth(actor, attemptId, new URL(request.headers.get("origin") || "").origin), { headers: privateHeaders });
  } catch (error) { return connectorFailure(error); }
}
