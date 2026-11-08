/** Real sign-in and app shell; synthetic read-only timeline, no model or external service. */
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import type { TimelineTurn } from "../src/components/altazor/useAltazorTimeline";
import { loginAs } from "./helpers";

const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
const owners: string[] = [];
const tag = randomUUID();

async function fixtureUser() {
  const seed = await db.user.findUniqueOrThrow({ where: { email: "abogado@estudio.cl" }, select: { password: true } });
  const email = `altazor-chat-${randomUUID()}@example.test`;
  const user = await db.user.create({ data: { name: "Prueba ficticia de conversación", email, password: seed.password, role: "abogado" } });
  owners.push(user.id);
  return email;
}

function turn(ordinal: number, overrides: Partial<TimelineTurn> = {}): TimelineTurn {
  return {
    id: `fixture-turn-${tag}-${ordinal}`, ordinal, status: "completed", userText: `Pregunta ficticia ${ordinal}`,
    assistantText: `Respuesta ficticia ${ordinal}`, attachmentIds: [], sourceRefs: [], results: [], plan: null,
    errorCode: null, createdAt: new Date(Date.UTC(2026, 10, 8, 12, ordinal)).toISOString(),
    conversationId: `fixture-chat-${tag}`, conversationTitle: "Conversación sintética", conversationStatus: "active", causaId: null,
    ...overrides,
  };
}

async function timeline(page: Page, current: () => TimelineTurn[]) {
  let reads = 0;
  const writes: string[] = [];
  page.on("request", request => {
    if (new URL(request.url()).pathname.startsWith("/api/altazor/conversations") && request.method() !== "GET") writes.push(request.url());
  });
  await page.route(url => url.pathname === "/api/altazor/timeline", route => { reads++; return route.fulfill({ json: { turns: current(), before: null } }); });
  return {
    writes,
    refresh: async () => {
      const before = reads;
      await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      await expect.poll(() => reads).toBeGreaterThan(before);
    },
  };
}

test.afterAll(async () => {
  try {
    await db.altazorCompanion.deleteMany({ where: { ownerId: { in: owners } } });
    await db.auditEvent.deleteMany({ where: { actorId: { in: owners } } });
    await db.user.deleteMany({ where: { id: { in: owners } } });
  } finally { await db.$disconnect(); }
});

test("el chat presenta Markdown legible sin ejecutar HTML ni enlaces inseguros", async ({ page }) => {
  const markdown = [
    "# Informe de prueba", "", "**Conclusión clara** y `referencia ficticia`.", "",
    "- Primer antecedente", "- Segundo antecedente", "", "| Fuente | Estado |", "| --- | --- |", "| Ficticia | Revisada |", "",
    "[Fuente pública](https://example.invalid/fuente)", "[Enlace inseguro](javascript:alert%281%29)",
    "<img src=x onerror=window.ALT_XSS=1>", "<script>window.ALT_XSS=1</script>",
  ].join("\n");
  await timeline(page, () => [turn(1, { userText: "**Mi mensaje permanece literal**", assistantText: markdown })]);
  await loginAs(page, await fixtureUser());
  const answer = page.locator(".altazor-answer .altazor-message-content");
  await expect(answer.getByText("Conclusión clara", { exact: true })).toHaveJSProperty("tagName", "STRONG");
  await expect(answer.getByRole("listitem")).toHaveCount(2);
  await expect(answer.getByRole("table")).toHaveCount(1);
  await expect(answer.getByRole("link", { name: "Fuente pública", exact: true })).toHaveAttribute("href", "https://example.invalid/fuente");
  await expect(answer.getByRole("link", { name: "Enlace inseguro", exact: true })).toHaveCount(0);
  await expect(answer.locator("script,img,iframe")).toHaveCount(0);
  expect(await page.evaluate(() => Object.hasOwn(window, "ALT_XSS"))).toBe(false);
  const userMessage = page.locator(".altazor-user-message .altazor-message-content");
  await expect(userMessage).toHaveText("**Mi mensaje permanece literal**");
  await expect(userMessage.locator("strong")).toHaveCount(0);
});

