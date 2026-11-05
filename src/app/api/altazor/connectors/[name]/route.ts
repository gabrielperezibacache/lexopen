import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { computerFailure, privateHeaders } from "@/lib/altazor/computer/http";
import { connectorActor, connectorRequest } from "@/lib/altazor/connectors/http";
import { connectorConfigurationSchema, validateConnectorConfiguration } from "@/lib/altazor/connectors/policy";
import { configureConnector, removeConnector } from "@/lib/altazor/connectors/service";
const put = z.object({ ...connectorRequest, configuration: connectorConfigurationSchema }).strict();
const remove = z.object(connectorRequest).strict();
export const runtime = "nodejs";
export async function PUT(request: NextRequest, context: { params: Promise<{ name: string }> }) {
  try {
    const actor = await connectorActor(request, true), { name } = await context.params, body = await parseKnowledgeBody(request, put, 32 * 1024);
    return NextResponse.json(await configureConnector(actor, body.workspaceId, body.requestId, name, validateConnectorConfiguration(body.configuration)), { headers: privateHeaders });
  } catch (error) { return computerFailure(error); }
}
export async function DELETE(request: NextRequest, context: { params: Promise<{ name: string }> }) {
  try {
    const actor = await connectorActor(request, true), { name } = await context.params, body = await parseKnowledgeBody(request, remove, 2048);
    return NextResponse.json(await removeConnector(actor, body.workspaceId, body.requestId, name), { headers: privateHeaders });
  } catch (error) { return computerFailure(error); }
}
