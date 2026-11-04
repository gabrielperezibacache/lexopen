import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { ConnectorError } from "@/lib/personal-connectors/core";
import { computerActor, computerFailure, privateHeaders } from "@/lib/altazor/computer/http";
import { localSetupAllowed } from "@/lib/altazor/computer/policy";
import { computerStatus, configureComputer, disableComputer, verifyComputer } from "@/lib/altazor/computer/service";
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("configure"), causaId: z.string().max(100).nullable().optional(), endpoint: z.string().max(200), token: z.string().min(16).max(16000), provider: z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/), dedicated: z.literal(true) }).strict(),
  z.object({ action: z.literal("verify"), workspaceId: z.string().min(1).max(100), confirmed: z.literal(true) }).strict(),
  z.object({ action: z.literal("disable"), workspaceId: z.string().min(1).max(100), confirmed: z.literal(true) }).strict(),
]);
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try { const actor = await computerActor(request), causaId = request.nextUrl.searchParams.get("causaId"); if (causaId && causaId.length > 100) throw new ConnectorError("scope_invalid", "Ámbito inválido."); return NextResponse.json({ computer: await computerStatus(actor, causaId, localSetupAllowed(request)) }, { headers: privateHeaders }); }
  catch (error) { return computerFailure(error); }
}
export async function POST(request: NextRequest) {
  try {
    const actor = await computerActor(request, true), body = await parseKnowledgeBody(request, schema, 24 * 1024);
    if (body.action === "configure") {
      if (!localSetupAllowed(request)) throw new ConnectorError("local_setup_only", "Configure el gateway desde una sesión local del Host, con su servidor escuchando sólo en loopback. Un navegador remoto no puede configurar direcciones del Host.", 403);
      return NextResponse.json({ computer: await configureComputer(actor, body) }, { headers: privateHeaders });
    }
    return NextResponse.json({ computer: body.action === "verify" ? await verifyComputer(actor, body.workspaceId) : await disableComputer(actor, body.workspaceId) }, { headers: privateHeaders });
  } catch (error) { return computerFailure(error); }
}
