import { NextRequest, NextResponse } from "next/server";
import { connectorActor, connectorFailure, privateHeaders } from "@/lib/personal-connectors/http";
import { previewShare } from "@/lib/personal-connectors/linkedin/publish";
export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { const actor = await connectorActor(request, true), { id } = await context.params; return NextResponse.json({ preview: await previewShare(actor.id, id) }, { headers: privateHeaders }); }
  catch (error) { return connectorFailure(error); }
}
