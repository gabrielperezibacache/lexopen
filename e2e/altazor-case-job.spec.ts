/** Real chat/worker/domain handlers, with an isolated fictitious loopback model. */
import { expect, test } from "@playwright/test";
import { PrismaClient, type IntegrationConfig } from "@prisma/client";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs } from "./helpers";
const execute = promisify(execFile);
const db = new PrismaClient({
  datasources: {
    db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) },
  },
});
test.use({ serviceWorkers: "block" });
const tag = randomUUID(),
  email = `case-worker-${tag}@example.test`,
  peerEmail = `case-peer-${tag}@example.test`;
let server: Server | undefined,
  prior: IntegrationConfig[] = [],
  ownerId = "",
  peerId = "",
  causeId = "",
  firmId = "",
  priorMode = "";
const models: string[] = [];
test.beforeAll(async () => {
  const seed = await db.user.findUniqueOrThrow({
    where: { email: "abogado@estudio.cl" },
    select: { password: true },
  });
  ownerId = (
    await db.user.create({
      data: {
        name: "Trabajador ficticio",
        email,
        password: seed.password,
        role: "abogado",
      },
    })
  ).id;
  peerId = (
    await db.user.create({
      data: {
        name: "Par ficticio",
        email: peerEmail,
        password: seed.password,
        role: "abogado",
      },
    })
  ).id;
  causeId = (
    await db.causa.create({
      data: {
        titulo: `Expediente ficticio ${tag.replaceAll("-", "").repeat(3)}`,
        tribunal: "Tribunal de prueba",
        materia: "civil",
        abogadoId: ownerId,
      },
    })
  ).id;
  await db.documento.create({
    data: {
      nombre: "Antecedente de prueba.txt",
      contenido:
        "Antecedente completamente ficticio que requiere cotejo profesional antes de actuar.",
      extractionStatus: "completed",
      causaId: causeId,
      autorId: ownerId,
    },
  });
  await db.altazorIcaro.create({
    data: {
      ownerId,
      causaId: causeId,
      scopeKey: `causa:${causeId}`,
      requestId: randomUUID(),
      inputSha256: tag,
      name: "Revisor de prueba",
      instructions: "Revisar sólo los antecedentes elegidos.",
      provider: "study",
      model: "specialist-fictitious",
    },
  });
  const firm = await db.firmSettings.findFirstOrThrow();
  firmId = firm.id;
  priorMode = firm.assistantLlmMode;
  await db.firmSettings.update({
    where: { id: firm.id },
    data: { assistantLlmMode: "remote_allowed" },
  });
  server = createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
      res.writeHead(404).end();
      return;
    }
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(Buffer.from(c));
    const input = JSON.parse(Buffer.concat(chunks).toString()) as {
      model: string;
      messages: { content: string }[];
    };
    models.push(input.model);
    let content =
      "Análisis ficticio: cotejar el antecedente con el expediente.";
    if (input.messages[0].content.includes("Devuelve SOLO JSON")) {
      const data = JSON.parse(input.messages.at(-1)!.content),
        source = data.sources.find((s: { text?: string }) => s.text);
      const citation = source
        ? { sourceId: source.id, quote: source.text.slice(0, 35) }
        : data.previous.citations[0];
      content = JSON.stringify({
        summary: "Informe ficticio listo para revisión profesional.",
        waits: ["Se espera cotejo del antecedente."],
        needs: ["Revisar el material antes de actuar."],
        tasks: [
          {
            title: "Cotejar el antecedente",
            description: "Solicitar revisión profesional del documento.",
            sourceIds: citation ? [citation.sourceId] : [],
          },
        ],
        draft: {
          title: "Borrador de revisión",
          body: citation
            ? `Borrador ficticio para cotejo [${citation.sourceId}]`
            : "Borrador ficticio sin cita documental.",
          sourceIds: citation ? [citation.sourceId] : [],
        },
        citations: citation ? [citation] : [],
        question: null,
      });
    }
    res
      .writeHead(200, { "Content-Type": "application/json" })
      .end(
        JSON.stringify({
          choices: [{ message: { role: "assistant", content } }],
        }),
      );
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("Fixture needs loopback");
  prior = await db.integrationConfig.findMany({
    where: { provider: { in: ["llm", "hermes", "llm-local"] } },
  });
  await db.integrationConfig.updateMany({
    where: { provider: "llm-local" },
    data: { enabled: false },
  });
  const configJson = JSON.stringify({
    preset: "custom",
    apiUrl: `http://127.0.0.1:${address.port}/v1`,
    apiKey: "",
    model: "coordinator-fictitious",
    allowDemo: false,
    requireApproval: true,
  });
  for (const provider of ["llm", "hermes"])
    await db.integrationConfig.upsert({
      where: { provider },
      create: { provider, enabled: true, configJson },
      update: { enabled: true, configJson },
    });
});
test.afterAll(async () => {
  try {
    if (firmId)
      await db.firmSettings.update({
        where: { id: firmId },
        data: { assistantLlmMode: priorMode },
      });
    await db.integrationConfig.deleteMany({
      where: {
        provider: { in: ["llm", "hermes", "llm-local"] },
        id: { notIn: prior.map((c) => c.id) },
      },
    });
    for (const c of prior)
      await db.integrationConfig.upsert({
        where: { provider: c.provider },
        create: c,
        update: {
          enabled: c.enabled,
          configJson: c.configJson,
          updatedAt: c.updatedAt,
        },
      });
    if (causeId) {
      await db.caseWritingDraft.deleteMany({ where: { causaId: causeId } });
      await db.altazorHelpRequest.deleteMany({
        where: { scopeKind: "causa", scopeId: causeId },
      });
      await db.altazorCaseJob.deleteMany({ where: { causaId: causeId } });
      await db.altazorConversation.deleteMany({ where: { causaId: causeId } });
      await db.task.deleteMany({ where: { causaId: causeId } });
      await db.documento.deleteMany({ where: { causaId: causeId } });
      await db.causa.deleteMany({ where: { id: causeId } });
    }
    const ids = [ownerId, peerId].filter(Boolean);
    await db.assistantPlanRecord.deleteMany({
      where: { ownerId: { in: ids } },
    });
    await db.commandExecution.deleteMany({ where: { ownerId: { in: ids } } });
    await db.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
    await db.notification.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  } finally {
    server?.closeAllConnections();
    await new Promise<void>((resolve) =>
      server ? server.close(() => resolve()) : resolve(),
    );
    await db.$disconnect();
  }
});
test("encargo por chat: confirma equipo, continúa sin ventana y recupera un guardado confirmado sin duplicarlo", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180000);
  await loginAs(page, email);
  await page.goto(`/inicio?causaId=${causeId}`, { waitUntil: "networkidle" });
  await page
    .getByRole("textbox", { name: "Mensaje para ALTAZOR", exact: true })
    .fill("Revisa esta causa, organiza los pendientes y prepara un borrador");
  await page
    .getByRole("button", { name: "Enviar mensaje a ALTAZOR", exact: true })
    .click();
  const confirm = page.getByRole("button", {
    name: "Confirmar equipo e iniciar encargo",
    exact: true,
  });
  await expect(confirm).toBeVisible({ timeout: 30000 });
  await page.getByText("Ver la acción propuesta", { exact: true }).click();
  await expect(
    page.getByText(/Ícaro Revisor de prueba: specialist-fictitious/),
  ).toBeVisible();
  expect(await db.altazorCaseJob.count({ where: { ownerId } })).toBe(0);
  expect(models).toHaveLength(0);
  await confirm.click();
  await expect(
    page.getByRole("region", { name: "Encargo de la causa", exact: true }),
  ).toBeVisible({ timeout: 30000 });
  const job = await db.altazorCaseJob.findFirstOrThrow({ where: { ownerId } });
  const context = page.context();
  await page.close();
  await db.altazorCaseJob.update({
    where: { id: job.id },
    data: { createdAt: new Date("2000-01-01T00:00:00Z") },
  });
  const script =
    'import {processCaseJobs} from "./src/lib/altazor/case-jobs/worker.ts"; import {prisma} from "./src/lib/db.ts"; try {await processCaseJobs({limit:4});} finally {await prisma.$disconnect();}';
  await expect
    .poll(
      async () => {
        await execute(process.execPath, ["--import", "tsx", "-e", script], {
          cwd: process.cwd(),
          env: {
            ...process.env,
            DATABASE_URL: assertDisposableDatabaseUrl(
              process.env.E2E_DATABASE_URL,
            ),
            LLM_ALLOW_PRIVATE_URL: "1",
          },
          timeout: 30000,
        });
        return (
          await db.altazorCaseJob.findUniqueOrThrow({ where: { id: job.id } })
        ).status;
      },
      { timeout: 90000, intervals: [100, 200, 500] },
    )
    .toBe("awaiting_review");
  expect(await db.task.count({ where: { causaId: causeId } })).toBe(0);
  expect(await db.caseWritingDraft.count({ where: { causaId: causeId } })).toBe(
    0,
  );
  expect(models).toContain("coordinator-fictitious");
  expect(models).toContain("specialist-fictitious");
  const fresh = await context.newPage();
  await fresh.goto(
    `/inicio?conversacion=${job.conversationId}&causaId=${causeId}`,
    { waitUntil: "networkidle" },
  );
  const card = fresh.getByRole("region", {
    name: "Encargo de la causa",
    exact: true,
  });
  await expect(
    card.getByText("Listo para revisar", { exact: true }),
  ).toBeVisible();
  await card
    .getByLabel("Título de tarea", { exact: true })
    .fill("Tarea ajustada por el profesional");
  const bodies: string[] = [];
  await fresh.route(
    `**/api/altazor/case-jobs/${job.id}/confirm`,
    async (route) => {
      bodies.push(route.request().postData()!);
      const response = await route.fetch();
      expect(response.status(), await response.text()).toBe(200);
      if (bodies.length === 1)
        return route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({
            error: "Se perdió la respuesta de confirmación (prueba ficticia).",
          }),
        });
      return route.fulfill({ response });
    },
  );
  await card
    .getByRole("button", {
      name: "Confirmar registros seleccionados",
      exact: true,
    })
    .click();
  await expect(card.getByRole("alert")).toContainText("Se perdió");
  await expect(
    card.getByLabel("Título de tarea", { exact: true }),
  ).toBeDisabled();
  await card
    .getByRole("button", {
      name: "Reintentar confirmación de registros",
      exact: true,
    })
    .click();
  await expect(card.getByText("Completado", { exact: true })).toBeVisible();
  expect(bodies).toHaveLength(2);
  expect(JSON.parse(bodies[0])).toEqual(JSON.parse(bodies[1]));
  expect(
    await db.task.count({
      where: { causaId: causeId, title: "Tarea ajustada por el profesional" },
    }),
  ).toBe(1);
  expect(await db.caseWritingDraft.count({ where: { causaId: causeId } })).toBe(
    1,
  );
  const peerContext = await browser.newContext();
  try {
    const peer = await peerContext.newPage();
    await loginAs(peer, peerEmail);
    expect(
      (await peer.request.get(`/api/altazor/case-jobs/${job.id}`)).status(),
    ).toBe(404);
  } finally {
    await peerContext.close();
  }
  for (const width of [1366, 360]) {
    await fresh.setViewportSize({ width, height: 900 });
    await card.scrollIntoViewIfNeeded();
    // Keep the strict width check and identify overflowing nodes on failure.
    await expect.poll(() => fresh.evaluate(() => {
      if (document.documentElement.scrollWidth <= innerWidth) return [];
      const overflow = [...document.querySelectorAll<HTMLElement>("body *")]
        .filter(element => element.getBoundingClientRect().right > innerWidth + 1)
        .slice(0, 12).map(element => ({
          tag: element.tagName, className: element.className,
          width: element.getBoundingClientRect().width,
          right: element.getBoundingClientRect().right,
          text: element.textContent?.slice(0, 80),
        }));
      return [{ tag: "DOCUMENT", className: "", width: document.documentElement.scrollWidth, right: innerWidth, text: "" }, ...overflow];
    })).toEqual([]);
    await expect(fresh.getByRole("button", { name: "Quitar el contexto de la causa", exact: true })).toBeInViewport({ ratio: 1 });
    await fresh.screenshot({ path: info.outputPath(`case-job-${width}.png`) });
  }
});
