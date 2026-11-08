import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { assertCausaAccess, assertCausaCapability, type CausaAccessUser } from "@/lib/auth/causa-access";
import { can } from "@/lib/auth/permissions";
import { actorFor } from "@/lib/books/access";
export type WritingClient = PrismaClient | Prisma.TransactionClient;
export const writingMissing = () => httpError("Escrito o material no disponible con sus permisos actuales", 404);
export const writingChanged = () => httpError("El escrito cambió en otra sesión. Conserve su texto y revise la versión guardada antes de continuar", 409);
export const writingUnavailable = (error: unknown) => [404, 409, 413, 422].includes(Number((error as { status?: number }).status));
export async function writingActor(causaId: string, user: CausaAccessUser, client: WritingClient = prisma, write = false) {
  const actor = await actorFor(user, client);
  const access = write ? await assertCausaCapability(causaId, actor, "causa.write", client) : await assertCausaAccess(causaId, actor, { auditOverride: false }, client);
  const canWrite = can(actor, "causa.write", { causaRol: access.causaRol });
  return { actor, canWrite, canReview: canWrite && can(actor, "escrito.approve", { causaRol: access.causaRol }) };
}
export async function writingTransaction<T>(client: WritingClient, action: (tx: Prisma.TransactionClient) => Promise<T>) {
  if (!("$transaction" in client)) return action(client);
  for (let attempt = 0; ; attempt++) {
    try { return await client.$transaction(action, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 }); }
    catch (error) { if (attempt < 3 && error instanceof Prisma.PrismaClientKnownRequestError && (["P2034", "P2002"].includes(error.code) || error.code === "P2010" && ["40001", "40P01"].includes(String(error.meta?.code)))) continue; throw error; }
  }
}
