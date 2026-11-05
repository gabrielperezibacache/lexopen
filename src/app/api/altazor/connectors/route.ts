import { NextRequest, NextResponse } from "next/server";
import { ConnectorError } from "@/lib/personal-connectors/core";
import { computerFailure, privateHeaders } from "@/lib/altazor/computer/http";
import { connectorActor } from "@/lib/altazor/connectors/http";
import { connectorInventory } from "@/lib/altazor/connectors/service";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const actor = await connectorActor(request), workspaceId = request.nextUrl.searchParams.get("workspaceId");
    if (!workspaceId || workspaceId.length > 100) throw new ConnectorError("workspace_required", "Seleccione su espacio de ALTAZOR.");
    return NextResponse.json({ connectors: await connectorInventory(actor, workspaceId) }, { headers: privateHeaders });
  } catch (error) { return computerFailure(error); }
}
