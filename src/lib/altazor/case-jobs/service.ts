import { santiagoDateKey } from "@/lib/chile-time";
import type { Prisma, AltazorCaseJob } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import {
  assertCausaCapability,
  type CausaAccessUser,
} from "@/lib/auth/causa-access";
import { altazorActor, conversationFor } from "../access";
import { serializable, canonicalJson } from "@/lib/command-execution";
import { writeAuditStrict } from "@/lib/audit";
import { icaroDestination } from "../icaros/destination";
import { verifyAltazorSources } from "../resources";
import { cancelIcaroJob } from "../icaros/service";
import { createTask } from "@/lib/tasks/service";
import {
  createCaseWriting,
  createCaseWritingFromSnapshots,
} from "@/lib/writings/service";
import type { StoredWritingSource } from "@/lib/writings/source-types";
import { createHelpRequest, getHelpRequest } from "../help/service";
import { caseSnapshot, snapshotHash, caseMetadataBlocks } from "./snapshot";
import {
  reportSchema,
  selectionSchema,
  type CaseJobPlan,
  type CaseJobView,
  type CaseReference,
} from "./types";

type Db = Prisma.TransactionClient;
export const changed = () =>
  httpError(
    "Cambió el acceso, equipo o expediente. Revisa el plan antes de continuar.",
    409,
  );
