import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { computerActor, computerFailure, privateHeaders, requestIdSchema } from "@/lib/altazor/computer/http";
import { localSetupAllowed } from "@/lib/altazor/computer/policy";
import { listComputerAuthorizationWorkspaces, readComputerAuthorization, saveComputerAuthorization } from "@/lib/altazor/computer/authorization-service";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { ConnectorError } from "@/lib/personal-connectors/core";

const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const update = z.object({ workspaceId: identifier, requestId: requestIdSchema, choice: z.unknown() }).strict();
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const actor = await computerActor(request), workspaces = await listComputerAuthorizationWorkspaces(actor);
    const requested = request.nextUrl.searchParams.get("workspaceId");
    if (requested !== null) identifier.parse(requested);
    const workspaceId = requested ?? workspaces.find(v => !v.causaId)?.id ?? workspaces[0]?.id;
    const local = localSetupAllowed(request);
    return NextResponse.json({ workspaces, authorization: workspaceId ? await readComputerAuthorization(actor, workspaceId, local) : null, localConfiguration: local }, { headers: privateHeaders });
  } catch (error) { return computerFailure(error); }
}
export async function PUT(request: NextRequest) {
  try {
    const actor = await computerActor(request, true);
    if (!localSetupAllowed(request)) throw new ConnectorError("computer_policy_host_only", "Cambia las autorizaciones desde la aplicación del equipo principal. El escritorio virtual no puede modificar sus propios permisos.", 403);
    const body = await parseKnowledgeBody(request, update, 12 * 1024);
    return NextResponse.json(await saveComputerAuthorization(actor, body.workspaceId, body.requestId, body.choice), { headers: privateHeaders });
  } catch (error) { return computerFailure(error); }
}
