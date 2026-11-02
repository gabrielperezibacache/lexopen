import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { assertCausaAccess, assertCausaCapability, type CausaAccessUser } from "@/lib/auth/causa-access";
import { can } from "@/lib/auth/permissions";
import { actorFor } from "@/lib/books/access";
export type HearingClient = PrismaClient | Prisma.TransactionClient;
export const unavailable = () => httpError("Mesa de audiencia o material no disponible con sus permisos actuales", 404);
export const changed = () => httpError("La mesa cambió. Recargue antes de guardar para conservar los cambios de ambas sesiones", 409);
export const isUnavailable = (error: unknown) => [404, 409, 422].includes(Number((error as { status?: number }).status));
export async function hearingActor(causaId: string, user: CausaAccessUser, client: HearingClient = prisma, write = false) {
  const actor = await actorFor(user, client);
  const access = write ? await assertCausaCapability(causaId, actor, "causa.write", client) : await assertCausaAccess(causaId, actor, { auditOverride: false }, client);
  return { actor, canWrite: can(actor, "causa.write", { causaRol: access.causaRol }) };
}
export async function workspaceFor(causaId: string, workspaceId: string, user: CausaAccessUser, client: HearingClient = prisma, write = false) {
  const access = await hearingActor(causaId, user, client, write);
  const row = await client.hearingWorkspace.findFirst({ where: { id: workspaceId, causaId, ownerId: access.actor.id } });
  if (!row) throw unavailable();
  return { ...access, row };
}
export async function hearingTransaction<T>(client: HearingClient, action: (tx: Prisma.TransactionClient) => Promise<T>) {
  if (!("$transaction" in client)) return action(client);
  for (let attempt = 0; ; attempt++) {
    try { return await client.$transaction(action, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 }); }
    catch (error) { if (attempt < 3 && error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) continue; throw error; }
  }
}
