import { NextRequest, NextResponse } from "next/server";
import { computerActor, computerFailure, privateHeaders, readComputerMessage } from "@/lib/altazor/computer/http";
import { sendComputerMessage } from "@/lib/altazor/computer/service";
export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { const actor = await computerActor(request, true), { id } = await context.params, body = await readComputerMessage(request); return NextResponse.json({ action: await sendComputerMessage(actor, id, body) }, { headers: privateHeaders }); }
  catch (error) { return computerFailure(error); }
}
