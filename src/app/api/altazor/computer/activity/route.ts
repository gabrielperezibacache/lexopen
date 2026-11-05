import { NextRequest, NextResponse } from "next/server";
import { computerActor, computerFailure, privateHeaders } from "@/lib/altazor/computer/http";
import { readComputerActivity } from "@/lib/altazor/computer/service";
import { ConnectorError } from "@/lib/personal-connectors/core";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const actor = await computerActor(request);
    const query = request.nextUrl.searchParams;
    const causaId = query.get("causaId"), sessionId = query.get("sessionId");
    if (causaId && !/^[A-Za-z0-9_-]{1,100}$/.test(causaId)) throw new ConnectorError("scope_invalid", "Causa no válida.");
    if (sessionId !== null && (!/^[A-Za-z0-9_-]{1,100}$/.test(sessionId) || query.has("causaId") || query.getAll("sessionId").length !== 1)) {
      throw new ConnectorError("session_invalid", "Sesión de escritorio no válida.");
    }
    return NextResponse.json(await readComputerActivity(actor, causaId, sessionId), { headers: privateHeaders });
  } catch (error) {
    return computerFailure(error);
  }
}
