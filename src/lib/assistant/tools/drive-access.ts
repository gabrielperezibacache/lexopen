import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { assertCausaCapability, documentReadWhere } from "@/lib/auth/causa-access";
import { desktopScope } from "./escritorio-access";
import type { ToolContext } from "../types";

export async function driveScope(ctx: ToolContext, write: boolean, db: Prisma.TransactionClient = prisma, historical = false) {
  const scope = await desktopScope(ctx, db, historical);
  if (!scope.causaId) throw httpError("Elige una causa en LexOpen para trabajar con sus archivos de Drive.", 409);
  if (write) await assertCausaCapability(scope.causaId, scope.actor, "causa.write", db);
  return { ...scope, causaId: scope.causaId };
}

/** History/authorization checks are local; they never replay a cloud operation. */
export async function assertDriveToolInputAccess(id: string, input: Record<string, unknown>, ctx: ToolContext, write: boolean, db: Prisma.TransactionClient = prisma, historical = false) {
  const scope = await driveScope(ctx, write, db, historical);
  if (id === "drive.guardarDocumento") {
    if (typeof input.documentoId !== "string") throw httpError("Selecciona un documento de esta causa.", 409);
    const doc = await db.documento.findFirst({ where: { AND: [{ id: input.documentoId, causaId: scope.causaId, confidencial: false, privilegio: false }, documentReadWhere(scope.actor)] }, select: { id: true } });
    if (!doc) throw httpError("Documento no encontrado o sin permiso para enviarlo a Drive.", 404);
  }
}
