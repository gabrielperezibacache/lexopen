import { httpError } from "@/lib/auth/access";
import { getWorkCountry } from "@/lib/config/work-country";
import { prisma } from "@/lib/db";
import type { Prisma, PrismaClient } from "@prisma/client";

export const deadlineCalculation = { calculationCountry: "CL", calculationRegime: "internal_weekdays_cl_v1" } as const;
export const deadlineComputationNotice = "El cálculo disponible es una estimación interna para Chile, con días hábiles de lunes a viernes; no aplica automáticamente el régimen de un procedimiento judicial.";
/** Other jurisdictions remain manual until an explicit rules engine is implemented. */
export async function requireDeadlineComputation(client: PrismaClient | Prisma.TransactionClient = prisma) {
  if (await getWorkCountry(client) !== "CL") throw httpError("El cálculo automático sólo está disponible con Chile como país de trabajo. Indique una fecha límite revisada manualmente para este país y procedimiento.", 422);
}
