import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { computerFailure, privateHeaders } from "@/lib/altazor/computer/http";
import { connectorActor, connectorRequest } from "@/lib/altazor/connectors/http";
import { beginConnectorOAuth } from "@/lib/altazor/connectors/service";
const schema = z.object(connectorRequest).strict();
export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ name: string }> }) {
  try {
    const actor = await connectorActor(request, true), { name } = await context.params, body = await parseKnowledgeBody(request, schema, 2048);
    return NextResponse.json(await beginConnectorOAuth(actor, body.workspaceId, body.requestId, name), { headers: privateHeaders });
  } catch (error) { return computerFailure(error); }
}
