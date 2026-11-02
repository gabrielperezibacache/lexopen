import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { httpError } from "@/lib/auth/access";
import { readBookPage } from "@/lib/books/service";
import { captureDocumentEvidence, captureSiteFileEvidence, readEvidencePageImage } from "@/lib/evidence/service";
import { workspaceFor, unavailable } from "./access";
import { sourceFor, readHearingSource } from "./sources";
import type { HearingLocation } from "./types";
export async function readHearingPage(causaId: string, workspaceId: string, sourceId: string, user: CausaAccessUser, query: HearingLocation, client: PrismaClient = prisma) {
  const { actor } = await workspaceFor(causaId, workspaceId, user, client), { row, option } = await sourceFor(causaId, workspaceId, sourceId, actor, client);
  if (!query.page) throw httpError("Elija una página física", 400);
  let result;
  if (option.kind === "book") result = await readBookPage(row.refId, query.page, actor, client);
  else if (option.kind === "document" || option.kind === "site_file") { const view = await readHearingSource(causaId, workspaceId, sourceId, actor, query, client); if (!view.versionId || !view.imageHref) throw unavailable(); result = await readEvidencePageImage(view.versionId, query.page, actor); }
  else throw unavailable();
  const current = await workspaceFor(causaId, workspaceId, actor, client); await sourceFor(causaId, workspaceId, sourceId, current.actor, client);
  return result;
}
export async function prepareHearingSource(causaId: string, workspaceId: string, sourceId: string, user: CausaAccessUser, client: PrismaClient = prisma) {
  const { actor } = await workspaceFor(causaId, workspaceId, user, client, true), { row, option } = await sourceFor(causaId, workspaceId, sourceId, actor, client);
  const file = option.kind === "site_file" ? await client.siteFile.findUnique({ where: { id: row.refId }, select: { siteId: true } }) : null;
  const result = option.kind === "document" ? await captureDocumentEvidence(row.refId, actor, client) : file ? await captureSiteFileEvidence(file.siteId, row.refId, actor, client) : null;
  if (!result) throw httpError("Esta fuente se prepara al incorporarla a la biblioteca o a la investigación", 400);
  await workspaceFor(causaId, workspaceId, actor, client, true);
  return { versionId: result.id };
}
