import { NextRequest, NextResponse } from "next/server";
import { deleteSecretSchema, rotateSecretSchema, secretIdSchema } from "@/lib/altazor/secrets/policy";
import { readSecretBody, secretActor, secretFailure, secretHeaders } from "@/lib/altazor/secrets/http";
import { deleteSecret, getSecret, rotateSecret } from "@/lib/altazor/secrets/service";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) {
  try { const actor = await secretActor(request), id = secretIdSchema.parse((await context.params).id); return NextResponse.json({ secret: await getSecret(actor, id) }, { headers: secretHeaders }); }
  catch (error) { return secretFailure(error); }
}
export async function PATCH(request: NextRequest, context: Context) {
  try { const actor = await secretActor(request, true), id = secretIdSchema.parse((await context.params).id), body = await readSecretBody(request, rotateSecretSchema); return NextResponse.json(await rotateSecret(actor, id, body), { headers: secretHeaders }); }
  catch (error) { return secretFailure(error); }
}
export async function DELETE(request: NextRequest, context: Context) {
  try { const actor = await secretActor(request, true), id = secretIdSchema.parse((await context.params).id), body = await readSecretBody(request, deleteSecretSchema); return NextResponse.json(await deleteSecret(actor, id, body), { headers: secretHeaders }); }
  catch (error) { return secretFailure(error); }
}
