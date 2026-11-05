import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { computerFailure, privateHeaders } from "@/lib/altazor/computer/http";
import { connectorActor } from "@/lib/altazor/connectors/http";
import { acknowledgeConnectorOperation } from "@/lib/altazor/connectors/service";
const schema = z.object({ workspaceId: z.string().min(1).max(100), confirmed: z.literal(true) }).strict();
export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await connectorActor(request, true), { id } = await context.params, body = await parseKnowledgeBody(request, schema, 2048);
    return NextResponse.json({ connectors: await acknowledgeConnectorOperation(actor, body.workspaceId, id) }, { headers: privateHeaders });
  } catch (error) { return computerFailure(error); }
}
