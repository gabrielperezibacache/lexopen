import { NextRequest, NextResponse } from "next/server";
import { computerActor, computerFailure, privateHeaders } from "@/lib/altazor/computer/http";
import { readComputerSession } from "@/lib/altazor/computer/service";
export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { const actor = await computerActor(request), { id } = await context.params; return NextResponse.json(await readComputerSession(actor, id), { headers: privateHeaders }); }
  catch (error) { return computerFailure(error); }
}
