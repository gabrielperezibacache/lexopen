import { NextRequest, NextResponse } from "next/server";
import { connectorActor, connectorFailure, privateHeaders } from "@/lib/personal-connectors/http";
import { disconnectLinkedIn, linkedInStatus } from "@/lib/personal-connectors/linkedin/account";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try { const actor = await connectorActor(request); return NextResponse.json({ account: await linkedInStatus(actor.id) }, { headers: privateHeaders }); }
  catch (error) { return connectorFailure(error); }
}
export async function DELETE(request: NextRequest) {
  try { const actor = await connectorActor(request, true); return NextResponse.json({ account: await disconnectLinkedIn(actor.id) }, { headers: privateHeaders }); }
  catch (error) { return connectorFailure(error); }
}
