import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { actorFor } from "@/lib/books/access";
import { bookTransaction } from "@/lib/books/service";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { httpError } from "@/lib/auth/access";
import { sha256 } from "@/lib/evidence/fragments";
import { writeAuditStrict } from "@/lib/audit";
import { readAcademicArtifact } from "./academic";

type Client = PrismaClient | Prisma.TransactionClient;
const academicOrigin = z.object({ kind: z.literal("academic"), workspaceId: z.string().min(1).max(100), artifactId: z.string().min(1).max(100), revision: z.number().int().positive(), bodySha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const unavailable = () => httpError("El origen académico cambió o ya no está disponible. Prepare otro borrador desde la revisión vigente", 409);

/** Origin is server-owned provenance. Editing the social draft never detaches its source. */
export async function verifyAltazorShareOrigin(draft: { ownerId: string; originJson: string }, user: CausaAccessUser, client: Client = prisma): Promise<void> {
  const actor = await actorFor(user, client);
  if (draft.ownerId !== actor.id) throw httpError("El borrador no está disponible", 404);
  let raw: unknown;
  try { if (draft.originJson.length > 2048) throw unavailable(); raw = JSON.parse(draft.originJson); } catch { throw unavailable(); }
  if (z.object({}).strict().safeParse(raw).success) return;
  const parsed = academicOrigin.safeParse(raw);
  if (!parsed.success) throw unavailable();
  const origin = parsed.data, artifact = await readAcademicArtifact(origin.workspaceId, origin.artifactId, actor, client);
  if (artifact.status !== "reviewed" || artifact.revision !== origin.revision || sha256(artifact.body) !== origin.bodySha256) throw unavailable();
}

export async function prepareAcademicLinkedInDraft(workspaceId: string, artifactId: string, expectedRevision: number, user: CausaAccessUser, client: PrismaClient = prisma) {
  return bookTransaction(client, async tx => {
    const actor = await actorFor(user, tx), artifact = await readAcademicArtifact(workspaceId, artifactId, actor, tx);
    if (artifact.status !== "reviewed" || artifact.revision !== expectedRevision) throw unavailable();
    const originJson = JSON.stringify({ kind: "academic", workspaceId, artifactId, revision: artifact.revision, bodySha256: sha256(artifact.body) } satisfies z.infer<typeof academicOrigin>), requestId = `academic-${artifactId}-${expectedRevision}`;
    const existing = await tx.externalShareDraft.findUnique({ where: { ownerId_requestId: { ownerId: actor.id, requestId } } });
    if (existing) {
      if (existing.originJson !== originJson) throw unavailable();
      return { draftId: existing.id, reused: true, truncated: artifact.body.length > 3000 };
    }
    const body = artifact.body.slice(0,3000).trim();
    if (!body) throw httpError("La revisión no contiene texto para preparar un borrador", 400);
    const draft = await tx.externalShareDraft.create({ data: { ownerId: actor.id, requestId, title: artifact.title.slice(0,200), body, visibility: "CONNECTIONS", originJson } });
    await writeAuditStrict({ actorId: actor.id, action: "altazor.academic.linkedin_draft", entityType: "ExternalShareDraft", entityId: draft.id, after: { artifactId, revision: artifact.revision, truncated: artifact.body.length > 3000 } }, tx);
    return { draftId: draft.id, reused: false, truncated: artifact.body.length > 3000 };
  });
}