export async function prepareCasePlan(
  conversationId: string,
  objective: string,
  user: CausaAccessUser,
  db: Db = prisma,
): Promise<CaseJobPlan> {
  const { actor, conversation } = await conversationFor(
    conversationId,
    user,
    db,
    true,
  );
  if (!conversation.causaId)
    throw httpError(
      "Selecciona una causa en esta conversación antes de encargar su revisión.",
      409,
    );
  const snapshot = await caseSnapshot(conversation.causaId, actor, db);
  const destination = await icaroDestination(actor.id, {
    provider: "inherit",
    model: "",
  });
  if (!destination.permitted)
    throw httpError(
      "Configura un modelo permitido para Altazor antes de iniciar el encargo.",
      409,
    );
  const profiles = await db.altazorIcaro.findMany({
    where: {
      ownerId: actor.id,
      causaId: conversation.causaId,
      scopeKey: conversation.scopeKey,
      enabled: true,
    },
    orderBy: { name: "asc" },
  });
  const words = new Set(
    objective.toLocaleLowerCase("es").match(/[\p{L}]{4,}/gu),
  );
  const score = (p: (typeof profiles)[number]) =>
    (p.name + " " + p.instructions)
      .toLocaleLowerCase("es")
      .match(/[\p{L}]{4,}/gu)
      ?.filter((w) => words.has(w)).length || 0;
  profiles.sort(
    (a, b) =>
      score(b) - score(a) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );
  const team: CaseJobPlan["team"] = [];
  for (const p of profiles) {
    if (team.length === 2) break;
    const target = await icaroDestination(actor.id, p);
    if (target.permitted)
      team.push({
        id: p.id,
        name: p.name,
        revision: p.revision,
        useMemory: false,
        destination: target,
      });
  }
  return {
    version: 1,
    asOf: new Date().toISOString(),
    objective,
    snapshot,
    snapshotHash: snapshotHash(snapshot),
    destination,
    team,
  };
}
export function planPreview(plan: CaseJobPlan) {
  const counts = plan.snapshot;
  return `Datos disponibles al iniciar: ${new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" }).format(new Date(plan.asOf))}, hora de Chile. No se consultará OJV.\nRevisar «${counts.cause.titulo}»: ${counts.documents.length} documentos, ${counts.tasks.length} tareas y ${counts.deadlines.length} plazos registrados.\nObjetivo: ${plan.objective}\nAltazor: ${plan.destination.model} · ${plan.destination.endpoint} (${plan.destination.remote ? "remoto" : "local"}).\n${plan.team.length ? plan.team.map((p) => `Ícaro ${p.name}: ${p.destination.model} · ${p.destination.endpoint} (${p.destination.remote ? "remoto" : "local"}); sin memoria.`).join("\n") : "Altazor trabajará solo: no hay Ícaros habilitados con destino permitido en esta causa."}\nCompartir únicamente el expediente accesible indicado, por bloques. No copiar historial, adjuntos ni memoria personal.\nPreparar informe y propuestas; guardar tareas y borradores requiere una confirmación posterior. No actualizar OJV, enviar comunicaciones ni cerrar plazos.`;
}
export async function validateCasePlan(
  plan: CaseJobPlan,
  actor: CausaAccessUser,
  db: Db = prisma,
  excludedTasks: string[] = [],
) {
  if (
    plan.version !== 1 ||
    snapshotHash(
      await caseSnapshot(plan.snapshot.cause.id, actor, db, excludedTasks),
    ) !== plan.snapshotHash
  )
    throw changed();
  if (
    (await icaroDestination(actor.id, { provider: "inherit", model: "" }))
      .key !== plan.destination.key ||
    !plan.destination.permitted
  )
    throw changed();
  for (const member of plan.team) {
    const p = await db.altazorIcaro.findFirst({
      where: {
        id: member.id,
        ownerId: actor.id,
        causaId: plan.snapshot.cause.id,
        enabled: true,
        revision: member.revision,
      },
    });
    if (
      !p ||
      (await icaroDestination(actor.id, p)).key !== member.destination.key ||
      !member.destination.permitted
    )
      throw changed();
  }
}
export async function caseJobAccess(
  id: string,
  user: CausaAccessUser,
  db: Db = prisma,
  checkPlan = true,
) {
  const actor = await altazorActor(user, db);
  const job = await db.altazorCaseJob.findFirst({
    where: { id, ownerId: actor.id },
  });
  if (!job) throw httpError("Encargo no encontrado", 404);
  const { conversation } = await conversationFor(job.conversationId, actor, db);
  if (conversation.causaId !== job.causaId) throw changed();
  const plan = JSON.parse(job.planJson) as CaseJobPlan;
  if (plan.snapshot.cause.id !== job.causaId) throw changed();
  const origin = await db.altazorTurn.findFirst({
    where: {
      id: job.originTurnId,
      ownerId: actor.id,
      conversationId: job.conversationId,
    },
    select: { cancelRequestedAt: true },
  });
  if (!origin || origin.cancelRequestedAt) throw changed();
  if (checkPlan) {
    if (job.actorSessionVersion !== actor.sessionVersion) throw changed();
    const steps = await db.altazorCaseJobStep.findMany({
      where: { jobId: id, kind: "save_task", status: "completed" },
      select: { resultJson: true },
    });
    const excluded = steps.map(
      (s) => JSON.parse(s.resultJson).entityId as string,
    );
    await validateCasePlan(plan, actor, db, excluded);
  }
  return { actor, job, plan };
}
export async function createCaseJob(
  conversationId: string,
  originTurnId: string,
  requestId: string,
  plan: CaseJobPlan,
  user: CausaAccessUser,
  db: Db = prisma,
) {
  const { actor, conversation } = await conversationFor(
    conversationId,
    user,
    db,
    true,
  );
  if (conversation.causaId !== plan.snapshot.cause.id) throw changed();
  await validateCasePlan(plan, actor, db);
  const turn = await db.altazorTurn.findFirst({
    where: {
      id: originTurnId,
      ownerId: actor.id,
      conversationId,
      actorSessionVersion: actor.sessionVersion,
      status: "running",
      cancelRequestedAt: null,
      leaseToken: { not: null },
      leaseExpiresAt: { gt: new Date() },
    },
  });
  if (!turn?.planId) throw changed();
  const record = await db.assistantPlanRecord.findFirst({
    where: {
      id: turn.planId,
      ownerId: actor.id,
      status: { not: "cancelled" },
      expiresAt: { gt: new Date() },
    },
  });
  const approved = record
    ? (JSON.parse(record.planJson) as {
        needsConfirm?: boolean;
        steps?: { toolId: string; input: unknown; preview: string }[];
      })
    : null;
  if (
    !approved?.needsConfirm ||
    !approved.steps?.some(
      (step) =>
        step.toolId === "causa.encargar" &&
        canonicalJson(step.input) ===
          canonicalJson({
            objective: plan.objective,
            plan,
            planHash: snapshotHash(plan),
          }) &&
        step.preview === planPreview(plan),
    )
  )
    throw httpError("El encargo no tiene un equipo y alcance confirmados", 409);
  // Updating the origin serializes competing same-turn deliveries under Serializable.
  await db.altazorTurn.update({
    where: { id: turn.id },
    data: { updatedAt: new Date() },
  });
  const hash = snapshotHash({ conversationId, originTurnId, plan });
  const prior = await db.altazorCaseJob.findFirst({
    where: { ownerId: actor.id, OR: [{ requestId }, { originTurnId }] },
  });
  if (prior) {
    if (prior.inputSha256 !== hash) throw changed();
    return prior;
  }
  if (
    (await db.altazorCaseJob.count({
      where: {
        ownerId: actor.id,
        status: { in: ["queued", "running", "awaiting_help"] },
      },
    })) >= 10
  )
    throw httpError(
      "Termina o cancela un encargo pendiente antes de crear otro",
      429,
    );
  const metadataBlocks = caseMetadataBlocks(plan);
  const job = await db.altazorCaseJob.create({
    data: {
      ownerId: actor.id,
      causaId: conversation.causaId!,
      conversationId,
      originTurnId,
      requestId,
      inputSha256: hash,
      actorSessionVersion: actor.sessionVersion,
      objective: plan.objective,
      planJson: canonicalJson(plan),
      steps: {
        create: [
          ...plan.snapshot.documents.map((d, ordinal) => ({
            ordinal,
            kind: "capture",
            label: `Preparar ${d.nombre}`,
            dataJson: canonicalJson(d),
          })),
          ...metadataBlocks.map((text, i) => ({
            ordinal: 1_000_000 + i,
            kind: "analyze",
            label: `Revisar registros del expediente · bloque ${i + 1}`,
            dataJson: canonicalJson({ text, refs: [] }),
          })),
          {
            ordinal: 2_000_000_000,
            kind: "synthesis",
            label: "Consolidar el estado y los pendientes",
            dataJson: "{}",
          },
        ],
      },
    },
  });
  await writeAuditStrict(
    {
      actorId: actor.id,
      action: "altazor.case_job.create",
      entityType: "AltazorCaseJob",
      entityId: job.id,
      after: {
        causaId: job.causaId,
        team: plan.team.map((m) => m.id),
        documents: plan.snapshot.documents.length,
      },
    },
    db,
  );
  return job;
}
export async function jobReferences(
  jobId: string,
  db: Db = prisma,
  ids?: string[],
): Promise<CaseReference[]> {
  if (ids && !ids.length) return [];
  const ordinals = ids
    ? [
        ...new Set(
          ids.map((id) => 999_999 + Math.floor((Number(id.slice(1)) - 1) / 8)),
        ),
      ]
    : null;
  const rows = await db.altazorCaseJobStep.findMany({
    where: {
      jobId,
      kind: "analyze",
      ...(ordinals ? { ordinal: { in: ordinals } } : {}),
    },
    orderBy: { ordinal: "asc" },
    select: { dataJson: true, ordinal: true },
  });
  return rows.flatMap((r) =>
    (JSON.parse(r.dataJson).refs as CaseReference[]).filter(
      (ref) => !ids || ids.includes(ref.id),
    ),
  );
}
export async function verifyCaseReferences(
  refs: CaseReference[],
  job: AltazorCaseJob,
  actor: CausaAccessUser,
  db: Db = prisma,
) {
  for (let i = 0; i < refs.length; i += 8)
    await verifyAltazorSources(
      actor,
      refs.slice(i, i + 8).map((r) => r.source),
      { causaId: job.causaId, client: db },
    );
}
export async function readCaseJob(
  id: string,
  user: CausaAccessUser,
  afterStep = -1,
): Promise<CaseJobView> {
  const { job, actor, plan } = await caseJobAccess(id, user, prisma, false);
  let available = true;
  try {
    await caseJobAccess(id, actor);
  } catch {
    available = false;
  }
  const [steps, counts, saved] = await Promise.all([
    prisma.altazorCaseJobStep.findMany({
      where: { jobId: id, ordinal: { gt: afterStep } },
      orderBy: { ordinal: "asc" },
      take: 51,
      select: {
        id: true,
        ordinal: true,
        label: true,
        status: true,
        errorCode: true,
        kind: true,
      },
    }),
    prisma.altazorCaseJobStep.groupBy({
      by: ["kind", "status", "errorCode"],
      where: { jobId: id },
      _count: { _all: true },
    }),
    prisma.altazorCaseJobStep.findMany({
      where: {
        jobId: id,
        kind: { in: ["save_task", "save_draft"] },
        status: "completed",
      },
      select: { resultJson: true, label: true },
      orderBy: { ordinal: "asc" },
    }),
  ]);
  const count = (kind?: string, status?: string) =>
    counts
      .filter(
        (c) => (!kind || c.kind === kind) && (!status || c.status === status),
      )
      .reduce((n, c) => n + c._count._all, 0);
  let report =
    available && job.reportJson !== "{}"
      ? reportSchema.parse(JSON.parse(job.reportJson))
      : null;
  const references =
    available && report
      ? await jobReferences(
          id,
          prisma,
          report.citations.map((c) => c.sourceId),
        )
      : [];
  try {
    if (report) {
      if (
        report.citations.some(
          (c) =>
            !references
              .find((r) => r.id === c.sourceId)
              ?.source.text.includes(c.quote),
        )
      )
        throw changed();
      await verifyCaseReferences(
        references.filter((r) =>
          report!.citations.some((c) => c.sourceId === r.id),
        ),
        job,
        actor,
      );
      const delegated = await prisma.altazorCaseJobStep.findMany({
        where: { jobId: id, icaroJobId: { not: null }, status: "completed" },
        select: { icaroJobId: true },
      });
      const ids = delegated.map((s) => s.icaroJobId!);
      if (
        ids.length &&
        (await prisma.altazorIcaroJob.count({
          where: {
            id: { in: ids },
            ownerId: actor.id,
            status: "completed",
            actorSessionVersion: job.actorSessionVersion,
          },
        })) !== ids.length
      )
        throw changed();
    }
  } catch {
    available = false;
    report = null;
  }
  const help =
    available && job.helpRequestId
      ? await getHelpRequest(actor, job.helpRequestId).catch(() => null)
      : null;
  return {
    id: job.id,
    causaId: job.causaId,
    available,
    asOf: available ? plan.asOf : "",
    canResume:
      !["completed", "cancelled", "saving"].includes(job.status) &&
      (available || job.selectionJson === "null"),
    objective: available
      ? job.objective
      : "Encargo no disponible con las fuentes actuales",
    status: available ? job.status : "blocked",
    revision: job.revision,
    errorCode: available ? job.errorCode : "context_unavailable",
    report,
    references: report
      ? report.citations.map((c) => ({
          id: c.sourceId,
          title: references.find((r) => r.id === c.sourceId)!.source.title,
          href: references.find((r) => r.id === c.sourceId)!.source.href,
          quote: c.quote,
        }))
      : [],
    progress: {
      planned: available ? count() : 0,
      completed: available ? count(undefined, "completed") : 0,
      failed: available ? count(undefined, "failed") : 0,
    },
    coverage: {
      documents: available ? plan.snapshot.documents.length : 0,
      extracted: available ? count("capture", "completed") : 0,
      unavailable: available ? count("capture", "failed") : 0,
      partial: available
        ? counts
            .filter(
              (c) =>
                c.kind === "capture" && c.errorCode === "partial_extraction",
            )
            .reduce((n, c) => n + c._count._all, 0)
        : 0,
    },
    steps: available
      ? steps.slice(0, 50).map((s) => ({
          id: s.id,
          label: s.label,
          status: s.status,
          errorCode: s.errorCode,
        }))
      : [],
    nextStep: available && steps.length > 50 ? steps[49].ordinal : null,
    receipts: available
      ? saved.map((s) => ({ ...JSON.parse(s.resultJson), title: s.label }))
      : [],
    help: help
      ? { id: help.id, question: help.question, status:["pending","answered"].includes(help.status)&&new Date(help.expiresAt)<=new Date()?"expired":help.status, notificationStatus:help.notificationStatus }
      : null,
    savedSelection: available ? JSON.parse(job.selectionJson) : null,
    coordinator:available?{provider:plan.destination.provider,model:plan.destination.model}:null,team:available?plan.team.map(m=>({name:m.name,provider:m.destination.provider,model:m.destination.model})):[],
    pendingPlan:
      available && job.status === "awaiting_plan"
        ? { preview: planPreview(plan), hash: snapshotHash(plan) }
        : null,
  };
}
export async function cancelCaseJob(
  id: string,
  user: CausaAccessUser,
  revision: number,
) {
  const result = await serializable(async (tx) => {
    const { job, actor } = await caseJobAccess(id, user, tx, false);
    if (job.status === "cancelled") return job;
    if (job.revision !== revision || job.status === "completed")
      throw changed();
    await tx.altazorCaseJobStep.updateMany({
      where: { jobId: id, status: { in: ["queued", "running", "waiting"] } },
      data: { status: "cancelled", leaseToken: null, leaseExpiresAt: null },
    });
    if (job.helpRequestId)
      await tx.altazorHelpRequest.updateMany({
        where: {
          id: job.helpRequestId,
          ownerId: actor.id,
          status: { in: ["pending", "answered"] },
        },
        data: { status: "cancelled" },
      });
    await writeAuditStrict(
      {
        actorId: actor.id,
        action: "altazor.case_job.cancel",
        entityType: "AltazorCaseJob",
        entityId: id,
      },
      tx,
    );
    return tx.altazorCaseJob.update({
      where: { id },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        revision: { increment: 1 },
      },
    });
  });
  const delegates = await prisma.altazorCaseJobStep.findMany({
    where: { jobId: id, icaroJobId: { not: null } },
    select: { icaroJobId: true },
  });
  // A child may have committed before its parent checkpoint was recorded.
  const unlinked = await prisma.altazorIcaroJob.findMany({
    where: {
      ownerId: user.id,
      status: { in: ["queued", "running"] },
      contextJson: { contains: id },
    },
    select: { id: true, contextJson: true },
  });
  const children = new Set(delegates.map((d) => d.icaroJobId!));
  for (const row of unlinked) {
    try {
      if (JSON.parse(row.contextJson).origin?.caseJobId === id)
        children.add(row.id);
    } catch {
      /* Do not touch unverified origins. */
    }
  }
  for (const child of children)
    await cancelIcaroJob(child, user).catch(() => null);
  return result;
}
export async function confirmCaseProposals(
  id: string,
  raw: unknown,
  user: CausaAccessUser,
) {
  const input = selectionSchema.parse(raw);
  if (new Set(input.proposals.map((p) => p.id)).size !== input.proposals.length)
    throw httpError("Hay propuestas repetidas", 400);
  await serializable(async (tx) => {
    const { job, actor } = await caseJobAccess(id, user, tx);
    const stored = JSON.parse(job.selectionJson);
    if (stored) {
      if (canonicalJson(stored) !== canonicalJson(input)) throw changed();
      if (job.status === "partial")
        await tx.altazorCaseJob.update({
          where: { id },
          data: { status: "saving", revision: { increment: 1 } },
        });
      return;
    }
    if (
      job.status !== "awaiting_review" ||
      job.revision !== input.expectedRevision
    )
      throw changed();
    const report = reportSchema.parse(JSON.parse(job.reportJson));
    const valid = new Set([
      ...report.tasks.map((_, i) => `task-${i}`),
      ...(report.draft ? ["draft"] : []),
    ]);
    if (input.proposals.some((p) => !valid.has(p.id)))
      throw httpError("Propuesta no disponible", 400);
    for (const p of input.proposals)
      if (p.id === "draft" ? p.title.length > 200 : p.body.length > 5000)
        throw httpError(
          "El texto de una propuesta excede el límite del registro",
          400,
        );
    const refs = await jobReferences(
      id,
      tx,
      report.citations.map((c) => c.sourceId),
    );
    await verifyCaseReferences(
      refs.filter((r) => report.citations.some((c) => c.sourceId === r.id)),
      job,
      actor,
      tx,
    );
    await tx.altazorCaseJobStep.createMany({
      data: input.proposals.map((p, i) => ({
        jobId: id,
        ordinal: 2_000_000_001 + i,
        kind: p.id === "draft" ? "save_draft" : "save_task",
        label: p.title,
        dataJson: canonicalJson(p),
      })),
    });
    await tx.altazorCaseJob.update({
      where: { id },
      data: {
        selectionJson: canonicalJson(input),
        status: input.proposals.length ? "saving" : "completed",
        revision: { increment: 1 },
      },
    });
    await writeAuditStrict(
      {
        actorId: actor.id,
        action: "altazor.case_job.confirm_records",
        entityType: "AltazorCaseJob",
        entityId: id,
        after: { count: input.proposals.length, requestId: input.requestId },
      },
      tx,
    );
  });
  // Explicit confirmation executes internal writes now; background preferences never auto-confirm.
  await saveSelectedProposals(id, user);
  return readCaseJob(id, user);
}
export async function saveSelectedProposals(id: string, user: CausaAccessUser) {
  const steps = await prisma.altazorCaseJobStep.findMany({
    where: {
      jobId: id,
      kind: { in: ["save_task", "save_draft"] },
      status: { in: ["queued", "failed"] },
    },
    orderBy: { ordinal: "asc" },
  });
  for (const step of steps) {
    try {
      await serializable(async (tx) => {
        const { job, actor } = await caseJobAccess(id, user, tx);
        if (job.status !== "saving" || job.cancelledAt) throw changed();
        const current = await tx.altazorCaseJobStep.findUniqueOrThrow({
          where: { id: step.id },
        });
        if (current.status === "completed") return;
        const proposal = JSON.parse(current.dataJson) as {
          id: string;
          title: string;
          body: string;
        };
        const report = reportSchema.parse(JSON.parse(job.reportJson));
        let entityId: string, href: string;
        if (step.kind === "save_task") {
          const index = Number(proposal.id.slice(5));
          const refs = await jobReferences(
            id,
            tx,
            report.tasks[index].sourceIds,
          );
          await verifyCaseReferences(refs, job, actor, tx);
          await assertCausaCapability(job.causaId, actor, "causa.write", tx);
          const task = await createTask(
            actor,
            {
              title: proposal.title,
              description: proposal.body,
              causaId: job.causaId,
              clienteId: JSON.parse(job.planJson).snapshot.cause.clienteId,
              assigneeId: actor.id,
              origen: "asistente",
            },
            tx,
          );
          entityId = task.id;
          href = "/tareas";
        } else {
          const selected = await jobReferences(id, tx, report.draft!.sourceIds);
          await verifyCaseReferences(selected, job, actor, tx);
          const map = new Map(selected.map((r, i) => [r.id, `R${i + 1}`]));
          if (
            [...proposal.body.matchAll(/\[(?:\^)?(R[1-9][0-9]*)\]/g)].some(
              (m) => !map.has(m[1]),
            )
          )
            throw httpError(
              "El borrador contiene citas sin una fuente incorporada",
              400,
            );
          const body = proposal.body.replace(
            /\[(?:\^)?(R[1-9][0-9]*)\]/g,
            (_, ref) => `[^${map.get(ref)}]`,
          );
          const data = {
            requestId: `case-job-${step.id}`,
            title: proposal.title,
            body,
          };
          const sources = selected.map((r) => {
            const proof = JSON.parse(r.source.proofJson);
            if (proof.kind !== "writing") throw changed();
            return proof.value as StoredWritingSource;
          });
          const result = sources.length
            ? await createCaseWritingFromSnapshots(
                job.causaId,
                data,
                sources,
                actor,
                tx,
              )
            : await createCaseWriting(job.causaId, data, actor, tx);
          entityId = result.draft.id;
          href = `/causas/${job.causaId}/escritos?draft=${entityId}`;
        }
        await tx.altazorCaseJobStep.update({
          where: { id: step.id },
          data: {
            status: "completed",
            resultJson: canonicalJson({ entityId, href }),
            errorCode: null,
          },
        });
      });
    } catch {
      await prisma.altazorCaseJobStep.updateMany({
        where: { id: step.id, status: { not: "completed" } },
        data: { status: "failed", errorCode: "save_failed" },
      });
    }
  }
  await serializable(async (tx) => {
    const { job } = await caseJobAccess(id, user, tx, false);
    if (job.status !== "saving") return;
    const pending = await tx.altazorCaseJobStep.count({
      where: {
        jobId: id,
        kind: { in: ["save_task", "save_draft"] },
        status: { not: "completed" },
      },
    });
    await tx.altazorCaseJob.update({
      where: { id },
      data: {
        status: pending ? "partial" : "completed",
        revision: { increment: 1 },
        errorCode: pending ? "save_failed" : null,
      },
    });
  });
}
export async function requestCaseHelp(
  job: AltazorCaseJob,
  question: string,
  user: CausaAccessUser,
  client?: Db,
) {
  const run = async (db: Db) => {
    const current = await caseJobAccess(job.id, user, db);
    if (current.job.cancelledAt || current.job.revision !== job.revision)
      throw changed();
    const help = await createHelpRequest(
      current.actor,
      {
        requestKey: `case-job:${job.id}:${job.revision}`,
        question,
        caseJobId: job.id,
        conversationId: job.conversationId,
        scopeKind: "causa",
        scopeId: job.causaId,
        expiresInMinutes: 1440,
      },
      db,
    );
    await db.altazorCaseJob.update({
      where: { id: job.id },
      data: {
        helpRequestId: help.id,
        status: "awaiting_help",
        revision: { increment: 1 },
      },
    });
  };
  return client ? run(client) : serializable(run);
}

