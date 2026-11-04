import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { ConnectorError, publicHttpUrl } from "@/lib/personal-connectors/core";
import { connectorActor, connectorFailure, privateHeaders } from "@/lib/personal-connectors/http";
import { publicDraft, publicReceipt } from "@/lib/personal-connectors/linkedin/publish";
import { verifyShareOrigin, visibleShareDrafts } from "@/lib/personal-connectors/linkedin/origin";
const schema = z.object({ requestId: z.string().regex(/^[A-Za-z0-9._:-]{8,160}$/), title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(3000), sourceUrl: z.string().max(2000).nullable().optional(), visibility: z.enum(["CONNECTIONS", "PUBLIC"]).default("CONNECTIONS") }).strict();
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const actor = await connectorActor(request);
    const [drafts, receipts] = await Promise.all([prisma.externalShareDraft.findMany({ where: { ownerId: actor.id }, orderBy: { updatedAt: "desc" }, take: 40 }), prisma.externalPublicationAttempt.findMany({ where: { ownerId: actor.id }, orderBy: { createdAt: "desc" }, take: 80 })]);
    const visible = await visibleShareDrafts(drafts, actor.id), ids = new Set(visible.drafts.map(draft => draft.id));
    return NextResponse.json({ drafts: visible.drafts.map(publicDraft), receipts: receipts.filter(receipt => ids.has(receipt.draftId)).map(publicReceipt), withheldDrafts: visible.withheld }, { headers: privateHeaders });
  } catch (error) { return connectorFailure(error); }
}
export async function POST(request: NextRequest) {
  try {
    const actor = await connectorActor(request, true), body = await parseKnowledgeBody(request, schema, 20_000);
    const sourceUrl = publicHttpUrl(body.sourceUrl);
    if (body.sourceUrl && !sourceUrl) throw new ConnectorError("source_url_invalid", "Use un enlace público HTTPS sin credenciales ni direcciones locales.");
    const existing = await prisma.externalShareDraft.findUnique({ where: { ownerId_requestId: { ownerId: actor.id, requestId: body.requestId } } });
    if (existing) {
      await verifyShareOrigin(existing, actor.id);
      if (existing.title !== body.title || existing.body !== body.body || existing.sourceUrl !== sourceUrl || existing.visibility !== body.visibility) throw new ConnectorError("request_conflict", "Este identificador ya corresponde a otro borrador.", 409);
      return NextResponse.json({ draft: publicDraft(existing) }, { headers: privateHeaders });
    }
    const draft = await prisma.externalShareDraft.create({ data: { ownerId: actor.id, requestId: body.requestId, title: body.title, body: body.body, sourceUrl, visibility: body.visibility } });
    return NextResponse.json({ draft: publicDraft(draft) }, { status: 201, headers: privateHeaders });
  } catch (error) { return connectorFailure(error); }
}
