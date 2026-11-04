import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { computerActor, computerFailure, privateHeaders, requestIdSchema } from "@/lib/altazor/computer/http";
import { createComputerSession } from "@/lib/altazor/computer/service";
const schema = z.object({ workspaceId: z.string().min(1).max(100), requestId: requestIdSchema, confirmed: z.literal(true) }).strict();
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try { const actor = await computerActor(request, true), body = await parseKnowledgeBody(request, schema, 2048); return NextResponse.json({ session: await createComputerSession(actor, body.workspaceId, body.requestId) }, { headers: privateHeaders }); }
  catch (error) { return computerFailure(error); }
}
