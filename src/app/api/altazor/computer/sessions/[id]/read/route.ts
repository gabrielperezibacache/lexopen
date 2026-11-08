import { NextRequest, NextResponse } from "next/server";
import { computerActor, computerFailure, privateHeaders } from "@/lib/altazor/computer/http";
import { computerReadSchema } from "@/lib/altazor/computer/reading";
import { readComputerContent } from "@/lib/altazor/computer/service";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";

export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await computerActor(request, true), { id } = await context.params;
    const body = await parseKnowledgeBody(request, computerReadSchema, 4096);
    return NextResponse.json({ reading: await readComputerContent(actor, id, body) }, { headers: privateHeaders });
  } catch (error) { return computerFailure(error); }
}
