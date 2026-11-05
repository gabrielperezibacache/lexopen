import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { computerActor, privateHeaders, requestIdSchema } from "@/lib/altazor/computer/http";
import { prepareComputerSecret, typeComputerSecret, cancelComputerSecret } from "@/lib/altazor/computer/service";
import { secretIdSchema } from "@/lib/altazor/secrets/policy";
import { secretFailure } from "@/lib/altazor/secrets/http";
const target = z.object({ sessionId: secretIdSchema, origin: z.string().max(300), field: z.enum(["password", "token", "text"]), fieldLabel: z.string().trim().min(1).max(120) }).strict();
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare"), requestId: requestIdSchema, secretId: secretIdSchema, revision: z.number().int().min(1), target, confirmed: z.literal(true) }).strict(),
  z.object({ action: z.literal("type"), grantId: secretIdSchema, target, confirmed: z.literal(true) }).strict(),
  z.object({ action: z.literal("cancel"), grantId: secretIdSchema, confirmed: z.literal(true) }).strict(),
]);
export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await computerActor(request, true), { id } = await context.params, body = await parseKnowledgeBody(request, schema, 4096);
    const result = body.action === "prepare" ? await prepareComputerSecret(actor, id, body) : body.action === "type" ? await typeComputerSecret(actor, id, body) : await cancelComputerSecret(actor, id, body.grantId);
    return NextResponse.json({ use: result }, { headers: privateHeaders });
  } catch (error) { return secretFailure(error); }
}
