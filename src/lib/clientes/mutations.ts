import type { Prisma } from "@prisma/client";
import type { z } from "zod";
import { currentStaffActor, type StaffActor } from "@/lib/auth/staff-actor";
import { httpError } from "@/lib/auth/access";
import { writeAuditStrict } from "@/lib/audit";
import { clienteCreateSchema, clienteUpdateSchema } from "@/lib/schemas";
import { clienteVersion } from "@/lib/offline/version";
function changes(input: z.infer<typeof clienteUpdateSchema>) {
  const { razonSocial, ...rest } = input;
  return { ...Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined).map(([key, value]) => [key, value === "" ? null : value])), ...(razonSocial !== undefined ? { razonSocial: razonSocial.trim() } : {}) };
}
export async function createClienteRecord(user: StaffActor, raw: unknown, tx: Prisma.TransactionClient) {
  await currentStaffActor(user, tx); const input = clienteCreateSchema.parse(raw);
  const cliente = await tx.cliente.create({ data: { ...changes(input), razonSocial: input.razonSocial.trim() } });
  await writeAuditStrict({ actorId: user.id, action: "cliente.create", entityType: "Cliente", entityId: cliente.id, after: cliente }, tx);
  return cliente;
}
export async function updateClienteRecord(user: StaffActor, id: string, raw: unknown, tx: Prisma.TransactionClient, expectedVersion?: string) {
  await currentStaffActor(user, tx); const input = clienteUpdateSchema.parse(raw);
  const before = await tx.cliente.findUnique({ where: { id } });
  if (!before) throw httpError("Cliente no encontrado", 404);
  if (expectedVersion && clienteVersion(before) !== expectedVersion) throw httpError("El cliente cambió en otra sesión. Conserve sus cambios y compare la versión actual antes de guardar.", 409);
  const cliente = await tx.cliente.update({ where: { id, updatedAt: before.updatedAt }, data: changes(input) });
  await writeAuditStrict({ actorId: user.id, action: "cliente.update", entityType: "Cliente", entityId: id, before, after: cliente }, tx);
  return cliente;
}
