import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { CSRF_COOKIE, CSRF_HEADER } from "../src/lib/auth/csrf-constants";
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

test("Una serie docente se puede editar por sesión y cancelar desde una fecha en el calendario suscrito", async ({ page, playwright }, info) => {
  const baseURL = new URL(info.project.use.baseURL as string).origin;
  const calendar = await playwright.request.newContext({ baseURL });
  const id = `series-${randomUUID()}`;
  const title = "Seminario ficticio de argumentación";
  try {
    const owner = await db.user.create({ data: {
      id, name: "Profesional ficticio", email: `${id}@example.invalid`, role: "abogado", password: await hash("lexopen", 10),
    } });
    const project = await db.altazorAcademicWorkspace.create({ data: { ownerId: id, title, kind: "seminar", requestId: randomUUID() } });
    await loginAs(page, owner.email);
    const csrf = (await page.context().cookies()).find(cookie => cookie.name === CSRF_COOKIE)?.value;
    expect(csrf).toBeTruthy();
    const response = await page.request.post(`/api/altazor/academic/${project.id}/calendar-feed`, {
      headers: { Origin: baseURL, [CSRF_HEADER]: csrf! },
    });
    expect(response.ok()).toBeTruthy();
    const { path } = await response.json() as { path: string };
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`/academico?trabajo=${project.id}#agenda-docencia`);
    const teaching = page.getByRole("region", { name: "Actividades en mi Agenda", exact: true });
    await teaching.getByRole("textbox", { name: "Nombre de la actividad", exact: true }).fill(title);
    await teaching.getByLabel("Inicio", { exact: true }).fill("2030-05-09T16:30");
    await teaching.getByLabel("Término (opcional)", { exact: true }).fill("2030-05-09T17:30");
    await teaching.getByText("Repetición y recordatorio", { exact: true }).click();
    await teaching.getByLabel("Repetir", { exact: true }).selectOption("1");
    await teaching.getByLabel("Número de sesiones").fill("3");
    await teaching.getByLabel("Recordatorio de la actividad").selectOption("60");
    await teaching.getByRole("button", { name: "Agregar a mi Agenda", exact: true }).click();
    const occurrence = teaching.getByRole("listitem").filter({ hasText: "sesión 2 de 3" });
    await expect(occurrence).toBeVisible();
    const initial = await db.altazorTeachingSession.findMany({ where: { workspaceId: project.id }, orderBy: { startsAt: "asc" } });
    expect(initial).toHaveLength(3);
    expect(initial.map(session => session.reminderLeadMinutes)).toEqual([60, 60, 60]);
    const firstFeed = await (await calendar.get(path)).text();
    expect(firstFeed.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(firstFeed).toContain(`UID:${initial[1].id}@lexopen`);
    await occurrence.getByRole("button", { name: `Editar actividad: ${title}` }).click();
    const editing = teaching.getByRole("form", { name: "Editar actividad", exact: true });
    await expect.poll(() => editing.evaluate(form => {
      const header = document.querySelector("header.shell-header");
      const top = form.getBoundingClientRect().top;
      return top >= (header?.getBoundingClientRect().bottom ?? 0) && top < window.innerHeight;
    })).toBe(true);
    await editing.getByLabel("Nombre de la sesión").fill("Segunda sesión reprogramada");
    await editing.getByLabel("Inicio de la sesión").fill("2030-05-16T16:50");
    await editing.getByRole("button", { name: "Guardar cambios", exact: true }).click();
    await expect(occurrence.getByText("Segunda sesión reprogramada", { exact: true })).toBeVisible();
    const secondFeed = await (await calendar.get(path)).text();
    expect(secondFeed).toContain(`UID:${initial[1].id}@lexopen`);
    expect(secondFeed).toContain("SUMMARY:Segunda sesión reprogramada");
    expect(secondFeed).toContain("SEQUENCE:1");
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const reminder = teaching.getByRole("form", { name: "Recordatorio de la sesión", exact: true });
    await reminder.getByLabel("Avisar con antelación").selectOption("15");
    await reminder.getByRole("button", { name: "Guardar recordatorio" }).click();
    await expect(teaching.getByText("Recordatorio guardado.", { exact: true })).toBeVisible();
    const configured = await db.altazorTeachingSession.findUniqueOrThrow({ where: { id: initial[1].id } });
    expect(configured.reminderLeadMinutes).toBe(15);
    expect(configured.calendarSequence).toBe(1);
    await teaching.getByRole("button", { name: "Cerrar opciones", exact: true }).click();

    await occurrence.getByRole("button", { name: "Retirar de Agenda: Segunda sesión reprogramada" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("radio", { name: "Esta sesión y las siguientes" }).check();
    await dialog.getByRole("button", { name: "Retirar sesiones", exact: true }).click();
    await expect(occurrence).toHaveCount(0);
    const remainingFeed = await (await calendar.get(path)).text();
    expect(remainingFeed.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(remainingFeed).toContain(`UID:${initial[0].id}@lexopen`);
  } finally {
    await calendar.dispose();
    await db.auditEvent.deleteMany({ where: { actorId: id } });
    await db.altazorAcademicWorkspace.deleteMany({ where: { ownerId: id } });
    await db.user.deleteMany({ where: { id } });
  }
});
