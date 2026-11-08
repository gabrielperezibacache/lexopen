import type { Cliente } from "@prisma/client";
import { currentStaffActor, type StaffActor } from "@/lib/auth/staff-actor";
import { httpError } from "@/lib/auth/access";
import { createClienteRecord } from "./mutations";
import { executeCommand } from "@/lib/command-execution";
import { clienteCreateSchema } from "@/lib/schemas";

export async function createClienteCommand(user: StaffActor, raw: unknown, key: string) {
  const input = clienteCreateSchema.parse(raw);
  return executeCommand<Cliente>({
    key, ownerId: user.id, input,
    authorize: async (tx, result) => {
      await currentStaffActor(user, tx);
      if (result && !await tx.cliente.findUnique({ where: { id: result.id }, select: { id: true } })) {
        throw httpError("Cliente no encontrado", 404);
      }
    },
    run: tx => createClienteRecord(user, input, tx),
  });
}
