import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { hash } from "bcryptjs";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs } from "./helpers";

const database = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
if (new URL(process.env.DATABASE_URL!).toString() !== database) throw Error("Use the explicitly disposable fixture");
const db = new PrismaClient({ datasources: { db: { url: database } } });
test.afterAll(async () => { await db.$disconnect(); });

test("Docencia conserva la última consulta y el origen de una convocatoria guardada", async ({ page }, info) => {
  test.setTimeout(60_000);
  const email = `academic-calls-${randomUUID()}@example.invalid`;
  const owner = await db.user.create({ data: { email, name: "Persona de prueba", role: "abogado", password: await hash("lexopen", 10) } });
  const title = "Convocatoria ficticia de ética";
  const checkedAt = "2026-11-05T15:00:00.000Z";
  const url = "https://example.invalid/convocatoria-etica";
  const sourceUrl = "https://example.invalid/fuente-es";
  const item = { id: "item-1", title, url, summary: "Convocatoria simulada para revisar el flujo de Docencia.", publishedAt: "2026-11-03T15:00:00.000Z" };
  const call = { country: "ES", status: "watching", deadline: "", organization: "Agencia ficticia", url };
  const sources = [
    { id: "direct-cl", country: "CL", label: "Portal chileno ficticio", url: "https://example.invalid/portal-cl", feed: false },
    { id: "feed-es", country: "ES", label: "Agencia ficticia", url: sourceUrl, feed: true },
  ];
  const origin = new URL(info.project.use.baseURL as string).origin;
  const actions: string[] = [];
  const nextAttemptAt = "2026-11-06T15:00:00.000Z";
  let followed = false, automatic = false, saved = false, refreshCount = 0;
  try {
    const project = await db.altazorAcademicWorkspace.create({ data: {
      requestId: randomUUID(), ownerId: owner.id, kind: "call", title, briefJson: JSON.stringify({ call, task: "teaching_material" }),
    } });
    const catalogue = () => ({ sources, subscriptions: followed ? [{
      sourceId: "feed-es", checkedAt: refreshCount ? checkedAt : null,
      error: refreshCount === 2 ? "La fuente no respondió." : null,
      automatic, nextAttemptAt: automatic ? nextAttemptAt : null,
      lastAttemptAt: refreshCount ? checkedAt : null,
      newCount: refreshCount > 2 ? 2 : 0, changedCount: refreshCount > 2 ? 1 : 0,
      items: refreshCount ? [{ ...item, ...(saved && { workspaceId: project.id }), ...(refreshCount > 2 && { changed: true }) }] : [],
    }] : [] });
    await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.route(`**/api/altazor/academic/${project.id}`, async route => {
      const response = await route.fetch();
      const body = await response.json();
      await route.fulfill({ response, json: { ...body, callOrigin: { sourceId: "feed-es", sourceLabel: "Agencia ficticia", sourceUrl, country: "ES", itemId: item.id, checkedAt, ...item } } });
    });
    await page.route("**/api/altazor/academic/calls", async route => {
      if (route.request().method() === "GET") return route.fulfill({ json: catalogue() });
      const input = route.request().postDataJSON();
      actions.push(input.action);
      expect(input.sourceId).toBe("feed-es");
      if (input.action === "subscribe") followed = true;
      if (input.action === "unsubscribe") followed = false;
      if (input.action === "refresh") refreshCount++;
      if (input.action === "set-automatic") {
        expect(typeof input.enabled).toBe("boolean");
        automatic = input.enabled;
      }
      if (input.action === "save") {
        expect(input).toEqual({ action: "save", sourceId: "feed-es", itemId: item.id, checkedAt });
        saved = true;
        return route.fulfill({ json: { workspaceId: project.id, reused: false, workspace: { id: project.id, title, kind: "call", call } } });
      }
      return route.fulfill({ json: catalogue() });
    });

    await loginAs(page, email);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto("/academico");
    await page.getByRole("button", { name: "Docencia", exact: true }).click();
    await page.getByRole("link", { name: "Buscar convocatorias oficiales" }).click();
    const panel = page.getByRole("region", { name: "Convocatorias oficiales", exact: true });
    await expect(panel.getByRole("link", { name: "Portal oficial de Portal chileno ficticio" })).toHaveAttribute("href", sources[0].url);
    await expect(panel.getByRole("button", { name: "Seguir Portal chileno ficticio" })).toHaveCount(0);
    await panel.getByRole("combobox", { name: "País o región" }).selectOption("ES");
    await expect(panel.getByText("Portal chileno ficticio", { exact: true })).toHaveCount(0);
    await panel.getByRole("button", { name: "Seguir Agencia ficticia" }).click();
    await expect(panel.getByRole("button", { name: "Consultar feed de Agencia ficticia" })).toBeVisible();
    expect(actions).toEqual(["subscribe"]);
    await panel.getByRole("button", { name: "Consultar feed de Agencia ficticia" }).click();
    await expect(panel.getByRole("heading", { name: title })).toBeVisible();
    await expect(panel.getByText("Cierre por confirmar en las bases")).toBeVisible();
    const search = panel.getByRole("searchbox", { name: "Buscar en los avisos consultados" });
    await search.fill("imposible");
    await expect(panel.getByText("No encontramos avisos con esos términos.")).toBeVisible();
    await search.fill("ETICA");
    await expect(panel.getByRole("heading", { name: title })).toBeVisible();
    expect(actions).toEqual(["subscribe", "refresh"]);
    await panel.getByRole("button", { name: "Actualizar feed de Agencia ficticia" }).click();
    await expect(panel.getByText(/Se muestran los avisos de la última consulta disponible/)).toBeVisible();
    await expect(panel.getByRole("heading", { name: title })).toBeVisible();
    await panel.getByRole("button", { name: `Guardar ficha de ${title}` }).click();
    await expect(panel.getByRole("button", { name: `Abrir ficha de ${title}` })).toBeVisible();
    await expect(page.getByRole("region", { name: "Mis convocatorias" }).getByRole("button", { name: new RegExp(title) })).toBeVisible();
    await panel.getByRole("button", { name: "Actualizar feed de Agencia ficticia" }).click();
    await expect(panel.getByText(/El aviso cambió desde que guardaste la ficha/)).toBeVisible();
    await expect(panel.getByText(/2 avisos nuevos · 1 aviso actualizado/)).toBeVisible();
    await panel.getByRole("button", { name: "Activar consultas automáticas de Agencia ficticia" }).click();
    await expect(panel.getByText("Consultas automáticas activas")).toBeVisible();
    await expect(panel.getByText(/Siguiente consulta a partir de/).locator("time")).toHaveAttribute("datetime", nextAttemptAt);
    await panel.getByRole("button", { name: "Pausar consultas automáticas de Agencia ficticia" }).click();
    await expect(panel.getByText("Consulta manual", { exact: true })).toBeVisible();
    await expect(panel.getByText(/Siguiente consulta a partir de/)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    await panel.getByRole("button", { name: `Abrir ficha de ${title}` }).click();
    const fiche = page.getByRole("region", { name: "Ficha de la convocatoria" });
    await fiche.getByText("Origen de la convocatoria · Agencia ficticia").click();
    await expect(fiche.getByRole("link", { name: "Abrir aviso oficial" })).toHaveAttribute("href", url);
    await expect(fiche.getByText(item.summary)).toBeVisible();
    await page.getByRole("button", { name: "Docencia", exact: true }).click();
    await panel.getByRole("button", { name: "Dejar de seguir Agencia ficticia" }).click();
    await expect(panel.getByRole("button", { name: "Seguir Agencia ficticia" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Mis convocatorias" }).getByRole("button", { name: new RegExp(title) })).toBeVisible();
  } finally {
    await db.auditEvent.deleteMany({ where: { actorId: owner.id } });
    await db.altazorAcademicWorkspace.deleteMany({ where: { ownerId: owner.id } });
    await db.user.delete({ where: { id: owner.id } });
  }
});
