import { activeComputerSessionWhere } from "../computer/lifecycle";
import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { assertCausaAccess } from "@/lib/auth/causa-access";
import { altazorActor } from "../access";
import type { ComputerSessionView } from "../computer/types";
import { computerHelpIdentity } from "../computer/help-identity";
import { claimHelpResponse, completeHelpResponse, createHelpRequest, helpWorkerQueue, notifyHelpRequest, pollHelpReplies } from "./service";

type Resume = (user: CausaAccessUser, sessionId: string, input: { requestId: string; turnIndex: number; response: string }) => Promise<unknown>;
type Dependencies = {
  client?: PrismaClient;
  read?: (user: CausaAccessUser, sessionId: string, passive?: boolean) => Promise<ComputerSessionView>;
  resume?: Resume;
  notify?: typeof notifyHelpRequest;
  poll?: typeof pollHelpReplies;
};

/** POST/Host worker only. Passive inspection never takes keyboard control or approves connectors. */
export async function reconcileComputerHelp(options: { limit?: number; ownerId?: string } = {}, dependencies: Dependencies = {}) {
  const client = dependencies.client ?? prisma;
  const computer = !dependencies.read || !dependencies.resume ? await import("../computer/service") : null;
  const read = dependencies.read ?? computer!.readComputerSession;
  const resume = dependencies.resume ?? computer!.resumeComputerHelp;
  const notify = dependencies.notify ?? notifyHelpRequest, poll = dependencies.poll ?? pollHelpReplies;
  const result = { inspected: 0, waiting: 0, answered: 0, resumed: 0, stale: 0, skipped: 0 };
  await helpWorkerQueue(client, options.limit);
  const policy = await client.firmSettings.findFirst({ select: { assistantLlmMode: true } });
  if (policy?.assistantLlmMode === "local_only") return result;
  const sessions = await client.altazorComputerSession.findMany({
    where: { ...(options.ownerId ? { ownerId: options.ownerId } : {}), state: { in: ["ready", "starting"] }, ...activeComputerSessionWhere(), workspace: { enabled: true } },
    include: { workspace: true, owner: { select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true, altazorCompanion: { select: { backgroundEnabled: true } } } } },
    orderBy: [{ lastHelpCheckedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }], take: Math.min(100, Math.max(1, options.limit ?? 20)),
  });
  const polled = new Set<string>();
  for (const session of sessions) {
    // Advance even when a desktop is held, idle or no longer authorized. This
    // timestamp is independent of the keyboard/secret lease and action CAS.
    const claimed = await client.altazorComputerSession.updateMany({
      where: { id: session.id, ownerId: session.ownerId, lastHelpCheckedAt: session.lastHelpCheckedAt, updatedAt: session.updatedAt },
      data: { lastHelpCheckedAt: new Date(), updatedAt: session.updatedAt },
    });
    if (!claimed.count) continue;
    try {
      if (session.held || session.owner.altazorCompanion?.backgroundEnabled === false || session.workspace.ownerId !== session.ownerId) { result.skipped++; continue; }
      const actor = await altazorActor(session.owner, client);
      if (session.workspace.causaId) await assertCausaAccess(session.workspace.causaId, actor, undefined, client);
      const view = await read(actor, session.id, true);
      result.inspected++;
      if (view.session.held || view.approvals.length) { result.skipped++; continue; }
      const last = view.turns.findLast(turn => turn.from === "assistant");
      const laterUser = last && view.turns.some(turn => turn.from === "user" && turn.index > last.index);
      const identity = !laterUser ? computerHelpIdentity(actor.id, session.id, last) : null;
      const requestKey = identity?.requestKey ?? null;
      const old = await client.altazorHelpRequest.findMany({ where: { ownerId: actor.id, computerSessionId: session.id, status: { in: ["pending", "answered", "resume_failed"] } }, select: { id: true, requestKey: true } });
      for (const request of old) if (request.requestKey !== requestKey) {
        const changed = await client.altazorHelpRequest.updateMany({ where: { id: request.id, ownerId: actor.id, status: { in: ["pending", "answered", "resume_failed"] } }, data: { status: "cancelled" } });
        result.stale += changed.count;
      }
      if (!last || !identity) continue;
      const request = await createHelpRequest(actor, { requestKey: identity.key, question: identity.question.slice(0, 4000), computerSessionId: session.id, computerTurnId: String(last.index), scopeKind: session.workspace.causaId ? "causa" : "workspace", scopeId: session.workspace.causaId || session.workspace.id }, client);
      if (request.status === "pending") { result.waiting++; await notify(actor.id, request.id, client); }
      if (!polled.has(actor.id)) { await poll(actor, client); polled.add(actor.id); }
      // The gateway may have progressed while mobile replies were being fetched.
      const current = await read(actor, session.id, true);
      const currentTurn = current.turns.findLast(turn => turn.from === "assistant");
      const currentIdentity = computerHelpIdentity(actor.id, session.id, currentTurn);
      if (current.session.held || current.approvals.length || !currentTurn || currentIdentity?.requestKey !== identity.requestKey || current.turns.some(turn => turn.from === "user" && turn.index > currentTurn.index)) { result.skipped++; continue; }
      const claimed = await claimHelpResponse(actor, request.id, client);
      if (!claimed) continue;
      result.answered++;
      try {
        const action = await resume(actor, session.id, { requestId: claimed.id, turnIndex: last.index, response: claimed.response });
        if (!action || typeof action !== "object" || !("status" in action) || action.status !== "completed") throw Error("La reanudación no tiene confirmación de entrega.");
        await completeHelpResponse(actor, claimed.id, true, client);
        result.resumed++;
      } catch {
        await completeHelpResponse(actor, claimed.id, false, client);
      }
    } catch { result.skipped++; /* Permissions, sessions and providers are re-evaluated on the next worker pass. */ }
  }
  return result;
}
