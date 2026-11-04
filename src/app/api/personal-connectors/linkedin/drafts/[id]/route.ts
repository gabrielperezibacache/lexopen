import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { ConnectorError, publicHttpUrl } from "@/lib/personal-connectors/core";
import { connectorActor, connectorFailure, privateHeaders } from "@/lib/personal-connectors/http";
import { publicDraft } from "@/lib/personal-connectors/linkedin/publish";
import { verifyShareOrigin } from "@/lib/personal-connectors/linkedin/origin";
type Params = { params: Promise<{ id: string }> };
const schema = z.object({ revision: z.number().int().positive(), title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(3000), sourceUrl: z.string().max(2000).nullable().optional(), visibility: z.enum(["CONNECTIONS", "PUBLIC"]) }).strict();
export const runtime = "nodejs";
export async function PATCH(request: NextRequest, context: Params) {
  try {
    const actor = await connectorActor(request, true), { id } = await context.params, body = await parseKnowledgeBody(request, schema, 20_000), sourceUrl = publicHttpUrl(body.sourceUrl);
    if (body.sourceUrl && !sourceUrl) throw new ConnectorError("source_url_invalid", "Use un enlace público HTTPS sin credenciales ni direcciones locales.");
    const draft = await prisma.$transaction(async tx => {
      const current = await tx.externalShareDraft.findFirst({ where: { id, ownerId: actor.id } });
      if (!current) throw new ConnectorError("draft_not_found", "Borrador no encontrado.", 404);
      await verifyShareOrigin(current, actor.id, tx);
      const result = await tx.externalShareDraft.updateMany({ where: { id, ownerId: actor.id, revision: body.revision }, data: { title: body.title, body: body.body, sourceUrl, visibility: body.visibility, revision: { increment: 1 } } });
      if (!result.count) throw new ConnectorError("draft_changed", "El borrador cambió o no está disponible. Actualice antes de guardar.", 409);
      return tx.externalShareDraft.findFirstOrThrow({ where: { id, ownerId: actor.id } });
    });
    return NextResponse.json({ draft: publicDraft(draft) }, { headers: privateHeaders });
  } catch (error) { return connectorFailure(error); }
}
