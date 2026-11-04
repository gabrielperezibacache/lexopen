import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { connectorActor, connectorFailure, privateHeaders } from "@/lib/personal-connectors/http";
import { publishShare } from "@/lib/personal-connectors/linkedin/publish";
const schema = z.object({ revision: z.number().int().positive(), previewHash: z.string().regex(/^[a-f0-9]{64}$/), requestId: z.string().regex(/^[A-Za-z0-9._:-]{8,160}$/), confirmed: z.literal(true) }).strict();
export const runtime = "nodejs";
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try { const actor = await connectorActor(request, true), { id } = await context.params, body = await parseKnowledgeBody(request, schema, 2048); return NextResponse.json({ receipt: await publishShare(actor.id, id, body) }, { headers: privateHeaders }); }
  catch (error) { return connectorFailure(error); }
}
