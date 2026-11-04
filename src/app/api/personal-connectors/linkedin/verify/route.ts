import { NextRequest, NextResponse } from "next/server";
import { connectorActor, connectorFailure, privateHeaders } from "@/lib/personal-connectors/http";
import { verifyLinkedInAccount } from "@/lib/personal-connectors/linkedin/account";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try { const actor = await connectorActor(request, true), verified = await verifyLinkedInAccount(actor.id); return NextResponse.json({ account: verified.public }, { headers: privateHeaders }); }
  catch (error) { return connectorFailure(error); }
}
