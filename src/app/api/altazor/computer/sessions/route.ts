import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { computerActor, computerFailure, privateHeaders, requestIdSchema } from "@/lib/altazor/computer/http";
import { createComputerSession } from "@/lib/altazor/computer/service";
const schema = z.object({ workspaceId: z.string().min(1).max(100), requestId: requestIdSchema, confirmed: z.literal(true), connectors: z.array(z.string().regex(/^[a-z][a-z0-9-]{0,79}$/)).max(48).default([]) }).strict();
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try { const actor = await computerActor(request, true), body = await parseKnowledgeBody(request, schema, 8192); return NextResponse.json({ session: await createComputerSession(actor, body.workspaceId, body.requestId, body.connectors) }, { headers: privateHeaders }); }
  catch (error) { return computerFailure(error); }
}