test("un encargo conserva un solo resumen y oculta acciones y resultados mientras trabaja", async ({ page }) => {
  test.setTimeout(90_000);
  const steps = Array.from({ length: 6 }, (_, index) => ({ toolId: "nota.crear", preview: `Acción ficticia ${index + 1}` }));
  const results = steps.map((step, index) => ({ toolId: step.toolId, result: { ok: true, message: `Detalle acción ${index + 1}`, card: { type: "nota", id: `fixture-note-${index}`, text: "Nota completamente ficticia" } } }));
  let current = turn(1, { status: "awaiting_confirmation", assistantText: "Plan anterior detallado que no debe inundar el chat", progress: { summary: "Organizaré los seis antecedentes elegidos.", planned: 6, completed: 0, failed: 0 }, plan: { id: "fixture-plan", steps } });
  const polling = await timeline(page, () => [current]);
  await loginAs(page, await fixtureUser());
  const summary = page.getByTestId("altazor-execution-summary");
  await expect(summary).toHaveCount(1);
  await expect(summary).toContainText("Antes de empezar");
  await expect(summary).toContainText("0 de 6 acciones completadas");
  await expect(page.getByRole("heading", { name: "Revisa el encargo completo", exact: true })).toBeVisible();
  const plan = page.locator(".altazor-plan details");
  await expect(plan).not.toHaveAttribute("open");
  await expect(plan.getByText("Acción ficticia 1", { exact: true })).not.toBeVisible();
  expect(polling.writes).toEqual([]);

  current = { ...current, status: "running", progress: { ...current.progress!, completed: 2 }, results };
  await polling.refresh();
  await expect(summary).toHaveCount(1);
  await expect(summary).toContainText("2 de 6 acciones completadas");
  await expect(page.locator(".altazor-plan,.altazor-result-details")).toHaveCount(0);
  await expect(page.getByText("Detalle acción 1", { exact: true })).toHaveCount(0);
  current = { ...current, progress: { ...current.progress!, completed: 4 } };
  await polling.refresh();
  await expect(summary).toHaveCount(1);
  await expect(summary).toContainText("4 de 6 acciones completadas");
  expect(polling.writes).toEqual([]);

  current = { ...current, status: "completed", assistantText: "Trabajo terminado: seis antecedentes organizados para revisar.", progress: { ...current.progress!, completed: 6 } };
  await polling.refresh();
  await expect(summary).toContainText("Finalizado");
  await expect(summary).toContainText("6 de 6 acciones completadas");
  await expect(page.getByText(current.assistantText, { exact: true })).toBeVisible();
  const details = page.locator(".altazor-result-details");
  await expect(details).toHaveCount(1);
  await expect(details).not.toHaveAttribute("open");
  await expect(details.locator(":scope > summary")).toContainText("6");
  expect(polling.writes).toEqual([]);
});

test("el historial no interrumpe la lectura ni pierde el borrador al recibir novedades", async ({ page }, info) => {
  test.setTimeout(90_000);
  let current = Array.from({ length: 16 }, (_, index) => turn(index + 1, { assistantText: `Respuesta ficticia ${index + 1}. `.repeat(12) }));
  const polling = await timeline(page, () => current);
  await page.setViewportSize({ width: 360, height: 900 });
  await loginAs(page, await fixtureUser());
  const history = page.getByRole("region", { name: "Historial con Altazor", exact: true });
  await expect(history.locator(".altazor-turns > li")).toHaveCount(16);
  const draft = "Borrador ficticio que sigo preparando mientras Altazor recibe novedades.";
  await page.getByTestId("inicio-composer").fill(draft);
  await history.evaluate(element => { element.scrollTop = 0; element.dispatchEvent(new Event("scroll")); });
  const latest = page.getByRole("button", { name: "Ir al mensaje más reciente", exact: true });
  await expect(latest).toBeVisible();
  current = [...current, turn(17, { assistantText: "Resultado nuevo al final, sin interrumpir la lectura." })];
  await polling.refresh();
  await expect(history.locator(".altazor-turns > li")).toHaveCount(17);
  expect(await history.evaluate(element => element.scrollTop)).toBe(0);
  await expect(page.getByTestId("inicio-composer")).toHaveValue(draft);
  await latest.click();
  await expect.poll(() => history.evaluate(element => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeLessThan(3);
  await expect(page.getByTestId("inicio-composer")).toHaveValue(draft);
  for (const width of [360, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`altazor-chat-${width}.png`), animations: "disabled" });
  }
  expect(polling.writes).toEqual([]);
});
