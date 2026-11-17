import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { snapshotHash } from "./snapshot";
import { readCaseJob } from "./service";
export async function caseJobConversationResult(
  id: string,
  conversationId: string,
  user: CausaAccessUser,
) {
  const row = await prisma.altazorCaseJob.findFirst({
    where: { id, conversationId, ownerId: user.id },
    select: { originTurnId: true, planJson: true },
  });
  if (!row)
    throw httpError("El resultado no pertenece a esta conversación", 404);
  const view = await readCaseJob(id, user);
  if (
    !view.available ||
    !view.report ||
    !["awaiting_review", "partial", "completed"].includes(view.status)
  )
    return null;
  const text = JSON.stringify({
    objective: view.objective,
    report: view.report,
    recordsAtCreation: view.savedSelection?.proposals || [],
    receipts: view.receipts,
    receiptMeaning:
      "Constancia de creación; consulta cada registro para conocer su estado actual.",
    references: view.references,
  });
  return {
    id,
    hash: snapshotHash({ plan: row.planJson, text }),
    text,
    originTurnId: row.originTurnId,
  };
}
