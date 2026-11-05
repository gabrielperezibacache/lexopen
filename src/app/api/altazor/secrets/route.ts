import { NextRequest, NextResponse } from "next/server";
import { secretsConfigured } from "@/lib/altazor/secrets/crypto";
import { createSecretSchema } from "@/lib/altazor/secrets/policy";
import { readSecretBody, secretActor, secretFailure, secretHeaders } from "@/lib/altazor/secrets/http";
import { createSecret, listSecrets } from "@/lib/altazor/secrets/service";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try { const actor = await secretActor(request); return NextResponse.json({ secrets: await listSecrets(actor), configured: secretsConfigured() }, { headers: secretHeaders }); }
  catch (error) { return secretFailure(error); }
}
export async function POST(request: NextRequest) {
  try { const actor = await secretActor(request, true), body = await readSecretBody(request, createSecretSchema); return NextResponse.json(await createSecret(actor, body), { headers: secretHeaders }); }
  catch (error) { return secretFailure(error); }
}
