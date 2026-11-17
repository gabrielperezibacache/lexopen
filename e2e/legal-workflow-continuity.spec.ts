import { test, expect, type APIResponse } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID, createHash } from "node:crypto";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs, authenticateApiRequests, apiRequest } from "./helpers";
import type {
  HearingWorkspaceSummary,
  HearingSourceView,
  HearingReading,
  HearingNoteView,
} from "../src/lib/hearings/types";
import type { HearingPromotionResult } from "../src/lib/hearings/promotions-types";
import type {
  WritingMutationResult,
  WritingDraftView,
} from "../src/lib/writings/types";
// Keep the deliberately lost response in the form; offline-worker recovery is tested separately.
test.use({ serviceWorkers: "block" });
const db = new PrismaClient({
  datasources: {
    db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) },
  },
});
const tag = randomUUID(),
  email = `flow-${tag}@example.test`,
  reviewerEmail = `review-${tag}@example.test`;
let ownerId = "",
  reviewerId = "",
  clientId = "",
  causeId = "";
async function json<T>(
  response: Pick<APIResponse, "status" | "text" | "json">,
  status = 200,
): Promise<T> {
  expect(response.status(), await response.text()).toBe(status);
  return response.json();
}
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
test.beforeAll(async () => {
  const template = await db.user.findUniqueOrThrow({
    where: { email: "socio@estudio.cl" },
  });
  ownerId = (
    await db.user.create({
      data: {
        email,
        name: "Profesional ficticio del recorrido",
        role: "socio",
        password: template.password,
      },
    })
  ).id;
  reviewerId = (
    await db.user.create({
      data: {
        email: reviewerEmail,
        name: "Revisor ficticio del recorrido",
        role: "socio",
        password: template.password,
      },
    })
  ).id;
});
test.afterAll(async () => {
  try {
    if (causeId) {
      await db.caseWritingDraft.deleteMany({ where: { causaId: causeId } });
      await db.hearingWorkspace.deleteMany({ where: { causaId: causeId } });
      await db.caseFact.deleteMany({ where: { causaId: causeId } });
      await db.task.deleteMany({ where: { causaId: causeId } });
      await db.plazo.deleteMany({ where: { causaId: causeId } });
      await db.documento.deleteMany({ where: { causaId: causeId } });
      await db.causa.deleteMany({ where: { id: causeId } });
    }
    if (clientId) await db.cliente.deleteMany({ where: { id: clientId } });
    await db.auditEvent.deleteMany({
      where: { actorId: { in: [ownerId, reviewerId].filter(Boolean) } },
    });
    await db.commandExecution.deleteMany({
      where: { ownerId: { in: [ownerId, reviewerId].filter(Boolean) } },
    });
    await db.notification.deleteMany({
      where: { userId: { in: [ownerId, reviewerId].filter(Boolean) } },
    });
    await db.user.deleteMany({
      where: { id: { in: [ownerId, reviewerId].filter(Boolean) } },
    });
  } finally {
    await db.$disconnect();
  }
});
test("cliente a escrito aprobado: respuesta perdida, documentos, tarea, plazo, audiencia y revisión sin compartir la mesa privada", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(180_000);
  await loginAs(page, email);
  await authenticateApiRequests(page);
  await page.goto("/clientes", { waitUntil: "networkidle" });
  await page
    .getByRole("button", { name: "Nuevo cliente", exact: true })
    .click();
  const clientForm = page.getByRole("dialog", {
    name: "Nuevo cliente",
    exact: true,
  });
  await clientForm
    .getByLabel("Razón social / nombre", { exact: true })
    .fill(`Cliente ficticio ${tag}`);
  await clientForm
    .getByRole("button", { name: "Crear cliente", exact: true })
    .click();
  await expect(page).toHaveURL(/\/clientes\/[^/]+$/);
  clientId = new URL(page.url()).pathname.split("/").at(-1)!;
  await page
    .getByRole("link", { name: "Nueva causa", exact: true })
    .first()
    .click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByLabel("Cliente", { exact: true })).toHaveValue(
    clientId,
  );
  await page
    .getByLabel("Título", { exact: true })
    .fill(`Causa sin referencia ${tag}`);
  await page
    .getByLabel("Tribunal u órgano", { exact: true })
    .fill("Tribunal ficticio");
  await page.getByLabel("Materia", { exact: true }).fill("civil");
  const keys: string[] = [],
    bodies: string[] = [];
  await page.route(
    (url) => url.pathname === "/api/causas",
    async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      keys.push(route.request().headers()["idempotency-key"]);
      bodies.push(route.request().postData()!);
      const response = await route.fetch();
      expect(response.status(), await response.text()).toBe(201);
      if (keys.length === 1) return route.abort("failed");
      return route.fulfill({ response });
    },
  );
  await page.getByRole("button", { name: "Crear causa", exact: true }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Título", { exact: true })).toBeDisabled();
  await page
    .getByRole("button", { name: "Reintentar creación", exact: true })
    .click();
  await expect(page).toHaveURL(/\/causas\/[^/?#]+$/);
  causeId = new URL(page.url()).pathname.split("/").at(-1)!;
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBe(keys[0]);
  expect(bodies[1]).toBe(bodies[0]);
  expect(await db.causa.count({ where: { clienteId: clientId } })).toBe(1);
  await page.unroute((url) => url.pathname === "/api/causas");
  await page.goto(`/causas/${causeId}/expediente`, {
    waitUntil: "networkidle",
  });
  await page
    .getByRole("link", { name: "Añadir archivos", exact: true })
    .click();
  const bytes = Buffer.from(
    "Comprobante ficticio: el pago del arriendo se realizó el 12 de mayo de 2025 por CLP25.000. Material exclusivo de prueba.",
  );
  await page
    .locator('#incorporar-documentos input[type="file"]:not([webkitdirectory])')
    .setInputFiles({
      name: `Respaldo-${tag}.txt`,
      mimeType: "text/plain",
      buffer: bytes,
    });
  const uploaded = page.waitForResponse(
    (r) =>
      r.url().endsWith("/api/documentos") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Incorporar 1", exact: true }).click();
  const doc = await json<{ id: string; version: number }>(await uploaded, 201);
  await expect
    .poll(
      async () =>
        (await db.documento.findUniqueOrThrow({ where: { id: doc.id } }))
          .extractionStatus,
      { timeout: 30_000 },
    )
    .toBe("completed");
  // Wait for the archive refresh triggered by the upload before leaving it.
  await expect(
    page.getByRole("link", { name: `Respaldo-${tag}.txt`, exact: true }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.goto(`/clientes/${clientId}`, { waitUntil: "networkidle" });
  await expect(
    page.getByText(`Respaldo-${tag}.txt`, { exact: true }),
  ).toBeVisible();
  const clients = await json<{ id: string; documentosCount: number }[]>(
    await page.request.get(`/api/clientes?q=${tag}`),
  );
  expect(clients.find((c) => c.id === clientId)?.documentosCount).toBe(1);
  const original = await page.request.get(`/api/documentos/${doc.id}/content`);
  expect(original.status()).toBe(200);
  expect(sha(await original.body())).toBe(sha(bytes));
  const task = await json<{ id: string }>(
    await apiRequest(page).post("/api/tasks", {
      data: {
        title: `Revisar respaldo ${tag}`,
        causaId: causeId,
        clienteId: clientId,
        assigneeId: ownerId,
      },
    }),
    201,
  );
  const deadline = await json<{ id: string }>(
    await apiRequest(page).post("/api/plazos", {
      data: {
        titulo: `Entrega revisada ${tag}`,
        causaId: causeId,
        fechaLimite: "2088-11-24",
        responsableId: ownerId,
      },
    }),
    201,
  );
  const hearingBase = `/api/causas/${causeId}/hearings`;
  const hearing = await json<HearingWorkspaceSummary>(
    await apiRequest(page).post(hearingBase, {
      data: { title: `Audiencia ficticia ${tag}` },
    }),
    201,
  );
  await json(
    await apiRequest(page).post(`/api/documentos/${doc.id}/evidence`),
    201,
  );
  const source = await json<HearingSourceView>(
    await apiRequest(page).post(`${hearingBase}/${hearing.id}/sources`, {
      data: { kind: "document", refId: doc.id },
    }),
  );
  const reading = await json<HearingReading>(
    await page.request.get(
      `${hearingBase}/${hearing.id}/sources/${source.id}/read`,
    ),
  );
  const fragment = reading.fragments[0];
  expect(fragment).toBeTruthy();
  const note = await json<HearingNoteView>(
    await apiRequest(page).post(`${hearingBase}/${hearing.id}/notes`, {
      data: {
        title: "Observación ficticia",
        body: "El comprobante requiere cotejo profesional.",
        citation: {
          sourceId: source.id,
          fragmentId: fragment.id,
          quote: fragment.text,
        },
      },
    }),
  );
  if (!note.available) throw Error("The note must be available to its author");
  // The author explicitly promotes a document-backed observation to a case fact.
  // Another reviewer does not receive access to the author's private hearing.
  const promotion = {
    requestId: randomUUID(),
    source: { noteId: note.id, revision: note.revision },
    target: "fact",
    title: "Hecho propuesto ficticio",
    body: "El comprobante ficticio registra el pago indicado.",
    reviewed: true,
  };
  const fact = await json<HearingPromotionResult>(
    await apiRequest(page).post(
      `${hearingBase}/${hearing.id}/live/promotions`,
      { data: promotion },
    ),
    201,
  );
  expect(
    (
      await json<HearingPromotionResult>(
        await apiRequest(page).post(
          `${hearingBase}/${hearing.id}/live/promotions`,
          { data: promotion },
        ),
        201,
      )
    ).id,
  ).toBe(fact.id);
  const factRow = await db.caseFact.findUniqueOrThrow({
    where: { id: fact.id },
  });
  const writingBase = `/api/causas/${causeId}/writings`;
  const created = await json<WritingMutationResult>(
    await apiRequest(page).post(writingBase, {
      data: {
        requestId: randomUUID(),
        title: `Escrito ficticio ${tag}`,
        body: "Propuesta de revisión basada en los respaldos del expediente.",
      },
    }),
    201,
  );
  const added = await json<WritingMutationResult>(
    await apiRequest(page).post(`${writingBase}/${created.draft.id}/sources`, {
      data: {
        requestId: randomUUID(),
        expectedRevision: created.draft.revision,
        source: { kind: "fact", factId: fact.id, revision: factRow.revision },
      },
    }),
  );
  expect(added.draft.references).toHaveLength(1);
  await json(
    await apiRequest(page).post(
      `${writingBase}/${created.draft.id}/review-assignment`,
      {
        data: {
          requestId: randomUUID(),
          expectedRevision: added.draft.revision,
          expectedAssignmentVersion: added.draft.assignmentVersion,
          reviewerId,
        },
      },
    ),
  );
  const context = await browser.newContext();
  const reviewer = await context.newPage();
  try {
    await loginAs(reviewer, reviewerEmail);
    await authenticateApiRequests(reviewer);
    expect(
      (await reviewer.request.get(`${hearingBase}/${hearing.id}`)).status(),
    ).toBe(404);
    const view = await json<WritingDraftView>(
      await reviewer.request.get(`${writingBase}/${created.draft.id}`),
    );
    await json(
      await apiRequest(reviewer).post(
        `${writingBase}/${created.draft.id}/review`,
        {
          data: {
            requestId: randomUUID(),
            expectedRevision: view.revision,
            expectedAssignmentVersion: view.assignmentVersion,
            decision: "approved",
            citationsChecked: true,
            note: "Revisión de prueba; no acredita presentación judicial.",
          },
        },
      ),
    );
  } finally {
    await context.close();
  }
  const exported = await page.request.get(
    `${writingBase}/${created.draft.id}/export?format=docx&purpose=approved`,
  );
  expect(exported.status(), await exported.text()).toBe(200);
  const receipt = await db.caseWritingExport.findFirstOrThrow({
    where: { draftId: created.draft.id, purpose: "approved" },
  });
  expect(receipt.contentSha256).toBe(sha(await exported.body()));
  expect(
    (await db.plazo.findUniqueOrThrow({ where: { id: deadline.id } })).estado,
  ).toBe("pendiente");
  expect(
    (await db.task.findUniqueOrThrow({ where: { id: task.id } })).status,
  ).toBe("todo");
  const rows = await json<{ id: string; expectedVersion: string }[]>(
    await page.request.get(`/api/plazos?causaId=${causeId}`),
  );
  await json(
    await apiRequest(page).patch("/api/plazos", {
      data: {
        id: deadline.id,
        estado: "cumplido",
        expectedVersion: rows.find((row) => row.id === deadline.id)!
          .expectedVersion,
        completion: {
          kind: "manual",
          justification:
            "Confirmación ficticia del responsable; no representa una presentación judicial.",
        },
      },
    }),
  );
  await json(
    await apiRequest(page).patch("/api/tasks", {
      data: { id: task.id, status: "done" },
    }),
  );
  for (const size of [
    { width: 1366, height: 900 },
    { width: 360, height: 800 },
  ]) {
    await page.setViewportSize(size);
    await page.goto(`/clientes/${clientId}`, { waitUntil: "networkidle" });
    await expect(
      page.getByText(`Respaldo-${tag}.txt`, { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath(`continuidad-${size.width}.png`),
      animations: "disabled",
    });
  }
});
