import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { withRejectedAudit } from "@/lib/testing/audit-failure";
import { serializable } from "@/lib/command-execution";
import {
  createAltazorTurn,
  executeAltazorTurn,
  readAltazorConversation,
  altazorDestination,
  createAltazorConversation,
} from "../conversations";
import { createIcaro, saveIcaroMemory, forgetIcaroMemory } from "../icaros/service";
import { encryptSecret, hashDestino, sha256Hex } from "@/lib/notify/secrets";
import { createWhatsAppMetaProvider } from "@/lib/notify/providers/whatsapp";
import { answerHelpRequest, helpWorkerQueue, notifyHelpRequest, pollHelpReplies } from "../help/service";
import { saveHelpChannelConfig, saveWhatsAppMetaConfig } from "../help/config";
import { processWhatsAppHelpWebhook } from "../help/whatsapp";
import {
  prepareCasePlan,
  planPreview,
  createCaseJob,
  readCaseJob,
  confirmCaseProposals,
  cancelCaseJob,
  resumeCaseJob,
} from "./service";
import { advanceCaseJob, processCaseJobs, validateReport } from "./worker";
import { caseJobConversationResult } from "./conversation";
import { snapshotHash } from "./snapshot";
import { savedAnswer } from "@/lib/assistant/tools/workflow-access";
import { emptyReport } from "./types";

const status = (code: number) => (e: unknown) =>
  (e as { status?: number }).status === code;

