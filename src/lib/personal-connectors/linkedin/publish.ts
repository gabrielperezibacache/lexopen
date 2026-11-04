import { prisma } from "@/lib/db";
import type { ExternalShareDraft, ExternalPublicationAttempt } from "@prisma/client";
import { ConnectorError } from "../core";
import type { PublicationReceipt, ShareDraft, SharePreview } from "../types";
import { requireLinkedInConfig } from "./config";
import { verifyLinkedInAccount } from "./account";
import { publicationSnapshot, sendLinkedInPost } from "./transport";
import { verifyShareOrigin } from "./origin";

export const publicDraft = (draft: ExternalShareDraft): ShareDraft => ({ id: draft.id, title: draft.title, body: draft.body, sourceUrl: draft.sourceUrl, visibility: draft.visibility, revision: draft.revision, updatedAt: draft.updatedAt.toISOString() });
export const publicReceipt = (row: ExternalPublicationAttempt): PublicationReceipt => ({ id: row.id, draftId: row.draftId, draftRevision: row.draftRevision, status: row.status === "sending" && Date.now() - row.createdAt.getTime() > 60_000 ? "unknown" : row.status, externalUrl: row.externalUrl, errorCode: row.errorCode });
export async function previewShare(ownerId: string, draftId: string): Promise<SharePreview> {
  const draft = await prisma.externalShareDraft.findFirst({ where: { id: draftId, ownerId } });
  if (!draft) throw new ConnectorError("draft_not_found", "Borrador no encontrado.", 404);
  await verifyShareOrigin(draft, ownerId);
  const { account, public: state } = await verifyLinkedInAccount(ownerId);
  const snapshot = publicationSnapshot(draft, account.id, account.externalSubject);
  await verifyShareOrigin(draft, ownerId);
  return { draft: publicDraft(draft), previewHash: snapshot.hash, author: account.name, commentary: snapshot.commentary, visibility: draft.visibility, canPublish: state.canPublish, reason: state.reason };
}
export async function publishShare(ownerId: string, draftId: string, input: { revision: number; previewHash: string; requestId: string }) {
  const sourceDraft = await prisma.externalShareDraft.findFirst({ where: { id: draftId, ownerId } });
  if (!sourceDraft) throw new ConnectorError("draft_not_found", "Borrador no encontrado.", 404);
  await verifyShareOrigin(sourceDraft, ownerId);
  const existing = await prisma.externalPublicationAttempt.findUnique({ where: { ownerId_requestId: { ownerId, requestId: input.requestId } } });
  if (existing) {
    if (existing.draftId !== draftId || existing.draftRevision !== input.revision || existing.inputHash !== input.previewHash) throw new ConnectorError("request_conflict", "Este intento corresponde a otra versión del borrador.", 409);
    return publicReceipt(existing);
  }
  const config = requireLinkedInConfig();
  if (!config.shareEnabled) throw new ConnectorError("publishing_unconfigured", "La publicación por API no está habilitada. Puede copiar el borrador y abrir LinkedIn.", 503);
  const verified = await verifyLinkedInAccount(ownerId);
  if (!verified.public.canPublish) throw new ConnectorError("publish_scope_missing", "Esta autorización no incluye permiso comprobado para publicar. Vuelva a conectar solicitando publicación.", 403);
  let attempt: ExternalPublicationAttempt;
  let commentary: string;
  try {
    const claimed = await prisma.$transaction(async tx => {
      const locked = await tx.personalConnectorAccount.updateMany({ where: { id: verified.account.id, ownerId, credentialsEnc: verified.account.credentialsEnc, status: "connected" }, data: { updatedAt: new Date() } });
      if (!locked.count) throw new ConnectorError("account_changed", "La conexión cambió. Compruebe la cuenta y revise el borrador nuevamente.", 409);
      const draft = await tx.externalShareDraft.findFirst({ where: { id: draftId, ownerId } });
      if (!draft) throw new ConnectorError("draft_not_found", "Borrador no encontrado.", 404);
      await verifyShareOrigin(draft, ownerId, tx);
      const account = await tx.personalConnectorAccount.findFirst({ where: { id: verified.account.id, ownerId, credentialsEnc: verified.account.credentialsEnc, status: "connected" } });
      if (!account) throw new ConnectorError("account_changed", "La conexión cambió. Compruebe la cuenta y revise el borrador nuevamente.", 409);
      const snapshot = publicationSnapshot(draft, account.id, account.externalSubject);
      if (draft.revision !== input.revision || snapshot.hash !== input.previewHash) throw new ConnectorError("draft_changed", "El borrador cambió. Revise la nueva versión antes de publicar.", 409);
      const unresolved = await tx.externalPublicationAttempt.findFirst({ where: { draftId, ownerId, status: { in: ["sending", "unknown"] } } });
      if (unresolved) throw new ConnectorError("publication_unconfirmed", "Hay un envío pendiente de comprobación en LinkedIn. No se reenviará automáticamente.", 409);
      const receipt = await tx.externalPublicationAttempt.create({ data: { ownerId, accountId: account.id, draftId, draftRevision: draft.revision, requestId: input.requestId, inputHash: snapshot.hash, status: "sending" } });
      return { receipt, draft, commentary: snapshot.commentary, visibility: draft.visibility };
    });
    attempt = claimed.receipt; commentary = claimed.commentary;
    try { await verifyShareOrigin(claimed.draft, ownerId); }
    catch (error) { await prisma.externalPublicationAttempt.update({ where: { id: attempt.id }, data: { status: "failed", errorCode: "source_access_changed" } }); throw error; }
    // Never move this POST into a retried database transaction or command runner.
    const result = await sendLinkedInPost({ token: verified.grant.accessToken, subject: verified.account.externalSubject, commentary, visibility: claimed.visibility });
    try {
      const saved = await prisma.externalPublicationAttempt.update({ where: { id: attempt.id }, data: { status: result.status, externalUrn: result.urn, externalUrl: result.url, errorCode: result.errorCode } });
      return publicReceipt(saved);
    } catch { throw new ConnectorError("publication_unconfirmed", "No se pudo guardar la confirmación. Compruebe LinkedIn antes de realizar otro envío.", 503); }
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      const replay = await prisma.externalPublicationAttempt.findUnique({ where: { ownerId_requestId: { ownerId, requestId: input.requestId } } });
      if (replay && replay.draftId === draftId && replay.inputHash === input.previewHash) { await verifyShareOrigin(sourceDraft, ownerId); return publicReceipt(replay); }
      throw new ConnectorError("version_already_sent", "Esta versión ya tiene un intento registrado. Revise su resultado antes de volver a publicar.", 409);
    }
    throw error;
  }
}
