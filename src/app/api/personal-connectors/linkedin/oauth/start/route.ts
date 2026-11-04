import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { connectorActor, connectorFailure, privateHeaders } from "@/lib/personal-connectors/http";
import { startLinkedInOAuth } from "@/lib/personal-connectors/linkedin/account";
const schema = z.object({ purpose: z.enum(["identity", "publish"]).default("identity"), mode: z.enum(["web", "native"]).default("web") }).strict();
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try { const actor = await connectorActor(request, true), body = await parseKnowledgeBody(request, schema, 1024); return NextResponse.json(await startLinkedInOAuth(actor, body.purpose ?? "identity", body.mode ?? "web"), { headers: privateHeaders }); }
  catch (error) { return connectorFailure(error); }
}