/** Refreshing scope prepares a new plan; it never authorizes new providers implicitly. */
export async function resumeCaseJob(
  id: string,
  user: CausaAccessUser,
  expectedRevision: number,
  confirmation?: string,
) {
  const { job, actor, plan } = await caseJobAccess(id, user, prisma, false);
  if (
    job.revision !== expectedRevision ||
    ["completed", "cancelled", "saving"].includes(job.status)
  )
    throw changed();
  if (job.status === "awaiting_plan") {
    if (confirmation !== snapshotHash(plan))
      throw httpError("Confirma el plan actualizado antes de continuar", 409);
    await serializable(async (tx) => {
      const current = await caseJobAccess(id, user, tx);
      if (
        current.job.revision !== expectedRevision ||
        current.job.status !== "awaiting_plan"
      )
        throw changed();
      await tx.altazorCaseJob.update({
        where: { id },
        data: { status: "queued", revision: { increment: 1 }, errorCode: null },
      });
      await writeAuditStrict(
        {
          actorId: actor.id,
          action: "altazor.case_job.confirm_refresh",
          entityType: "AltazorCaseJob",
          entityId: id,
        },
        tx,
      );
    });
    return readCaseJob(id, user);
  }
  if (job.status === "awaiting_help" && job.helpRequestId) {
    const help = await getHelpRequest(actor, job.helpRequestId).catch(
      () => null,
    );
    if (help && (["expired", "cancelled"].includes(help.status)||new Date(help.expiresAt)<=new Date())) {
      await requestCaseHelp(job, help.question, actor);
      return readCaseJob(id, user);
    }
  }
  let same = true;
  try {
    await caseJobAccess(id, user);
  } catch {
    same = false;
  }
  if (same) {
    await serializable(async (tx) => {
      const current = await caseJobAccess(id, user, tx);
      if (current.job.revision !== expectedRevision) throw changed();
      if (current.job.status === "partial") {
        await tx.altazorCaseJob.update({
          where: { id },
          data: {
            status: "saving",
            revision: { increment: 1 },
            errorCode: null,
          },
        });
      } else {
        if (!["interrupted", "blocked"].includes(current.job.status))
          throw changed();
        const retrySteps = await tx.altazorCaseJobStep.findMany({
          where: { jobId: id, status: { in: ["failed", "running"] } },
        });
        for (const step of retrySteps) {
          const data = JSON.parse(step.dataJson);
          delete data.operationKey;
          await tx.altazorCaseJobStep.update({
            where: { id: step.id },
            data: {
              status: "queued",
              attempts: 0,
              icaroJobId: null,
              leaseToken: null,
              leaseExpiresAt: null,
              errorCode: null,
              dataJson: canonicalJson(data),
            },
          });
        }
        await tx.altazorCaseJob.update({
          where: { id },
          data: {
            status: "queued",
            revision: { increment: 1 },
            errorCode: null,
          },
        });
      }
      await writeAuditStrict(
        {
          actorId: actor.id,
          action: "altazor.case_job.resume",
          entityType: "AltazorCaseJob",
          entityId: id,
        },
        tx,
      );
    });
    return readCaseJob(id, user);
  }
  if (job.selectionJson !== "null")
    throw httpError(
      "El expediente cambió después de confirmar registros. Conservamos los recibos: prepara un nuevo encargo para revisar lo pendiente.",
      409,
    );
  const fresh = await prepareCasePlan(job.conversationId, job.objective, actor);
  await serializable(async (tx) => {
    const current = await caseJobAccess(id, user, tx, false);
    if (current.job.revision !== expectedRevision || current.job.cancelledAt)
      throw changed();
    await validateCasePlan(fresh, actor, tx);
    const sameModels =
      canonicalJson(plan.team) === canonicalJson(fresh.team) &&
      plan.destination.key === fresh.destination.key &&
      job.actorSessionVersion === actor.sessionVersion;
    const metadata = (p: CaseJobPlan) => ({ ...p.snapshot, documents: [] });
    const sameMetadata =
      snapshotHash(metadata(plan)) === snapshotHash(metadata(fresh)) &&
      santiagoDateKey(new Date(plan.asOf)) ===
        santiagoDateKey(new Date(fresh.asOf));
    const unchanged = new Set(
      fresh.snapshot.documents
        .filter((d) =>
          plan.snapshot.documents.some(
            (old) => canonicalJson(old) === canonicalJson(d),
          ),
        )
        .map((d) => d.id),
    );
    const steps = await tx.altazorCaseJobStep.findMany({
      where: { jobId: id },
      orderBy: { ordinal: "asc" },
    });
    const remove = steps.filter((s) => {
      const data = JSON.parse(s.dataJson);
      if (s.kind === "capture") return !sameModels || !unchanged.has(data.id);
      if (s.kind === "analyze")
        return (
          !sameModels ||
          (data.documentId ? !unchanged.has(data.documentId) : !sameMetadata)
        );
      return true;
    });
    const removed = new Set(remove.map((s) => s.id));
    await tx.altazorCaseJobStep.deleteMany({
      where: { jobId: id, id: { in: [...removed] } },
    });
    const kept = steps.filter((s) => !removed.has(s.id));
    let captureOrdinal =
      Math.max(
        -1,
        ...kept.filter((s) => s.kind === "capture").map((s) => s.ordinal),
      ) + 1;
    for (const d of fresh.snapshot.documents)
      if (
        !kept.some(
          (s) => s.kind === "capture" && JSON.parse(s.dataJson).id === d.id,
        )
      )
        await tx.altazorCaseJobStep.create({
          data: {
            jobId: id,
            ordinal: captureOrdinal++,
            kind: "capture",
            label: `Preparar ${d.nombre}`,
            dataJson: canonicalJson(d),
          },
        });
    let analysisOrdinal =
      Math.max(
        999_999,
        ...kept.filter((s) => s.kind === "analyze").map((s) => s.ordinal),
      ) + 1;
    if (!sameModels || !sameMetadata) {
      for (const text of caseMetadataBlocks(fresh))
        await tx.altazorCaseJobStep.create({
          data: {
            jobId: id,
            ordinal: analysisOrdinal++,
            kind: "analyze",
            label: "Revisar registros actualizados",
            dataJson: canonicalJson({ refs: [], text }),
          },
        });
    }
    for (const s of kept.filter(
      (s) => s.kind === "analyze" && s.status === "completed",
    ))
      await tx.altazorCaseJobStep.create({
        data: {
          jobId: id,
          ordinal: 1_000_000_000 + s.ordinal,
          kind: "consolidate",
          label: "Integrar análisis conservado",
          dataJson: canonicalJson({
            analysisId: s.id,
            refs: JSON.parse(s.dataJson).refs || [],
          }),
        },
      });
    const retrySteps = await tx.altazorCaseJobStep.findMany({
      where: { jobId: id, status: { in: ["failed", "running", "waiting"] } },
    });
    for (const step of retrySteps) {
      const data = JSON.parse(step.dataJson);
      delete data.operationKey;
      await tx.altazorCaseJobStep.update({
        where: { id: step.id },
        data: {
          status: "queued",
          attempts: 0,
          icaroJobId: null,
          leaseToken: null,
          leaseExpiresAt: null,
          errorCode: null,
          dataJson: canonicalJson(data),
        },
      });
    }
    await tx.altazorCaseJobStep.create({
      data: {
        jobId: id,
        ordinal: 2_000_000_000,
        kind: "synthesis",
        label: "Consolidar el estado y los pendientes",
      },
    });
    if (current.job.helpRequestId)
      await tx.altazorHelpRequest.updateMany({
        where: {
          id: current.job.helpRequestId,
          status: { in: ["pending", "answered"] },
        },
        data: { status: "cancelled" },
      });
    await tx.altazorCaseJob.update({
      where: { id },
      data: {
        planJson: canonicalJson(fresh),
        actorSessionVersion: actor.sessionVersion,
        status: "awaiting_plan",
        reportJson: "{}",
        helpRequestId: null,
        errorCode: null,
        revision: { increment: 1 },
      },
    });
    await writeAuditStrict(
      {
        actorId: actor.id,
        action: "altazor.case_job.refresh_plan",
        entityType: "AltazorCaseJob",
        entityId: id,
        after: {
          retained: kept.filter((s) => s.status === "completed").length,
        },
      },
      tx,
    );
  });
  return readCaseJob(id, user);
}