// Boot a fresh worker process with the same database, racing two recovery passes while offline.
async function restartedHelpWorker(jobId: string, ownerId: string) {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  const owner = { id: ownerId, role: "abogado" };
  const offline = async () => { throw Error("Fixture transport unavailable"); };
  globalThis.fetch = offline;
  try {
    await helpWorkerQueue();
    let workers = 0;
    const ready = Promise.withResolvers<void>();
    const options = { ask: offline, help: { notify: async () => {
      if (++workers === 2) ready.resolve();
      await ready.promise;
      return offline();
    }, poll: offline } };
    await Promise.all([advanceCaseJob(jobId, owner, options), advanceCaseJob(jobId, owner, options)]);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  assert.equal(
    assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL),
    new URL(process.env.DATABASE_URL!).toString(),
  );
  assert(!process.env.S3_BUCKET);
  const previousEnv = { ...process.env },
    oldFetch = globalThis.fetch;
  const tag = randomUUID(),
    users: string[] = [],
    causes: string[] = [],
    clients: string[] = [];
  const fixtureProviders = ["llm", "llm-local", "hermes", "whatsapp_meta"];
  const configs = await prisma.integrationConfig.findMany({ where: { provider: { in: fixtureProviders } } });
  const priorFirm=await prisma.firmSettings.findFirst();
  let firm=priorFirm, ownedOrganization="";
  let askQuestion = false,
    hold = false;
  const gate: { started?: () => void; release?: () => void } = {};
  const calls: { model: string; text: string }[] = [];
  Object.assign(process.env, {
    LLM_API_URL: "https://203.0.113.10/v1",
    LLM_MODEL: "study-default",
    LLM_API_KEY: "fictitious-only",
    LLM_ALLOW_DEMO: "0",
  });
  globalThis.fetch = async (input, init) => {
    assert.equal(
      String(input),
      "https://203.0.113.10/v1/chat/completions",
      "no real provider traffic",
    );
    const body = JSON.parse(String(init?.body)) as {
      model: string;
      messages: { content: string }[];
    };
    const text = body.messages.map((m) => m.content).join("\n");
    calls.push({ model: body.model, text });
    gate.started?.();
    if (hold)
      await new Promise<void>((resolve) => {
        gate.release = resolve;
      });
    let content =
      "Análisis ficticio con el material explícito; requiere revisión profesional.";
    if (body.messages[0].content.includes("Devuelve SOLO JSON")) {
      const data = JSON.parse(body.messages.at(-1)!.content);
      const source = data.sources.find((r: { text?: string }) => r.text);
      const citation = source
        ? { sourceId: source.id, quote: source.text.slice(0, 45) }
        : data.previous.citations[0];
      content = JSON.stringify({
        ...emptyReport(),
        summary: "Revisión ficticia preparada para cotejo.",
        needs: ["Revisar el respaldo antes de actuar."],
        tasks: [
          {
            title: "Cotejar respaldo ficticio",
            description: "Verificar los antecedentes del expediente.",
            sourceIds: citation ? [citation.sourceId] : [],
          },
        ],
        draft: {
          title: "Borrador ficticio",
          body: citation
            ? `Propuesta para revisar [${citation.sourceId}]`
            : "Propuesta sin cita documental; revisar.",
          sourceIds: citation ? [citation.sourceId] : [],
        },
        citations: citation ? [citation] : [],
        question:
          askQuestion && data.stage.startsWith("Revisión final") && !data.help
            ? "¿Qué antecedente debemos solicitar primero?"
            : null,
      });
    }
    return Response.json({ choices: [{ message: { content } }] });
  };
  try {
    await prisma.integrationConfig.deleteMany({
      where: { provider: { in: fixtureProviders } },
    });
    if(!firm){const organization=await prisma.organization.create({data:{name:`Case jobs fictitious ${tag}`,settings:{create:{assistantLlmMode:"remote_allowed",hermesAllowDemo:false}}},include:{settings:true}});ownedOrganization=organization.id;firm=organization.settings!;}
    await prisma.firmSettings.update({
      where: { id: firm.id },
      data: { assistantLlmMode: "remote_allowed", hermesAllowDemo: false },
    });
    for (const role of ["abogado", "abogado", "admin"])
      users.push(
        (
          await prisma.user.create({
            data: {
              name: tag,
              email: `${randomUUID()}@case-job.invalid`,
              password: "not-a-login",
              role,
            },
          })
        ).id,
      );
    const owner = { id: users[0], role: "abogado" },
      other = { id: users[1], role: "abogado" };
    await prisma.user.update({
      where: { id: owner.id },
      data: { capabilityRevokes: "doc.privileged.read" },
    });
    const client = await prisma.cliente.create({
      data: { razonSocial: `Cliente ficticio ${tag}` },
    });
    clients.push(client.id);
    const cause = await prisma.causa.create({
      data: {
        titulo: `Trabajo ${tag}`,
        clienteId: client.id,
        tribunal: "Tribunal ficticio",
        materia: "civil",
        abogadoId: owner.id,
      },
    });
    causes.push(cause.id);
    const hidden = await prisma.causa.create({
      data: {
        titulo: `Reservada ${tag}`,
        tribunal: "Ficticio",
        materia: "civil",
        abogadoId: other.id,
        acceso: "equipo",
      },
    });
    causes.push(hidden.id);
    const doc = await prisma.documento.create({
      data: {
        nombre: "Respaldo ficticio.txt",
        contenido:
          "El comprobante ficticio registra un pago que debe ser cotejado. Documento de prueba sin valor jurídico.",
        extractionStatus: "completed",
        causaId: cause.id,
        autorId: owner.id,
      },
    });
    await prisma.documento.create({
      data: {
        nombre: "Secreto.txt",
        contenido: "OTHER_CASE_SECRET",
        causaId: hidden.id,
        autorId: other.id,
      },
    });
    await prisma.documento.create({
      data: {
        nombre: "Privilegiado.txt",
        contenido: "PRIVILEGED_NOT_GRANTED",
        causaId: cause.id,
        autorId: other.id,
        privilegio: true,
      },
    });
    const deadline = await prisma.plazo.create({
      data: {
        titulo: "Plazo ficticio registrado",
        tipo: "judicial",
        fechaLimite: new Date("2088-01-10T12:00:00Z"),
        causaId: cause.id,
        responsableId: owner.id,
      },
    });
    const { conversation } = await createAltazorConversation(
      {
        requestId: randomUUID(),
        causaId: cause.id,
        title: "Encargos ficticios",
      },
      owner,
    );
    const profile = (
      await createIcaro(
        {
          requestId: randomUUID(),
          causaId: cause.id,
          name: "Revisor de antecedentes",
          instructions: "Cotejar material explícito.",
          provider: "study",
          model: "review-specialist",
          memoryEnabled: true,
          confirmed: true,
        },
        owner,
      )
    ).icaro;
    await saveIcaroMemory(
      profile.id,
      {
        requestId: randomUUID(),
        label: "Recuerdo privado",
        body: "ICARO_MEMORY_NOT_SELECTED",
        sources: [],
        confirmed: true,
      },
      owner,
    );
    const approvedMemory = (await saveIcaroMemory(profile.id, {
      requestId: randomUUID(), label: "Criterio elegido", body: "ONLY_SELECTED_SPECIALIST_MEMORY", sources: [], confirmed: true,
    }, owner)).memory;
    const memoryRef = { id: approvedMemory.id, revision: approvedMemory.revision, hash: approvedMemory.hash };
    const chosenMemories = [{ icaroId: profile.id, entries: [memoryRef] }];
    const make = async (concurrent = true, includeMemory = false) => {
      const plan = await prepareCasePlan(
        conversation.id,
        "Revisa esta causa, organiza pendientes y prepara un borrador",
        owner, prisma, includeMemory ? chosenMemories : [],
      );
      assert.deepEqual(
        plan.snapshot.documents.map((d) => d.id),
        [doc.id],
      );
      assert.equal(plan.team[0].useMemory, includeMemory);
      if (includeMemory) {
        assert.match(planPreview(plan), /Criterio elegido/);
        assert.doesNotMatch(planPreview(plan), /ONLY_SELECTED_SPECIALIST_MEMORY|Recuerdo privado/);
      }
      const planId = `altazor-${randomUUID()}`;
      await prisma.assistantPlanRecord.create({
        data: {
          id: planId,
          ownerId: owner.id,
          expiresAt: new Date(Date.now() + 60000),
          planJson: JSON.stringify({
            id: planId,
            needsConfirm: true,
            steps: [
              {
                toolId: "causa.encargar",
                input: {
                  objective: plan.objective,
                  plan,
                  planHash: snapshotHash(plan),
                },
                preview: planPreview(plan),
              },
            ],
          }),
        },
      });
      const ordinal = await prisma.altazorTurn.count({
        where: { conversationId: conversation.id },
      });
      const turn = await prisma.altazorTurn.create({
        data: {
          conversationId: conversation.id,
          ownerId: owner.id,
          requestId: randomUUID(),
          ordinal: ordinal + 1,
          planId,
          inputSha256: tag,
          actorSessionVersion: 0,
          userText: plan.objective,
          status: "running",
          leaseToken: randomUUID(),
          leaseExpiresAt: new Date(Date.now() + 120000),
          contextJson: JSON.stringify({
            version: 1,
            attachmentIds: [],
            refs: [],
            historyTurnIds: [],
            memoryDependencies: [],
            ...(includeMemory ? { icaroMemorySelections: chosenMemories } : {}),
          }),
        },
      });
      const request = randomUUID();
      const create = () =>
        serializable((tx) =>
          createCaseJob(conversation.id, turn.id, request, plan, owner, tx),
        );
      const jobs = concurrent
        ? await Promise.all([create(), create()])
        : [await create(), await create()];
      assert.equal(jobs[0].id, jobs[1].id);
      await prisma.altazorTurn.update({
        where: { id: turn.id },
        data: {
          status: "completed",
          leaseToken: null,
          leaseExpiresAt: null,
          resultsJson: JSON.stringify([
            {
              toolId: "causa.encargar",
              result: {
                ok: true,
                message: "Encargo creado",
                entityId: jobs[0].id,
                card: { type: "case-job", id: jobs[0].id },
              },
            },
          ]),
        },
      });
      await prisma.altazorConversation.update({
        where: { id: conversation.id },
        data: { nextOrdinal: ordinal + 2, revision: { increment: 1 } },
      });
      return jobs[0];
    };
    const run = async (id: string) => {
      for (let i = 0; i < 100; i++) {
        const row = await prisma.altazorCaseJob.findUniqueOrThrow({
          where: { id },
        });
        if (!["queued", "running"].includes(row.status))
          return readCaseJob(id, owner);
        await advanceCaseJob(id, owner);
      }
      throw Error("Fixture exceeded its finite stages");
    };
    await withRejectedAudit(owner.id, "altazor.case_job.create", async () => {
      await assert.rejects(make(false));
      assert.equal(
        await prisma.altazorCaseJob.count({ where: { ownerId: owner.id } }),
        0,
      );
    });
    await prisma.altazorTurn.updateMany({
      where: { conversationId: conversation.id, status: "running" },
      data: { status: "failed", leaseToken: null, leaseExpiresAt: null },
    });
    const job = await make(true, true);
    await assert.rejects(readCaseJob(job.id, other), status(404));
    await assert.rejects(
      confirmCaseProposals(
        job.id,
        {
          requestId: randomUUID(),
          expectedRevision: job.revision,
          proposals: [],
        },
        owner,
      ),
      status(409),
    );
    await assert.rejects(
      confirmCaseProposals(
        job.id,
        {
          requestId: randomUUID(),
          expectedRevision: job.revision,
          proposals: [],
        },
        other,
      ),
      status(404),
    );
    await prisma.altazorCompanion.create({
      data: { ownerId: owner.id, backgroundEnabled: false },
    });
    assert.equal((await processCaseJobs()).considered, 0);
    await prisma.altazorCaseJob.update({
      where: { id: job.id },
      data: { createdAt: new Date("2000-01-01") },
    });
    await prisma.altazorCompanion.update({
      where: { ownerId: owner.id },
      data: { backgroundEnabled: true },
    });
    await Promise.all([processCaseJobs(), advanceCaseJob(job.id, owner)]);
    assert.equal(
      await prisma.altazorCaseJobStep.count({
        where: { jobId: job.id, kind: "capture", status: "completed" },
      }),
      1,
    );
    await advanceCaseJob(job.id, owner);
    const checkpoint = await prisma.altazorCaseJobStep.findFirstOrThrow({
      where: { jobId: job.id, kind: "analyze", status: "completed" },
    });
    const callsBeforeRecovery = calls.length,
      childrenBeforeRecovery = await prisma.altazorIcaroJob.count({
        where: { ownerId: owner.id },
      });
    await prisma.altazorCaseJobStep.deleteMany({
      where: { jobId: job.id, ordinal: 1_000_000_000 + checkpoint.ordinal },
    });
    await prisma.altazorCaseJobStep.update({
      where: { id: checkpoint.id },
      data: {
        status: "running",
        leaseToken: "host-stopped-after-child-commit",
        leaseExpiresAt: new Date(0),
        icaroJobId: null,
        resultJson: "{}",
      },
    });
    await advanceCaseJob(job.id, owner);
    assert.equal(
      calls.length,
      callsBeforeRecovery,
      "a completed child receipt is recovered without another model call",
    );
    assert.equal(
      await prisma.altazorIcaroJob.count({ where: { ownerId: owner.id } }),
      childrenBeforeRecovery,
    );
    const recovered = await prisma.altazorCaseJobStep.findUniqueOrThrow({
      where: { id: checkpoint.id },
    });
    await prisma.altazorCaseJobStep.deleteMany({
      where: { jobId: job.id, ordinal: 1_000_000_000 + checkpoint.ordinal },
    });
    await prisma.altazorCaseJobStep.update({
      where: { id: checkpoint.id },
      data: { status: "waiting", leaseToken: null, leaseExpiresAt: null },
    });
    await prisma.altazorIcaroJob.update({
      where: { id: recovered.icaroJobId! },
      data: {
        status: "running",
        leaseToken: "another-worker",
        leaseExpiresAt: new Date(Date.now() + 60000),
      },
    });
    await advanceCaseJob(job.id, owner);
    assert.equal(
      (
        await prisma.altazorCaseJobStep.findUniqueOrThrow({
          where: { id: checkpoint.id },
        })
      ).attempts,
      recovered.attempts,
      "polling an existing child does not reset the attempt budget",
    );
    await prisma.altazorIcaroJob.update({
      where: { id: recovered.icaroJobId! },
      data: { status: "completed", leaseToken: null, leaseExpiresAt: null },
    });
    await advanceCaseJob(job.id, owner);
    assert.equal(calls.length, callsBeforeRecovery);
    const review = await run(job.id);
    assert.equal(review.status, "awaiting_review");
    const finalStage = await prisma.altazorCaseJobStep.findFirstOrThrow({
      where: { jobId: job.id, kind: "synthesis" },
    });
    assert.equal(finalStage.status, "completed");
    await prisma.altazorCaseJobStep.createMany({
      data: Array.from({ length: 51 }, (_, i) => ({
        jobId: job.id,
        ordinal: 1_500_000_000 + i,
        kind: "history-fixture",
        label: `Acción histórica ficticia ${i}`,
        status: "completed",
      })),
    });
    const firstPage = await readCaseJob(job.id, owner);
    assert.equal(firstPage.steps.length, 50);
    assert.notEqual(firstPage.nextStep, null);
    const secondPage = await readCaseJob(job.id, owner, firstPage.nextStep!);
    assert.equal(
      new Set([...firstPage.steps, ...secondPage.steps].map((s) => s.id)).size,
      firstPage.progress.planned,
    );

    assert.equal(review.coverage.extracted, 1);
    assert(review.references.length);
    assert.equal(await prisma.task.count({ where: { causaId: cause.id } }), 0);
    assert.equal(
      await prisma.caseWritingDraft.count({ where: { causaId: cause.id } }),
      0,
    );
    assert(calls.some((c) => c.model === "review-specialist"));
    assert(calls.some((c) => c.model === "study-default"));
    assert(calls.some(c => c.model === "review-specialist" && c.text.includes("ONLY_SELECTED_SPECIALIST_MEMORY")));
    assert(calls.filter(c => c.model === "study-default").every(c => !c.text.includes("ONLY_SELECTED_SPECIALIST_MEMORY")));
    assert(
      calls.every(
        (c) =>
          ![
            "OTHER_CASE_SECRET",
            "PRIVILEGED_NOT_GRANTED",
            "ICARO_MEMORY_NOT_SELECTED",
          ].some((secret) => c.text.includes(secret)),
      ),
    );
    const dependent = await caseJobConversationResult(
      job.id,
      conversation.id,
      owner,
    );
    assert(dependent?.hash);
    const input = {
      requestId: randomUUID(),
      expectedRevision: review.revision,
      proposals: [
        {
          id: "task-0",
          title: review.report!.tasks[0].title,
          body: "Texto editado por el profesional",
        },
        {
          id: "draft",
          title: review.report!.draft!.title,
          body: review.report!.draft!.body,
        },
      ],
    };
    await withRejectedAudit(owner.id, "case.writing.created", async () => {
      assert.equal(
        (await confirmCaseProposals(job.id, input, owner)).status,
        "partial",
      );
    });
    assert.equal(await prisma.task.count({ where: { causaId: cause.id } }), 1);
    assert.equal(
      (await prisma.task.findFirstOrThrow({ where: { causaId: cause.id } }))
        .clienteId,
      client.id,
    );
    assert.equal(
      await prisma.caseWritingDraft.count({ where: { causaId: cause.id } }),
      0,
    );
    const saved = await Promise.all([
      confirmCaseProposals(job.id, input, owner),
      confirmCaseProposals(job.id, input, owner),
    ]);
    assert(saved.every((s) => s.status === "completed"));
    assert.equal(await prisma.task.count({ where: { causaId: cause.id } }), 1);
    assert.equal(
      await prisma.caseWritingDraft.count({ where: { causaId: cause.id } }),
      1,
    );
    assert.equal(
      (await prisma.plazo.findUniqueOrThrow({ where: { id: deadline.id } }))
        .estado,
      "pendiente",
    );
    assert.equal(
      (await prisma.task.findFirstOrThrow({ where: { causaId: cause.id } }))
        .status,
      "todo",
    );
    await assert.rejects(
      confirmCaseProposals(job.id, { ...input, proposals: [] }, owner),
      status(409),
    );
    const currentConversation =
      await prisma.altazorConversation.findUniqueOrThrow({
        where: { id: conversation.id },
      });
    const destination = await altazorDestination(owner.id);
    const follow = await createAltazorTurn(
      conversation.id,
      {
        requestId: randomUUID(),
        expectedRevision: currentConversation.revision,
        text: "Explica el resultado preparado",
        destinationKey: destination.key,
        allowRemote: true,
      },
      owner,
    );
    await executeAltazorTurn(conversation.id, follow.turnId, owner, prisma, {
      execute: async (input) => {
        await input.authorizeContext?.();
        assert(
          input.history?.some((m) =>
            m.content.includes("Texto editado por el profesional"),
          ),
          "the follow-up uses verified job results and the actual saved selection",
        );
        return {
          planId: null,
          previewSteps: [],
          autoResults: [
            {
              toolId: "respuesta.libre",
              result: {
                ok: true,
                message: "Respuesta derivada del encargo ficticio",
              },
            },
          ],
          streamEvents: [],
          classification: {
            source: "rule",
            toolIds: ["respuesta.libre"],
            prompt: "fixture",
          },
        };
      },
    });
    const followRow = await prisma.altazorTurn.findUniqueOrThrow({
      where: { id: follow.turnId },
    });
    assert.equal(JSON.parse(followRow.contextJson).version, 2);
    assert.equal(
      JSON.parse(followRow.contextJson).caseJobResults[0].id,
      job.id,
    );
    await assert.rejects(
      savedAnswer(
        { sourceTurnId: follow.turnId },
        {
          userId: owner.id,
          role: "abogado",
          chatId: conversation.id,
          scope: { causaId: cause.id },
        },
      ),
      status(409),
    );
    // The origin card is now outside the six-turn automatic history window.
    const beforeGap = await prisma.altazorConversation.findUniqueOrThrow({ where: { id: conversation.id } });
    await prisma.altazorTurn.createMany({ data: Array.from({ length: 8 }, (_, i) => ({
      conversationId: conversation.id, ownerId: owner.id, ordinal: beforeGap.nextOrdinal + i,
      requestId: randomUUID(), inputSha256: tag, status: "completed", userText: "Otro asunto",
      assistantText: "Respuesta ficticia", contextJson: JSON.stringify({ version: 1, refs: [], attachmentIds: [], historyTurnIds: [], memoryDependencies: [] }),
    })) });
    const advanced = await prisma.altazorConversation.update({ where: { id: conversation.id }, data: { nextOrdinal: { increment: 8 }, revision: { increment: 8 } } });
    const currentHash = (await readCaseJob(job.id, owner)).continuationHash!;
    assert.ok(currentHash);
    const selected = { id: job.id, hash: currentHash };
    const selectionInput = { text: "Continúa la revisión", requestId: randomUUID(), expectedRevision: advanced.revision, destinationKey: destination.key, allowRemote: true, continueFrom: selected };
    await assert.rejects(createAltazorTurn(conversation.id, { ...selectionInput, continueFrom: { id: job.id, hash: "0".repeat(64) } }, owner), status(409));
    const different = await createAltazorConversation({ requestId: randomUUID(), causaId: cause.id, title: "Conversación independiente" }, owner);
    await assert.rejects(createAltazorTurn(different.conversation.id, { ...selectionInput, expectedRevision: different.conversation.revision }, owner), status(404));
    await assert.rejects(createAltazorTurn(conversation.id, selectionInput, other), status(404));
    const explicit = await createAltazorTurn(conversation.id, selectionInput, owner);
    let sentContext = "";
    await executeAltazorTurn(conversation.id, explicit.turnId, owner, prisma, { execute: async request => {
      sentContext = request.context || "";
      assert(!request.history?.some(message => message.content.includes("Texto editado por el profesional")));
      return { planId: null, previewSteps: [], autoResults: [{ toolId: "respuesta.libre", result: { ok: true, message: "Continuación comprobada" } }], streamEvents: [], classification: { source: "rule", toolIds: ["respuesta.libre"], prompt: "fixture" } };
    } });
    assert(sentContext.includes("Texto editado por el profesional"));
    assert(sentContext.length <= 32_000);
    const changing = await make();
    await advanceCaseJob(changing.id, owner);
    await advanceCaseJob(changing.id, owner);
    const latestConversation = await prisma.altazorConversation.findUniqueOrThrow({ where: { id: conversation.id } });
    const queued = await createAltazorTurn(conversation.id, { ...selectionInput, requestId: randomUUID(), expectedRevision: latestConversation.revision }, owner);
    const keptBefore = await prisma.altazorCaseJobStep.findMany({
      where: { jobId: changing.id, status: "completed", kind: "analyze" },
      select: { id: true },
    });
    await prisma.documento.update({
      where: { id: doc.id },
      data: {
        version: { increment: 1 },
        contenido:
          "Documento ficticio actualizado con otro antecedente para revisar.",
      },
    });
    const blocked = await readCaseJob(changing.id, owner);
    assert.equal(blocked.available, false);
    assert.equal(blocked.report, null);
    assert.deepEqual(blocked.steps, []);
    assert.equal(
      await caseJobConversationResult(job.id, conversation.id, owner),
      null,
    );
    const beforeRefreshCalls = calls.length;
    let calledAfterChange = false;
    const changedContext = await executeAltazorTurn(conversation.id, queued.turnId, owner, prisma, { execute: async () => { calledAfterChange = true; throw Error("Unverified report"); } });
    assert.equal(calledAfterChange, false);
    assert.equal(changedContext.turns.find(t => t.id === explicit.turnId)?.available, false);
    assert.equal(changedContext.turns.find(t => t.id === queued.turnId)?.status, "blocked");
    assert.equal(
      (await readAltazorConversation(conversation.id, owner)).turns.find(
        (t) => t.id === follow.turnId,
      )?.available,
      false,
      "a source change redacts answers derived from the job",
    );
    const refreshed = await resumeCaseJob(changing.id, owner, blocked.revision);
    assert.equal(refreshed.status, "awaiting_plan");
    assert(refreshed.pendingPlan);
    assert.equal(
      calls.length,
      beforeRefreshCalls,
      "refresh never starts a model",
    );
    await resumeCaseJob(
      changing.id,
      owner,
      refreshed.revision,
      refreshed.pendingPlan!.hash,
    );
    assert.equal((await run(changing.id)).status, "awaiting_review");
    assert(keptBefore.length > 0);
    for (const s of keptBefore)
      assert(
        await prisma.altazorCaseJobStep.count({
          where: { id: s.id, status: "completed" },
        }),
        "unchanged completed metadata analysis is retained",
      );
    askQuestion = true;
    const withdrawn = await make(false, true);
    await forgetIcaroMemory(profile.id, memoryRef.id, { expectedRevision: memoryRef.revision, confirmed: true }, owner);
    const priorCalls = calls.length;
    await assert.rejects(advanceCaseJob(withdrawn.id, owner), status(409));
    const blockedMemory = await readCaseJob(withdrawn.id, owner);
    assert.equal(blockedMemory.available, false);
    const replacement = await resumeCaseJob(withdrawn.id, owner, blockedMemory.revision);
    assert.equal(replacement.status, "awaiting_plan");
    assert.match(replacement.pendingPlan!.preview, /sin memoria/);
    assert.doesNotMatch(replacement.pendingPlan!.preview, /Criterio elegido/);
    assert.equal(calls.length, priorCalls);
    await cancelCaseJob(withdrawn.id, owner, replacement.revision);
    const waiting = await make();
    await withRejectedAudit(owner.id, "altazor.help.wait", async () => {
      assert.equal((await run(waiting.id)).status, "interrupted");
    });
    assert.equal(
      await prisma.altazorHelpRequest.count({
        where: { caseJobId: waiting.id },
      }),
      0,
      "help and final-state checkpoint roll back together",
    );
    const interrupted = await readCaseJob(waiting.id, owner);
    await resumeCaseJob(waiting.id, owner, interrupted.revision);
    const waitingView = await run(waiting.id);
    assert.equal(waitingView.status, "awaiting_help");
    assert(waitingView.help);
    await prisma.altazorHelpRequest.update({where:{id:waitingView.help!.id},data:{expiresAt:new Date(0)}});
    const expiredHelp=await readCaseJob(waiting.id,owner);assert.equal(expiredHelp.help!.status,"expired");
    assert.equal((await answerHelpRequest(owner, { requestId: waitingView.help.id, response: "Respuesta tardía" })).accepted, false);
    const renewedHelp=await resumeCaseJob(waiting.id,owner,expiredHelp.revision);assert.notEqual(renewedHelp.help!.id,waitingView.help!.id);
    const requestId = renewedHelp.help!.id;
    await saveHelpChannelConfig(owner, { ntfy: {
      enabled: true, baseUrl: "https://ntfy.fixture.invalid", topic: "case_help_notices",
      replyTopic: "case_help_replies", token: "case-help-fictitious-token",
    } });
    let replyCode = "";
    await notifyHelpRequest(owner.id, requestId, prisma, {
      publishNtfy: async (_config, message) => {
        replyCode = /ALTAZOR ([A-Za-z0-9_-]{32})/.exec(message.body)![1];
        return { ok: true, providerMessageId: "fixture-notice" };
      },
      createWhatsAppMetaProvider: () => assert.fail("Only ntfy is connected"),
    });
    const response = "Solicitar primero el comprobante original.";
    const reply = { id: randomUUID(), time: Math.floor(Date.now() / 1000), message: `ALTAZOR ${replyCode} ${response}` };
    assert.equal((await pollHelpReplies(owner, prisma, async () => [reply, reply])).accepted, 1);
    const beforeRecovery = await prisma.altazorCaseJob.findUniqueOrThrow({ where: { id: waiting.id } });
    assert.equal(beforeRecovery.status, "awaiting_help");
    const userAccess = () => prisma.user.findUniqueOrThrow({
      where: { id: owner.id }, select: { role: true, capabilityGrants: true, capabilityRevokes: true },
    });
    const beforeAccess = await userAccess();
    const receipts = () => Promise.all([
      prisma.task.count({ where: { causaId: cause.id } }), prisma.caseWritingDraft.count({ where: { causaId: cause.id } }),
    ]);
    const beforeReceipts = await receipts();
    const integrationStep = { jobId: waiting.id, label: "Integrar respuesta a la pregunta pendiente" };
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "assistant.use" } });
    await assert.rejects(advanceCaseJob(waiting.id, owner), status(403));
    assert.equal(await prisma.altazorCaseJobStep.count({ where: integrationStep }), 0);
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes: beforeAccess.capabilityRevokes } });
    // The Host stopped after accepting the reply and boots after the response deadline.
    const now = Date.now();
    const pastWindow = {
      createdAt: new Date(now - 26 * 3600_000), respondedAt: new Date(now - 3 * 3600_000), expiresAt: new Date(now - 2 * 3600_000),
    };
    await prisma.altazorHelpRequest.update({ where: { id: requestId }, data: pastWindow });
    assert.equal((await readCaseJob(waiting.id, owner)).help?.status, "answered");
    await assert.rejects(resumeCaseJob(waiting.id, owner, beforeRecovery.revision), status(409));
    const duplicate = await answerHelpRequest(owner, { requestId, response: "Repetición" });
    assert.equal(duplicate.accepted, false);
    assert.equal(duplicate.request.status, "answered");
    const restartWithPendingReply = (id: string) =>
      execFileSync(process.execPath, ["--import", "tsx", process.argv[1], "--recover-help", id, owner.id]);
    restartWithPendingReply(waiting.id);
    const afterRecovery = await prisma.altazorCaseJob.findUniqueOrThrow({ where: { id: waiting.id } });
    assert.equal(afterRecovery.revision, beforeRecovery.revision + 1);
    assert.equal(afterRecovery.planJson, beforeRecovery.planJson);
    assert.equal(afterRecovery.selectionJson, beforeRecovery.selectionJson);
    const consumed = await prisma.altazorHelpRequest.findUniqueOrThrow({ where: { id: requestId } });
    assert.equal(consumed.status, "resumed");
    assert.equal(consumed.responseSource, "ntfy");
    const integrations = await prisma.altazorCaseJobStep.findMany({ where: integrationStep });
    assert.deepEqual(integrations.map(step => JSON.parse(step.dataJson).text), [response]);
    assert.equal((await pollHelpReplies(owner, prisma, async () => [reply])).accepted, 0);
    askQuestion = false;
    assert.equal((await run(waiting.id)).status, "awaiting_review");
    assert.deepEqual(await receipts(), beforeReceipts);
    assert.deepEqual(await userAccess(), beforeAccess);

    askQuestion = true;
    const waJob = await make(false);
    const waHelp = (await run(waJob.id)).help!;
    const phone = "+56912000001", phoneNumberId = "12000000001", appSecret = "fictitious-case-app-secret";
    const channel = await prisma.canalUsuario.create({ data: {
      userId: owner.id, canal: "whatsapp", estado: "activo", verificadoAt: new Date(),
      destinoEnc: encryptSecret(phone), destinoHash: hashDestino("whatsapp", phone),
    } });
    await saveWhatsAppMetaConfig({ id: users[2] }, { enabled: true, phoneNumberId, templateName: "fixture_help",
      accessToken: "fixture-access", appSecret, verifyToken: "fictitious-verification-token" });
    await saveHelpChannelConfig(owner, { whatsapp: { enabled: true, channelId: channel.id } });
    const sentMessageId = "wamid.case-notice";
    await notifyHelpRequest(owner.id, waHelp.id, prisma, {
      publishNtfy: async () => ({ ok: true, providerMessageId: "fixture-ntfy-notice" }),
      createWhatsAppMetaProvider: config => createWhatsAppMetaProvider(config, async () => Response.json({ messages: [{ id: sentMessageId }] })),
    });
    const waText = "Preparar una propuesta para revisar.";
    const envelope = JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ value: {
      metadata: { phone_number_id: phoneNumberId }, messages: [{
        id: "wamid.case-reply", from: phone.slice(1), type: "text", timestamp: String(Math.floor(Date.now() / 1000)),
        context: { id: sentMessageId }, text: { body: waText },
      }],
    } }] }] });
    const signature = "sha256=" + createHmac("sha256", appSecret).update(envelope).digest("hex");
    const deliverWhatsApp = () => processWhatsAppHelpWebhook(envelope, signature);
    assert.equal((await deliverWhatsApp()).accepted, 1);
    assert.equal((await deliverWhatsApp()).accepted, 0);
    // A previous Host already swept this timely answer. Its persisted receipt still belongs to the live job.
    await prisma.altazorHelpRequest.update({ where: { id: waHelp.id }, data: { ...pastWindow, status: "expired" } });
    assert.equal((await readCaseJob(waJob.id, owner)).help?.status, "answered");
    restartWithPendingReply(waJob.id);
    const waConsumed = await prisma.altazorHelpRequest.findUniqueOrThrow({ where: { id: waHelp.id } });
    assert.equal(waConsumed.status, "resumed");
    assert.equal(waConsumed.responseSource, "whatsapp");
    const waSteps = await prisma.altazorCaseJobStep.findMany({ where: { ...integrationStep, jobId: waJob.id } });
    assert.deepEqual(waSteps.map(step => JSON.parse(step.dataJson).text), [waText]);
    askQuestion = false;
    assert.equal((await run(waJob.id)).status, "awaiting_review");
    assert.deepEqual(await receipts(), beforeReceipts);
    assert.deepEqual(await userAccess(), beforeAccess);
    const stopped = await make();
    await advanceCaseJob(stopped.id, owner);
    hold = true;
    const begun = new Promise<void>((resolve) => {
      gate.started = resolve;
    });
    const working = advanceCaseJob(stopped.id, owner);
    await begun;
    const current = await prisma.altazorCaseJob.findUniqueOrThrow({
      where: { id: stopped.id },
    });
    await cancelCaseJob(stopped.id, owner, current.revision);
    hold = false;
    gate.release?.();
    await working;
    assert.equal((await readCaseJob(stopped.id, owner)).status, "cancelled");
    const revoked = await make();
    await prisma.user.update({
      where: { id: owner.id },
      data: { capabilityRevokes: "assistant.use" },
    });
    await assert.rejects(readCaseJob(revoked.id, owner), status(403));
    assert((await processCaseJobs()).blocked > 0);
    await prisma.user.update({
      where: { id: owner.id },
      data: { capabilityRevokes: "" },
    });
    assert.throws(() =>
      validateReport(
        {
          ...emptyReport(),
          citations: [{ sourceId: "R1", quote: "inventada" }],
        },
        [],
      ),
    );
    console.log(
      "Case jobs PASS: durable chat scope, independent specialist model, bounded source blocks, no private memory transfer, concurrent leases, no 24h expiry, review-before-write, partial audit rollback/replay, source refresh, one-use help, cancellation and live revocation; fictitious providers only.",
    );
  } catch (error) {
    console.error("CASE_JOB_FIXTURE_FAILURE", error);
    throw error;
  } finally {
    hold = false;
    gate.release?.();
    globalThis.fetch = oldFetch;
    for (const id of causes) {
      await prisma.caseWritingDraft.deleteMany({ where: { causaId: id } });
      await prisma.altazorHelpRequest.deleteMany({
        where: { scopeKind: "causa", scopeId: id },
      });
      await prisma.altazorCaseJob.deleteMany({ where: { causaId: id } });
      await prisma.task.deleteMany({ where: { causaId: id } });
      await prisma.plazo.deleteMany({ where: { causaId: id } });
      await prisma.documento.deleteMany({ where: { causaId: id } });
      await prisma.altazorConversation.deleteMany({ where: { causaId: id } });
      await prisma.causa.deleteMany({ where: { id } });
    }
    await prisma.cliente.deleteMany({ where: { id: { in: clients } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.commandExecution.deleteMany({
      where: { ownerId: { in: users } },
    });
    await prisma.assistantPlanRecord.deleteMany({
      where: { ownerId: { in: users } },
    });
    await prisma.notification.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.integrationConfig.deleteMany({
      where: { provider: { in: [...fixtureProviders, ...users.map(id => `altazor-help:${sha256Hex(id)}`)] } },
    });
    if (configs.length)
      await prisma.integrationConfig.createMany({ data: configs });
    if(priorFirm)await prisma.firmSettings.update({where:{id:priorFirm.id},data:{assistantLlmMode:priorFirm.assistantLlmMode,hermesAllowDemo:priorFirm.hermesAllowDemo}});
    else if(ownedOrganization)await prisma.organization.deleteMany({where:{id:ownedOrganization}});
    for (const key of Object.keys(process.env))
      if (!(key in previousEnv)) delete process.env[key];
    Object.assign(process.env, previousEnv);
    await prisma.$disconnect();
  }
}
const suite = process.argv[2] === "--recover-help" ? restartedHelpWorker(process.argv[3], process.argv[4]) : main();
void suite.catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
