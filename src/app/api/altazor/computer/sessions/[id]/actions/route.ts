import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { computerActor, computerFailure, privateHeaders, requestIdSchema } from "@/lib/altazor/computer/http";
import { inputSchema } from "@/lib/altazor/computer/policy";
import { cancelComputerTask, closeComputerSession, controlComputer, inputComputer, decideComputerApproval } from "@/lib/altazor/computer/service";
const common = { requestId: requestIdSchema, confirmed: z.literal(true) };
const schema = z.discriminatedUnion("action", [
  z.object({ ...common, action: z.literal("control"), hold: z.boolean() }).strict(),
  z.object({ ...common, action: z.literal("input"), input: inputSchema }).strict(),
  z.object({ ...common, action: z.literal("cancel") }).strict(),
  z.object({ ...common, action: z.literal("close") }).strict(),
  z.object({ ...common, action: z.literal("connector_approval"), approvalId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/), approve: z.boolean() }).strict(),
]);
export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await computerActor(request, true), { id } = await context.params, body = await parseKnowledgeBody(request, schema, 12 * 1024);
    const action = body.action === "control" ? await controlComputer(actor, id, body.requestId, body.hold) : body.action === "input" ? await inputComputer(actor, id, body.requestId, body.input) : body.action === "cancel" ? await cancelComputerTask(actor, id, body.requestId) : body.action === "connector_approval" ? await decideComputerApproval(actor, id, body.requestId, body.approvalId, body.approve) : await closeComputerSession(actor, id, body.requestId);
    return NextResponse.json({ action }, { headers: privateHeaders });
  } catch (error) { return computerFailure(error); }
}
