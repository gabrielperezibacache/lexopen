/** Real Ícaros APIs/Prisma with an explicitly fictitious loopback model. */
import { expect, test } from "@playwright/test";
import { PrismaClient, type IntegrationConfig } from "@prisma/client";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs } from "./helpers";

const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
const tag = randomUUID(), ownerEmail = `icaros-ui-${tag}@example.test`, peerEmail = `icaros-peer-${tag}@example.test`;
const owners: string[] = [], selectedModel = "icaro-fictitious-small", resultText = "Resultado Ícaro ficticio: estructura de cuatro apartados y citas pendientes de revisión.";
const requests: Array<{ model: string; messages: Array<{ role: string; content: string }> }> = [];
let server: Server | undefined, prior: IntegrationConfig[] = [], captured = false;

test.beforeAll(async () => {
  const seed = await db.user.findUniqueOrThrow({ where: { email: "abogado@estudio.cl" }, select: { password: true } });
  for (const email of [ownerEmail, peerEmail]) owners.push((await db.user.create({ data: { name: "Profesional ficticio Ícaros", email, password: seed.password, role: "abogado" } })).id);
  server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") { response.writeHead(404).end(); return; }
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ choices: [{ message: { role: "assistant", content: resultText } }] }));
  });
  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw Error("Fictitious model requires a loopback TCP listener");
  prior = await db.integrationConfig.findMany({ where: { provider: { in: ["llm", "hermes", "llm-local"] } } }); captured = true;
  await db.integrationConfig.updateMany({ where: { provider: "llm-local" }, data: { enabled: false } });
  const configJson = JSON.stringify({ preset: "custom", apiUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: "", model: "study-default-fictitious", allowDemo: false, requireApproval: true });
  for (const provider of ["llm", "hermes"]) await db.integrationConfig.upsert({ where: { provider }, create: { provider, enabled: true, configJson }, update: { enabled: true, configJson } });
});

test.afterAll(async () => {
  try {
    if (captured) {
      await db.integrationConfig.deleteMany({ where: { provider: { in: ["llm", "hermes", "llm-local"] }, id: { notIn: prior.map(row => row.id) } } });
      for (const row of prior) await db.integrationConfig.upsert({ where: { provider: row.provider }, create: row, update: { enabled: row.enabled, configJson: row.configJson, updatedAt: row.updatedAt } });
    }
    await db.altazorIcaroMemory.deleteMany({ where: { ownerId: { in: owners } } });
    await db.altazorIcaroJob.deleteMany({ where: { ownerId: { in: owners } } });
    await db.altazorIcaro.deleteMany({ where: { ownerId: { in: owners } } });
    await db.altazorCompanion.deleteMany({ where: { ownerId: { in: owners } } });
    await db.auditEvent.deleteMany({ where: { actorId: { in: owners } } });
    await db.user.deleteMany({ where: { id: { in: owners } } });
  } finally { server?.closeAllConnections(); await new Promise<void>(resolve => server ? server.close(() => resolve()) : resolve()); await db.$disconnect(); }
});

test("un Ícaro usa su modelo, recuerda sólo lo confirmado y conserva su aislamiento", async ({ page, browser }, info) => {
  test.setTimeout(180_000);
  await loginAs(page, ownerEmail);
  await page.goto("/inicio?altazor=icaros");
  const panel = page.getByTestId("altazor-icaros");
  await panel.getByRole("button", { name: "Crear Ícaro", exact: true }).click();
  await panel.getByLabel("Nombre del Ícaro", { exact: true }).fill("Ícaro de citas ficticias");
  await panel.getByLabel("Instrucciones del Ícaro", { exact: true }).fill("Organiza únicamente el texto elegido. Señala citas pendientes y conserva hechos.");
  await panel.getByRole("combobox", { name: "Proveedor del Ícaro", exact: true }).selectOption("study");
  await panel.getByLabel("Modelo específico", { exact: true }).fill(selectedModel);
  await panel.getByRole("checkbox", { name: "Permitir memoria propia de este Ícaro", exact: true }).check();
  await panel.getByRole("button", { name: "Guardar Ícaro", exact: true }).click();
  const detail = panel.getByTestId("altazor-icaro-detail");
  await expect(detail.getByRole("heading", { name: "Ícaro de citas ficticias", exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(detail).toContainText(selectedModel);
  await detail.getByLabel("Instrucción del encargo", { exact: true }).fill("Ordena el texto ficticio en cuatro apartados");
  await detail.getByLabel("Texto para este encargo", { exact: true }).fill("Hechos completamente ficticios: cuatro observaciones sin datos personales.");
  await detail.getByRole("button", { name: "Encargar a este Ícaro", exact: true }).click();
  await expect(detail.getByText(resultText, { exact: true })).toBeVisible({ timeout: 30_000 });
  expect(requests).toHaveLength(1); expect(requests[0].model).toBe(selectedModel);
  expect(await db.altazorIcaroMemory.count({ where: { ownerId: owners[0] } })).toBe(0);
  await detail.getByRole("button", { name: "Conservar un extracto en memoria", exact: true }).click();
  await detail.getByLabel("Nombre del recuerdo", { exact: true }).fill("Estructura ficticia confirmada");
  await detail.getByRole("button", { name: "Confirmar y guardar recuerdo", exact: true }).click();
  const memory = detail.getByRole("region", { name: "Memoria de este Ícaro", exact: true });
  await expect(memory.getByText("Estructura ficticia confirmada", { exact: true })).toBeVisible();
  expect(await db.altazorIcaroMemory.count({ where: { ownerId: owners[0] } })).toBe(1);
  await detail.getByLabel("Instrucción del encargo", { exact: true }).fill("Reutiliza la estructura previamente confirmada");
  await detail.getByRole("checkbox", { name: "Usar la memoria propia de este Ícaro en el encargo", exact: true }).check();
  await detail.getByRole("button", { name: "Encargar a este Ícaro", exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  expect(requests[1].model).toBe(selectedModel);
  expect(JSON.stringify(requests[1].messages)).toContain(resultText);
  await expect(detail.getByRole("button", { name: "Conservar un extracto en memoria", exact: true })).toHaveCount(2);
  expect(await db.altazorIcaroMemory.count({ where: { ownerId: owners[0] } })).toBe(1);
  const profile = await db.altazorIcaro.findFirstOrThrow({ where: { ownerId: owners[0] } });
  const context = await browser.newContext();
  try {
    const peer = await context.newPage(); await loginAs(peer, peerEmail);
    expect((await peer.request.get(`/api/altazor/icaros/${profile.id}`)).status()).toBe(404);
    const catalog = await (await peer.request.get("/api/altazor/icaros")).json();
    expect(catalog.icaros).toEqual([]);
  } finally { await context.close(); }
  for (const width of [360, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`altazor-icaros-${width}.png`), animations: "disabled" });
  }
});
