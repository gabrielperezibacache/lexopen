import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { caseReportText } from "./report-reference";
import { readCaseJob } from "./service";
export async function caseJobConversationResult(
  id: string,
  conversationId: string,
  user: CausaAccessUser,
) {
  const row = await prisma.altazorCaseJob.findFirst({
    where: { id, conversationId, ownerId: user.id },
    select: { originTurnId: true },
  });
  if (!row)
    throw httpError("El resultado no pertenece a esta conversación", 404);
  const view = await readCaseJob(id, user);
  const text = caseReportText(view);
  if (!text || !view.continuationHash) return null;
  return {
    id,
    hash: view.continuationHash,
    text,
    originTurnId: row.originTurnId,
  };
}
