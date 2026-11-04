import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs } from "./helpers";

const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
if (new URL(process.env.DATABASE_URL!).toString() !== url) throw Error("Use the explicitly disposable fixture database");
const db = new PrismaClient({ datasources: { db: { url } } }), email = `inicio-assistant-${randomUUID()}@example.test`;
let ownerId = "";
test.beforeAll(async () => { ownerId = (await db.user.create({ data: { email, name: "Abogado ficticio de Inicio", password: await hash("lexopen",10), role: "abogado" } })).id; });
test.afterAll(async () => {
  try { if (ownerId) {
    await db.evento.deleteMany({where:{responsableId:ownerId}});await db.altazorConversation.deleteMany({where:{ownerId}});await db.assistantPlanRecord.deleteMany({where:{ownerId}});await db.commandExecution.deleteMany({where:{ownerId}});await db.assistantUndo.deleteMany({where:{ownerId}});await db.activity.deleteMany({where:{userId:ownerId}});await db.auditEvent.deleteMany({where:{actorId:ownerId}});await db.user.deleteMany({where:{id:ownerId}});
  } } finally { await db.$disconnect(); }
});

test("un abogado agenda una audiencia desde Inicio y aparece en el calendario", async ({
  page,
}) => {
  await loginAs(page, email);
  await expect(page).toHaveURL(/\/inicio$/);
  await expect(page.getByTestId("inicio-status-line")).toBeVisible();

  const composer = page.getByTestId("inicio-composer");
  const eventTitle = `prueba e2e ${randomUUID()}`;
  await composer.fill(`agenda una audiencia hoy a las 15 sobre ${eventTitle}`);
  const consent = page.getByRole("checkbox", { name: /Autorizo enviar este mensaje/ });
  if (await consent.count()) await consent.check();
  await page.getByTestId("inicio-send").click();

  const confirmButton = page.getByTestId("plan-confirm");
  await expect(confirmButton).toBeVisible({ timeout: 20_000 });
  await confirmButton.click();

  await expect(page.getByTestId("assistant-result-card").first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/agendad/i).first()).toBeVisible();

  await page.goto("/calendario?tipo=evento");
  const eventosPanel = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Eventos y audiencias" }) });
  await expect(eventosPanel).toBeVisible();
  await expect(eventosPanel.getByText(`Audiencia · ${eventTitle}`, { exact: true })).toBeVisible({
    timeout: 10_000,
  });
});

test("un cliente no puede acceder a Inicio ni al asistente", async ({ page }) => {
  await loginAs(page, "cliente@andes.cl");
  await expect(page).toHaveURL(/\/portal$/);

  await page.goto("/inicio");
  await expect(page).toHaveURL(/\/portal$/);

  const assistantRes = await page.request.post("/api/assistant", {
    data: { text: "hola" },
  });
  expect(assistantRes.status()).toBe(403);

  const confirmRes = await page.request.post("/api/assistant/confirm", {
    data: { planId: "x", confirm: true },
  });
  expect(confirmRes.status()).toBe(403);

  // The new durable assistant and all of its private companions retain the
  // legacy portal boundary, including guessed resource IDs and mutations.
  for (const route of ["/api/altazor/conversations", "/api/altazor/conversations/not-owned", "/api/altazor/memory", "/api/altazor/resources", "/api/altazor/academic", "/api/altazor/computer", "/api/personal-connectors"]) {
    expect((await page.request.get(route)).status(), route).toBe(403);
  }
  for (const route of ["/api/altazor/conversations", "/api/altazor/conversations/not-owned/turns", "/api/altazor/conversations/not-owned/attachments", "/api/altazor/conversations/not-owned/attachments/not-owned/library", "/api/altazor/conversations/not-owned/turns/not-owned/execute", "/api/altazor/conversations/not-owned/turns/not-owned/confirm", "/api/altazor/conversations/not-owned/turns/not-owned/cancel", "/api/altazor/memory", "/api/altazor/academic"]) {
    expect((await page.request.post(route, { data: {} })).status(), route).toBe(403);
  }
});
