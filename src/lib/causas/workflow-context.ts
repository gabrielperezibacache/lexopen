import { notFound } from "next/navigation";
import { assertCausaAccess, type CausaAccessUser } from "@/lib/auth/causa-access";
import { prisma } from "@/lib/db";

export function workflowDraftId(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : undefined;
}

/** Resolve optional navigation context with the same ethical wall as the cause. */
export async function caseWorkflowContext(value: unknown, user: CausaAccessUser) {
  if (value === undefined) return null;
  if (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) notFound();
  await assertCausaAccess(value, user, { auditOverride: false }).catch(() => notFound());
  const causa = await prisma.causa.findUnique({ where: { id: value }, select: { id: true, titulo: true } });
  if (!causa) notFound();
  return causa;
}
