import { test, expect, type Page, type Route } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { prisma } from "../src/lib/db";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs } from "./helpers";

// Network-failure fixtures must intercept requests before any service worker.
test.use({ serviceWorkers: "block" });
assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL) throw Error("Use the explicit disposable database");
async function fixture(page: Page, readOnly = false) {
  const tag = randomUUID(), ids: string[] = [], password = await hash("lexopen", 10);
  const person = async (name: string) => { const u = await prisma.user.create({ data: { name, email: `${tag}-${name.toLowerCase().replaceAll(" ", "-")}@pr-review.invalid`, role: "abogado", password } }); ids.push(u.id); return u; };
  const owner = await person("Responsable"), member = await person("Integrante"), candidate = await person("Nueva persona");
  const cause = await prisma.causa.create({ data: { titulo: `Causa ${tag}`, tribunal: "Ficticio", materia: "civil", abogadoId: owner.id, acceso: "equipo" } });
  await prisma.causaMiembro.createMany({ data: [{ causaId: cause.id, userId: owner.id, rol: "responsable" }, { causaId: cause.id, userId: member.id, rol: readOnly ? "lectura" : "colaborador" }] });
  const site = await prisma.site.create({ data: { name: tag, slug: tag, causaId: cause.id, members: { create: { userId: owner.id, role: "admin" } } } });
  const task = await prisma.task.create({ data: { title: `Seguimiento ${tag}`, siteId: site.id, causaId: cause.id, creatorId: owner.id, assigneeId: owner.id } });
  await loginAs(page, readOnly ? member.email : owner.email);
  return { owner, member, candidate, cause, site, task, cleanup: async () => {
    await prisma.task.deleteMany({ where: { siteId: site.id } }); await prisma.site.delete({ where: { id: site.id } }); await prisma.causa.delete({ where: { id: cause.id } }); await prisma.auditEvent.deleteMany({ where: { actorId: { in: ids } } }); await prisma.user.deleteMany({ where: { id: { in: ids } } });
  } };
}
function gate() { let release!: () => void; const wait = new Promise<void>(resolve => { release = resolve; }); return { wait, release: () => release() }; }
test("Equipo distingue cambio de acceso, retirada y alta, y recupera el fallo sin bloquearse", async ({ page }) => {
  const f = await fixture(page), access = gate(), removal = gate(), addition = gate();
  try {
    await page.goto(`/causas/${f.cause.id}`);
    await page.locator("#main-content").getByText("Equipo y gestión de la causa", { exact: true }).click();
    const team = page.locator("section").filter({ has: page.getByRole("heading", { name: "Equipo de la causa", exact: true }) });
    await page.route(`**/api/causas/${f.cause.id}/equipo*`, async route => {
      const method = route.request().method();
      if (method === "PATCH") await access.wait;
      if (method === "DELETE") await removal.wait;
      if (method === "POST") await addition.wait;
      await route.continue();
    });
    await team.getByRole("button", { name: "Estudio", exact: true }).click();
    await expect(team.getByRole("group", { name: "Nivel de acceso" })).toHaveAttribute("aria-busy", "true");
    await expect(team.getByRole("button", { name: "Agregar", exact: true })).toHaveAttribute("aria-busy", "false");
    await expect(team.getByRole("button", { name: "Agregando…", exact: true })).toHaveCount(0);
    access.release(); await expect(team.getByRole("button", { name: "Estudio", exact: true })).toHaveAttribute("aria-pressed", "true");
    await team.getByRole("button", { name: `Quitar a ${f.member.name}`, exact: true }).click();
    await expect(team.getByRole("button", { name: `Quitando a ${f.member.name}`, exact: true })).toBeDisabled();
    await expect(team.getByRole("button", { name: "Agregar", exact: true })).toHaveAttribute("aria-busy", "false");
    removal.release(); await expect(team.getByRole("button", { name: `Quitar a ${f.member.name}`, exact: true })).toHaveCount(0);
    await team.locator('select[name="userId"]').selectOption(f.candidate.id);
    await team.getByRole("button", { name: "Agregar", exact: true }).click();
    await expect(team.getByRole("button", { name: "Agregando…", exact: true })).toHaveAttribute("aria-busy", "true");
    addition.release(); await expect(team.getByRole("button", { name: "Agregar", exact: true })).toBeEnabled();
    await expect(team.locator('select[name="userId"]')).toHaveValue("");
    await expect(team.getByRole("button", { name: `Quitar a ${f.candidate.name}`, exact: true })).toBeVisible();
    await page.route(`**/api/causas/${f.cause.id}/equipo`, route => route.request().method() === "PATCH" ? route.fulfill({ status: 503, json: { error: "Fallo ficticio de acceso" } }) : route.continue());
    await team.getByRole("button", { name: "Solo equipo (muro ético)", exact: true }).click();
    await expect(team.getByRole("alert")).toContainText("Fallo ficticio");
    await expect(team.getByRole("button", { name: "Estudio", exact: true })).toBeEnabled();
    await expect(team.getByRole("button", { name: "Estudio", exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(await prisma.causaMiembro.count({ where: { causaId: f.cause.id, userId: f.candidate.id } })).toBe(1);
  } finally { access.release(); removal.release(); addition.release(); await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {}); await f.cleanup(); }
});
test("Tareas identifica la acción pendiente, recupera errores y completa una vez", async ({ page }) => {
  const f = await fixture(page), progress = gate(), completion = gate(); let writes = 0;
  try {
    await page.goto(`/sites/${f.site.id}/tareas`);
    const row = page.locator(".panel").filter({ has: page.getByRole("heading", { name: f.task.title, exact: true }) });
    await page.route(`**/api/sites/${f.site.id}/tasks`, async (route: Route) => {
      if (route.request().method() !== "PATCH") return route.continue(); writes++;
      if (route.request().postDataJSON().status === "in_progress") { await progress.wait; return route.fulfill({ status: 503, json: { error: "Fallo ficticio de tarea" } }); }
      await completion.wait; return route.continue();
    });
    await row.getByRole("button", { name: "En curso", exact: true }).click();
    await expect(row.getByRole("button", { name: "Actualizando…", exact: true })).toBeDisabled();
    await expect(row.getByRole("button", { name: "Marcar hecha", exact: true })).toBeDisabled();
    progress.release(); await expect(row.getByRole("alert")).toContainText("Fallo ficticio"); await expect(row.getByRole("button", { name: "En curso", exact: true })).toBeEnabled();
    await row.getByRole("button", { name: "Marcar hecha", exact: true }).click();
    await expect(row.getByRole("button", { name: "Marcando…", exact: true })).toBeDisabled();
    completion.release(); await expect(row.getByRole("button", { name: "Marcando…", exact: true })).toHaveCount(0);
    expect((await prisma.task.findUniqueOrThrow({ where: { id: f.task.id } })).status).toBe("done"); expect(writes).toBe(2);
  } finally { progress.release(); completion.release(); await page.unrouteAll({ behavior: "ignoreErrors" }).catch(() => {}); await f.cleanup(); }
});
test("Equipo conserva los controles de lectura sin ofrecer escritura", async ({ page }) => {
  const f = await fixture(page, true);
  try { await page.goto(`/causas/${f.cause.id}`); await page.locator("#main-content").getByText("Equipo y gestión de la causa", { exact: true }).click(); const group = page.getByRole("group", { name: "Nivel de acceso" }); await expect(group.getByRole("button", { name: "Estudio", exact: true })).toBeDisabled(); await expect(group.getByRole("button", { name: "Solo equipo (muro ético)", exact: true })).toBeDisabled(); const team = page.locator("section").filter({ has: page.getByRole("heading", { name: "Equipo de la causa", exact: true }) }); await expect(team.getByRole("button", { name: "Agregar", exact: true })).toHaveCount(0); }
  finally { await f.cleanup(); }
});
