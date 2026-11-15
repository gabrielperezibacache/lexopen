import { NextRequest, NextResponse } from "next/server";
import { computerActor, computerFailure, privateHeaders } from "@/lib/altazor/computer/http";
import { fileHistoryQuery, listComputerFileHistory } from "@/lib/altazor/computer/file-history";
import { ConnectorError } from "@/lib/personal-connectors/core";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const actor = await computerActor(request), params = request.nextUrl.searchParams;
    const raw: Record<string, string> = {};
    for (const [key, value] of params) {
      if (key in raw) throw new ConnectorError("history_query_invalid", "Hay filtros repetidos.", 400);
      raw[key] = value;
    }
    return NextResponse.json(await listComputerFileHistory(actor, fileHistoryQuery.parse(raw)), { headers: privateHeaders });
  } catch (error) { return computerFailure(error); }
}
