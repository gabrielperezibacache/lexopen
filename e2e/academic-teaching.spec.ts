import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs } from "./helpers";

const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
if (new URL(process.env.DATABASE_URL!).toString() !== url) throw Error("Use the explicitly disposable fixture");
const db = new PrismaClient({ datasources: { db: { url } } });
test.afterAll(async () => { await db.$disconnect(); });

test("Docencia agenda una actividad privada en la hora de Santiago y vuelve al trabajo", async ({ page, browser }, info) => {
  test.setTimeout(90_000);
  const tag = randomUUID(), userIds = [`${tag}-teaching-owner`, `${tag}-teaching-other`];
  const activity = "Clase ficticia de argumentación";
  const agenda = "/calendario?vista=agenda&ym=2026-11&tipo=evento";
  const date = "2026-11-29"; // Domingo por la noche en Santiago, lunes a medianoche UTC.
  const secondContext = await browser.newContext({ baseURL: info.project.use.baseURL, locale: "es-CL" });
  try {
    const password = await hash("lexopen", 10);
    const [owner, other] = await Promise.all(userIds.map(id => db.user.create({ data: { id, name: "Profesional ficticio", email: `${id}@example.invalid`, role: "abogado", password } })));
    const project = await db.altazorAcademicWorkspace.create({ data: { ownerId: owner.id, title: "Curso ficticio de argumentación", kind: "course", requestId: randomUUID() } });
    const projectHref = `/academico?trabajo=${project.id}#agenda-docencia`;
    await loginAs(page, owner.email);
    await page.goto(projectHref);
    const teaching = page.getByRole("region", { name: "Actividades en mi Agenda", exact: true });
    await teaching.getByRole("textbox", { name: "Nombre de la actividad", exact: true }).fill(activity);
    await teaching.getByLabel("Inicio", { exact: true }).fill(`${date}T21:00`);
    await teaching.getByLabel("Término (opcional)", { exact: true }).fill(`${date}T22:00`);
    await teaching.getByRole("button", { name: "Agregar a mi Agenda", exact: true }).click();
    await expect(teaching.getByText("Actividad agregada a tu Agenda de LexOpen.", { exact: true })).toBeVisible();
    const stored = await db.altazorTeachingSession.findFirstOrThrow({ where: { workspaceId: project.id } });
    expect(stored.startsAt.toISOString()).toBe("2026-11-30T00:00:00.000Z");
    expect(await db.evento.count({ where: { id: stored.id } })).toBe(0);
    const go = teaching.getByRole("link", { name: "Ver en Agenda", exact: true });
    await expect(go).toHaveAttribute("href", agenda);
    await go.click();
    const agendaLink = page.getByRole("link", { name: `21:00 · Docencia · ${activity}`, exact: true });
    await expect(agendaLink).toHaveAttribute("href", projectHref);
    await page.goto("/calendario?vista=mes&ym=2026-11&tipo=evento");
    await expect(page.getByTestId(`cal-day-${date}`).getByRole("link", { name: `Docencia · ${activity}`, exact: true })).toHaveAttribute("href", projectHref);
    await page.goto(`/calendario?vista=semana&semana=${date}&tipo=evento`);
    await expect(page.getByTestId(`cal-day-${date}`).getByRole("link", { name: `Docencia · ${activity}`, exact: true })).toBeVisible();
    await page.setViewportSize({ width: 360, height: 800 });
    await expect(agendaLink).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);

    const foreignPage = await secondContext.newPage();
    await loginAs(foreignPage, other.email);
    await foreignPage.goto(agenda);
    await expect(foreignPage.getByRole("heading", { name: "Calendario", exact: true })).toBeVisible();
    await expect(foreignPage.getByText(activity, { exact: false })).toHaveCount(0);
    expect((await foreignPage.request.get(`/api/altazor/academic/${project.id}/teaching-sessions`)).status()).toBe(404);
    const exported = await page.request.get(`/api/calendario/ics?desde=${date}&hasta=2026-12-03`);
    expect(exported.ok()).toBeTruthy();
    expect(await exported.text()).not.toContain(activity);

    await agendaLink.click();
    await expect(teaching.getByText(activity, { exact: true })).toBeVisible();
    await teaching.getByRole("button", { name: `Retirar de Agenda: ${activity}`, exact: true }).click();
    await page.getByRole("dialog", { name: "Retirar actividad de la Agenda", exact: true }).getByRole("button", { name: "Retirar", exact: true }).click();
    await expect(teaching.getByText("Actividad retirada de tu Agenda.", { exact: true })).toBeVisible();
    await page.goto(agenda);
    await expect(page.getByText(activity, { exact: false })).toHaveCount(0);
  } finally {
    await secondContext.close();
    await db.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
    await db.altazorAcademicWorkspace.deleteMany({ where: { ownerId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
  }
});
