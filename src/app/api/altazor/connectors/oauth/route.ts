import { NextRequest, NextResponse } from "next/server";
import { connectorActor, connectorFailure, privateHeaders } from "@/lib/personal-connectors/http";
import { ConnectorError } from "@/lib/personal-connectors/core";
import { easyOAuthStatus } from "@/lib/altazor/connectors/easy-oauth";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const actor = await connectorActor(request), workspaceId = request.nextUrl.searchParams.get("workspaceId"), attemptId = request.nextUrl.searchParams.get("attemptId");
    if (!workspaceId || !/^[A-Za-z0-9_-]{1,100}$/.test(workspaceId) || attemptId !== null && !/^[A-Za-z0-9_-]{1,100}$/.test(attemptId)) throw new ConnectorError("oauth_scope_invalid", "Seleccione un espacio válido.");
    return NextResponse.json(await easyOAuthStatus(actor, workspaceId, attemptId), { headers: privateHeaders });
  } catch (error) { return connectorFailure(error); }
}
