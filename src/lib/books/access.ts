import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { canSome } from "@/lib/auth/permissions";
import { isStaff } from "@/lib/auth/rbac";
import { STAFF_ROLES } from "@/lib/auth/roles";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
export type BookClient = PrismaClient | Prisma.TransactionClient;
export async function actorFor(user: CausaAccessUser, client: BookClient = prisma) {
  const actor = await client.user.findUnique({ where: { id: user.id }, select: { id: true, name: true, role: true, capabilityGrants: true, capabilityRevokes: true } });
  if (!actor || !isStaff(actor.role) || !canSome(actor, "assistant.use")) throw httpError("No tiene permiso para consultar la biblioteca jurídica", 403);
  return actor;
}
export function bookAccessWhere(user: Pick<CausaAccessUser, "id">): Prisma.LibraryBookWhereInput {
  return { deletedAt: null, owner: { role: { in: [...STAFF_ROLES] }, NOT: { capabilityRevokes: { contains: "assistant.use" } } }, OR: [{ ownerId: user.id }, { collectionItems: { some: { collection: { members: { some: { userId: user.id } } } } } }] };
}
export function collectionAccessWhere(user: Pick<CausaAccessUser, "id">): Prisma.BookShelfCollectionWhereInput {
  return { owner: { role: { in: [...STAFF_ROLES] }, NOT: { capabilityRevokes: { contains: "assistant.use" } } }, OR: [{ ownerId: user.id }, { members: { some: { userId: user.id } } }] };
}
export function missingBook() { return httpError("Libro no encontrado o sin acceso actual", 404); }
export async function bookFor(id: string, user: CausaAccessUser, client: BookClient = prisma, owned = false) {
  const actor = await actorFor(user, client);
  const book = await client.libraryBook.findFirst({ where: { AND: [{ id }, owned ? { ownerId: actor.id, deletedAt: null } : bookAccessWhere(actor)] } });
  if (!book) throw missingBook();
  return { actor, book };
}
