import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { connectorActor, connectorFailure, privateHeaders } from "@/lib/personal-connectors/http";
import { ConnectorError } from "@/lib/personal-connectors/core";
import { canSome } from "@/lib/auth/permissions";
import { localSetupAllowed } from "@/lib/altazor/computer/policy";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { easyOAuthSetupStatus, saveEasyOAuthSetup, nativeOAuthActor } from "@/lib/altazor/connectors/easy-oauth";
import { EASY_OAUTH_PROVIDERS } from "@/lib/altazor/connectors/easy-oauth-providers";
const schema = z.object({ provider: z.enum(EASY_OAUTH_PROVIDERS), clientId: z.string().trim().min(1).max(1000), clientSecret: z.string().trim().max(4000).default(""), publicClient: z.boolean().optional(), confirmed: z.literal(true) }).strict();
export const runtime = "nodejs";
async function admin(request: NextRequest, mutation = false) {
  const actor = await connectorActor(request, mutation), user = await nativeOAuthActor(actor);
  if (!canSome(user, "host.admin") || !localSetupAllowed(request)) throw new ConnectorError("oauth_setup_forbidden", "La preparación se realiza una sola vez por el administrador desde el equipo local.", 403);
  return actor;
}
export async function GET(request: NextRequest) {
  try { await admin(request); const verifiedOrigin = new URL(`${request.nextUrl.protocol}//${request.headers.get("host") || request.nextUrl.host}`).origin; return NextResponse.json(await easyOAuthSetupStatus({}, verifiedOrigin), { headers: privateHeaders }); }
  catch (error) { return connectorFailure(error); }
}
export async function PUT(request: NextRequest) {
  try { const actor = await admin(request, true), body = await parseKnowledgeBody(request, schema, 8192), origin = new URL(request.headers.get("origin") || "").origin; return NextResponse.json(await saveEasyOAuthSetup(actor, { ...body, clientSecret: body.clientSecret ?? "" }, origin), { headers: privateHeaders }); }
  catch (error) { return connectorFailure(error); }
}
