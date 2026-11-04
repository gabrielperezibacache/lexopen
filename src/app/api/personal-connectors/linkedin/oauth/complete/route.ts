import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { connectorActor, connectorFailure, privateHeaders } from "@/lib/personal-connectors/http";
import { completeLinkedInOAuth } from "@/lib/personal-connectors/linkedin/account";
const schema = z.object({ attemptId: z.string().min(1).max(100) }).strict();
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try { const actor = await connectorActor(request, true), body = await parseKnowledgeBody(request, schema, 1024); return NextResponse.json({ account: await completeLinkedInOAuth(actor, body.attemptId) }, { headers: privateHeaders }); }
  catch (error) { return connectorFailure(error); }
}
