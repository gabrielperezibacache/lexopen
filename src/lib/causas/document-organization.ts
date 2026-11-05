import { z } from "zod";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { writeAuditStrict } from "@/lib/audit";
import { httpError } from "@/lib/auth/access";
import { assertCausaCapability, documentReadWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { isStaff } from "@/lib/auth/rbac";
import { serializable } from "@/lib/command-execution";

const id = z.string().min(1).max(160);
const folderName = z.string().trim().min(1).max(120).refine(value => (
  value !== "." && value !== ".." && !/[\\/\p{Cc}\p{Cf}]/u.test(value)
), "Usa un nombre de carpeta sin barras ni caracteres de control");

export const organizeCaseDocumentsSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create-folder"), name: folderName, parentId: id.nullable() }).strict(),
  z.object({ action: z.literal("rename-folder"), folderId: id, name: folderName }).strict(),
  z.object({ action: z.literal("move-folder"), folderId: id, parentId: id.nullable() }).strict(),
  z.object({ action: z.literal("move-documents"), documentIds: z.array(id).min(1).max(100), folderId: id.nullable() }).strict(),
]);

export const MAX_CASE_DOCUMENT_FOLDERS = 500;
const MAX_FOLDER_DEPTH = 8;
export type OrganizationAction = z.infer<typeof organizeCaseDocumentsSchema>;

/** Called inside the authorized mail transaction before placing its new documents. */
export async function ensureCaseMailFolder(tx: Prisma.TransactionClient, causaId: string) {
  const id = `mail-folder-${createHash("sha256").update(causaId).digest("hex").slice(0, 40)}`;
  const folders = await tx.caseDocumentFolder.findMany({ where: { causaId }, select: { id: true, name: true, parentId: true } });
  if (folders.some(folder => folder.id === id)) return id;
  if (folders.length >= MAX_CASE_DOCUMENT_FOLDERS) throw httpError("Este expediente alcanzó el límite de carpetas", 409);
  const sameName = new Intl.Collator("es", { sensitivity: "accent" });
  let name = "Correo PJUD";
  for (let suffix = 2; folders.some(folder => folder.parentId === null && sameName.compare(folder.name, name) === 0); suffix += 1) {
    name = `Correo PJUD (${suffix})`;
  }
  const created = await tx.caseDocumentFolder.createMany({ data: { id, causaId, name }, skipDuplicates: true });
  if (!created.count && !await tx.caseDocumentFolder.findFirst({ where: { id, causaId }, select: { id: true } })) {
    throw httpError("No se pudo comprobar la carpeta del correo en este expediente", 409);
  }
  return id;
}

/** Filing is scoped to one case and never changes a document or evidence version. */
export async function organizeCaseDocuments(causaId: string, user: CausaAccessUser, input: OrganizationAction) {
  return serializable(async tx => {
    const actor = await tx.user.findUnique({
      where: { id: user.id },
      select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true },
    });
    if (!actor || !isStaff(actor.role)) throw httpError("No encontrado", 404);
    await assertCausaCapability(causaId, actor, "causa.write", tx);
    const folders = await tx.caseDocumentFolder.findMany({
      where: { causaId },
      select: { id: true, name: true, parentId: true },
    });
    const byId = new Map(folders.map(folder => [folder.id, folder]));
    function requiredFolder(folderId: string) {
      const folder = byId.get(folderId);
      if (!folder) throw httpError("No se encontró la carpeta en este expediente", 404);
      return folder;
    }

    if (input.action === "move-documents") {
      if (input.folderId) requiredFolder(input.folderId);
      const documentIds = [...new Set(input.documentIds)];
      const documents = await tx.documento.findMany({
        where: { AND: [documentReadWhere(actor), { causaId, id: { in: documentIds } }] },
        select: { id: true, archivePlacement: { select: { folderId: true } } },
      });
      if (documents.length !== documentIds.length) throw httpError("Algún documento ya no está disponible en este expediente", 404);
      const moved = documents.filter(document => (document.archivePlacement?.folderId ?? null) !== input.folderId);
      if (!moved.length) return { moved: 0 };
      const folderId = input.folderId;
      if (folderId) {
        const alreadyFiled = moved.filter(document => document.archivePlacement).map(document => document.id);
        const unfiled = moved.filter(document => !document.archivePlacement);
        if (alreadyFiled.length) await tx.caseDocumentPlacement.updateMany({
          where: { documentoId: { in: alreadyFiled } }, data: { folderId },
        });
        if (unfiled.length) await tx.caseDocumentPlacement.createMany({
          data: unfiled.map(document => ({ documentoId: document.id, folderId })), skipDuplicates: true,
        });
      } else {
        await tx.caseDocumentPlacement.deleteMany({ where: { documentoId: { in: moved.map(document => document.id) } } });
      }
      await writeAuditStrict({
        actorId: actor.id, action: "case.archive.move-documents", entityType: "Causa", entityId: causaId,
        before: { documents: moved.map(document => ({ id: document.id, folderId: document.archivePlacement?.folderId ?? null })) },
        after: { folderId, documentIds: moved.map(document => document.id) },
      }, tx);
      return { moved: moved.length };
    }

    const previous = input.action === "create-folder" ? null : requiredFolder(input.folderId);
    const parentId = input.action === "rename-folder" ? previous!.parentId : input.parentId;
    const name = input.action === "move-folder" ? previous!.name : input.name;
    if (input.action === "create-folder" && folders.length >= MAX_CASE_DOCUMENT_FOLDERS) {
      throw httpError("Este expediente alcanzó el límite de carpetas", 409);
    }
    const seen = new Set(previous ? [previous.id] : []);
    for (let ancestor = parentId; ancestor; ancestor = requiredFolder(ancestor).parentId) {
      if (seen.has(ancestor)) throw httpError("Elige una carpeta que no esté dentro de la que vas a mover", 409);
      seen.add(ancestor);
    }
    const depth = seen.size + (previous ? 0 : 1);
    if (depth > MAX_FOLDER_DEPTH) throw httpError("Elige un destino con menos niveles de carpetas", 409);
    if (input.action === "move-folder") {
      // Bound the whole branch, including children carried to the new destination.
      const frontier = [{ id: input.folderId, depth }];
      for (let index = 0; index < frontier.length; index++) {
        const node = frontier[index]!;
        for (const child of folders.filter(item => item.parentId === node.id)) {
          if (node.depth === MAX_FOLDER_DEPTH) throw httpError("Elige un destino con menos niveles de carpetas", 409);
          frontier.push({ id: child.id, depth: node.depth + 1 });
        }
      }
    }
    const sameName = new Intl.Collator("es", { sensitivity: "accent" });
    if (folders.some(folder => folder.parentId === parentId && folder.id !== previous?.id && sameName.compare(folder.name, name) === 0)) {
      throw httpError("Ya hay una carpeta con ese nombre en el destino", 409);
    }

    const folder = previous
      ? await tx.caseDocumentFolder.update({ where: { id: previous.id }, data: { parentId, name } })
      : await tx.caseDocumentFolder.create({ data: { causaId, parentId, name } });
    await writeAuditStrict({
      actorId: actor.id, action: `case.archive.${input.action}`, entityType: "CaseDocumentFolder", entityId: folder.id,
      before: previous, after: { causaId, parentId, name },
    }, tx);
    return { folder: { id: folder.id, name, parentId } };
  });
}
