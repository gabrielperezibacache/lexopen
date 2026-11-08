import type { Prisma } from "@prisma/client";
import { httpError } from "./access";
import { isStaff } from "./rbac";

export type StaffActor = { id: string; sessionVersion?: number };

/** Resolve current permissions inside the transaction, including receipt replays. */
export async function currentStaffActor(user: StaffActor, client: Pick<Prisma.TransactionClient, "user">) {
  const actor = await client.user.findUnique({
    where: { id: user.id },
    select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true, sessionVersion: true },
  });
  if (!actor || user.sessionVersion !== undefined && user.sessionVersion !== actor.sessionVersion) {
    throw httpError("La sesión ya no está disponible", 401);
  }
  if (!isStaff(actor.role)) throw httpError("Prohibido", 403);
  return actor;
}

/** Current staff permissions resolved from the database, rather than session input. */
export type ResolvedStaffActor = Awaited<ReturnType<typeof currentStaffActor>>;
