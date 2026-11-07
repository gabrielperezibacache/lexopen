import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
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

test("Docencia crea programas editables con las sesiones elegidas para cada encuentro", async ({ page }, info) => {
  test.setTimeout(90_000);
  const ownerId = `programs-${randomUUID()}`;
  const examples = [
    { kind: "seminar", label: "Seminario", region: "Programa del seminario", section: "Programa y ponentes" },
    { kind: "congress", label: "Congreso", region: "Programa del congreso", section: "Programa y mesas" },
    { kind: "workshop", label: "Taller", region: "Programa del taller", section: "Actividades y tiempos" },
  ] as const;
  try {
    const owner = await db.user.create({ data: {
      id: ownerId, name: "Profesional ficticio", email: `${ownerId}@example.invalid`, role: "abogado", password: await hash("lexopen", 10),
    } });
    await loginAs(page, owner.email);
    await page.setViewportSize({ width: 360, height: 800 });
    const academic = page.getByRole("region", { name: "Desarrollo académico", exact: true });
    for (const { kind, label, region, section } of examples) {
      await test.step(`Preparar programa para ${label.toLowerCase()}`, async () => {
        const title = `${label} ficticio de investigación`;
        const program = academic.getByRole("region", { name: region, exact: true });
        let projectId: string;
        if (kind === "seminar") {
          await page.goto("/academico?vista=docencia");
          await academic.getByRole("button", { name: /^Seminario / }).click();
          await academic.getByLabel("Nombre del trabajo", { exact: true }).fill(title);
          await academic.getByRole("button", { name: "Crear trabajo", exact: true }).click();
          await expect(program.getByRole("button", { name: "Crear programa", exact: true })).toBeVisible();
          projectId = (await db.altazorAcademicWorkspace.findFirstOrThrow({ where: { ownerId, title, kind } })).id;
        } else {
          projectId = (await db.altazorAcademicWorkspace.create({ data: { ownerId, title, kind, requestId: randomUUID() } })).id;
        }
        const open = "Apertura y discusión de fuentes";
        const close = "Puesta en común";
        const excluded = "Reunión de coordinación interna";
        await db.altazorTeachingSession.createMany({ data: [
          { workspaceId: projectId, requestId: randomUUID(), title: open, startsAt: new Date("2030-05-09T20:30:00Z"),
            endsAt: new Date("2030-05-09T21:30:00Z"), contentJson: JSON.stringify({
              readings: [{ title: "Lectura sobre métodos", href: "/biblioteca/libro-prueba?fragment=2#fragment-2" }],
              materials: [{ title: "Guía de discusión", href: "https://example.invalid/guias/discusion" }],
              outcomes: ["Comparar métodos de análisis."],
              speakers: ["Ponente ficticia del encuentro"],
              moderators: ["Moderador ficticio del encuentro"],
              location: "Sala 204 · modalidad híbrida",
              activity: "Compara las dos fuentes.\nAnota una conclusión fundamentada.",
            }) },
          { workspaceId: projectId, requestId: randomUUID(), title: excluded, startsAt: new Date("2030-05-09T22:00:00Z") },
          { workspaceId: projectId, requestId: randomUUID(), title: close, startsAt: new Date("2030-05-09T23:00:00Z") },
        ] });

        await page.goto(`/academico?trabajo=${projectId}`);
        await program.getByText("Material para participantes", { exact: true }).click();
        await expect(program.getByRole("button", { name: "Crear hoja para participantes", exact: true })).toBeDisabled();
        await academic.getByLabel("Tu objetivo o texto de trabajo", { exact: true }).fill("Nota privada del equipo organizador.");
        const picker = program.locator("#programa-agenda").getByText("Sesiones de la Agenda", { exact: true });
        const firstSession = program.getByRole("checkbox", { name: new RegExp(open) });
        const lastSession = program.getByRole("checkbox", { name: new RegExp(close) });
        const internalSession = program.getByRole("checkbox", { name: new RegExp(excluded) });
        await picker.click();
        await expect(firstSession).not.toBeChecked();
        await lastSession.evaluate(input => input.scrollIntoView({ block: "center", behavior: "instant" }));
        await lastSession.check();
        await firstSession.evaluate(input => input.scrollIntoView({ block: "center", behavior: "instant" }));
        await firstSession.check();
        await expect(program).toHaveCount(1);
        await expect(internalSession).not.toBeChecked();
        await academic.getByRole("button", { name: "Guardar cambios", exact: true }).click();
        await expect(academic.getByText("Objetivo y cambios guardados.", { exact: true })).toBeVisible();
        await page.reload();
        await picker.click();
        await expect(firstSession).toBeChecked();
        await expect(lastSession).toBeChecked();
        await expect(internalSession).not.toBeChecked();
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        if (kind === "seminar" && process.env.LEXOPEN_DOCENCIA_CONTENT_SCREENSHOT === "1") {
          await program.screenshot({ path: info.outputPath("programa-seminario-movil.png") });
          await page.setViewportSize({ width: 1280, height: 880 });
          await program.screenshot({ path: info.outputPath("programa-seminario-escritorio.png") });
          await page.setViewportSize({ width: 360, height: 800 });
        }

        await program.getByRole("button", { name: "Crear programa", exact: true }).click();
        const editor = academic.getByRole("region", { name: "Editor académico", exact: true });
        const text = editor.getByRole("textbox", { name: "Texto de trabajo", exact: true });
        await expect(text).toHaveValue(new RegExp(`## ${section}\\n\\n### ${open}`));
        const original = await text.inputValue();
        expect(original).toMatch(/16:30\s*–\s*17:30 \(Santiago\)/);
        expect(original).toContain("Lectura sobre métodos — /biblioteca/libro-prueba?fragment=2#fragment-2");
        expect(original).toContain("Guía de discusión — https://example.invalid/guias/discusion");
        expect(original).toContain("Comparar métodos de análisis.");
        expect(original).toContain("Ponente ficticia del encuentro");
        expect(original).toContain("Moderador ficticio del encuentro");
        expect(original).toContain("Sala 204 · modalidad híbrida");
        expect(original).toContain("Compara las dos fuentes.\nAnota una conclusión fundamentada.");
        expect(original).not.toContain(excluded);
        expect(original).toContain(`### ${close}`);
        expect(original.indexOf(open)).toBeLessThan(original.indexOf(close));

        const edited = `${original}\n\nNota para participantes del encuentro.`;
        await text.fill(edited);
        await expect(editor.getByText("Guardado", { exact: true })).toBeVisible();
        if (kind === "seminar") {
          const session = await db.altazorTeachingSession.findFirstOrThrow({ where: { workspaceId: projectId, title: open } });
          await db.altazorTeachingSession.update({ where: { id: session.id }, data: { contentJson: JSON.stringify({
            ...JSON.parse(session.contentJson), speakers: ["Ponente nueva"], moderators: ["Moderadora nueva"], location: "Sala nueva",
          }) } });
        }
        await page.reload();
        await expect(text).toHaveValue(edited);
        if (kind === "congress") {
          const originalProgramId = new URL(page.url()).searchParams.get("resultado");
          expect(originalProgramId).toBeTruthy();
          await academic.getByRole("button", { name: "Objetivo", exact: true }).click();
          const organization = academic.getByRole("region", { name: "Organización del congreso", exact: true });
          await organization.getByText("Ejes y mesas", { exact: true }).click();
          await organization.getByRole("button", { name: "Añadir eje", exact: true }).click();
          await organization.getByLabel("Nombre del eje 1", { exact: true }).fill("Métodos de investigación");
          await organization.getByRole("button", { name: "Añadir eje", exact: true }).click();
          await organization.getByLabel("Nombre del eje 2", { exact: true }).fill("Fuentes y argumentación");
          await organization.getByRole("group", { name: "Eje 1", exact: true }).getByRole("button", { name: "Añadir mesa", exact: true }).click();
          await organization.getByLabel("Nombre de la mesa 1", { exact: true }).fill("Mesa de metodología");
          await organization.getByLabel("Responsable de la mesa 1", { exact: true }).fill("Responsable ficticia de metodología");
          const firstTable = organization.getByRole("group", { name: "Mesa 1", exact: true });
          await firstTable.locator("summary").filter({ hasText: /^Sesiones de la mesa/ }).click();
          const tableClose = firstTable.getByRole("checkbox", { name: new RegExp(close) });
          await tableClose.evaluate(input => input.scrollIntoView({ block: "center", behavior: "instant" }));
          await tableClose.check();
          await organization.getByRole("group", { name: "Eje 2", exact: true }).getByRole("button", { name: "Añadir mesa", exact: true }).click();
          await organization.getByLabel("Nombre de la mesa 2", { exact: true }).fill("Mesa de fuentes");
          await organization.getByLabel("Responsable de la mesa 2", { exact: true }).fill("Responsable ficticio de fuentes");
          const secondTable = organization.getByRole("group", { name: "Mesa 2", exact: true });
          await secondTable.locator("summary").filter({ hasText: /^Sesiones de la mesa/ }).click();
          await expect(secondTable.getByRole("checkbox", { name: new RegExp(close) })).toBeDisabled();
          const tableOpen = secondTable.getByRole("checkbox", { name: new RegExp(open) });
          await tableOpen.evaluate(input => input.scrollIntoView({ block: "center", behavior: "instant" }));
          await tableOpen.check();
          await organization.getByLabel("Eje de la mesa 1", { exact: true }).selectOption({ label: "Fuentes y argumentación" });
          const movedTable = organization.getByRole("group", { name: "Eje 2", exact: true }).getByRole("group", { name: "Mesa 1", exact: true });
          await expect(movedTable.getByLabel("Responsable de la mesa 1", { exact: true })).toHaveValue("Responsable ficticia de metodología");
          await movedTable.locator("summary").filter({ hasText: /^Sesiones de la mesa/ }).click();
          await expect(movedTable.getByRole("checkbox", { name: new RegExp(close) })).toBeChecked();
          await organization.getByLabel("Eje de la mesa 1", { exact: true }).selectOption({ label: "Métodos de investigación" });
          const committee = academic.getByRole("region", { name: "Encargos del comité", exact: true });
          await committee.getByText("Encargos del comité", { exact: true }).click();
          await committee.getByRole("button", { name: "Añadir encargo", exact: true }).click();
          const committeeTask = committee.getByRole("group", { name: "Encargo 1", exact: true });
          await committeeTask.getByRole("textbox", { name: "Encargo 1", exact: true }).fill("Confirmar panelistas del congreso");
          await committeeTask.getByLabel("Mesa del encargo 1", { exact: true }).selectOption({ label: "Mesa de metodología" });
          await expect(committeeTask.getByLabel("Responsable del encargo 1", { exact: true })).toHaveValue("Responsable ficticia de metodología");
          await committeeTask.getByLabel("Fecha del encargo 1", { exact: true }).fill("2030-05-08T10:00");
          await committeeTask.getByText("Indicaciones", { exact: true }).click();
          await committeeTask.getByLabel("Indicaciones del encargo 1", { exact: true }).fill("Acuerdo privado sobre las invitaciones del comité.");
          await academic.getByRole("button", { name: "Guardar cambios", exact: true }).click();
          await expect(academic.getByText("Objetivo y cambios guardados.", { exact: true })).toBeVisible();
          await page.reload();
          await academic.getByRole("button", { name: "Objetivo", exact: true }).click();
          await organization.getByText("Ejes y mesas", { exact: true }).click();
          await expect(organization.getByLabel("Nombre del eje 1", { exact: true })).toHaveValue("Métodos de investigación");
          await expect(organization.getByLabel("Responsable de la mesa 2", { exact: true })).toHaveValue("Responsable ficticio de fuentes");
          if (process.env.LEXOPEN_DOCENCIA_CONTENT_SCREENSHOT === "1") {
            await organization.screenshot({ path: info.outputPath("congreso-mesas-movil.png") });
            await page.setViewportSize({ width: 1280, height: 880 });
            await organization.screenshot({ path: info.outputPath("congreso-mesas-escritorio.png") });
            await page.setViewportSize({ width: 360, height: 800 });
          }
          await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
          await program.getByRole("button", { name: "Crear programa", exact: true }).click();
          await expect(text).toHaveValue(/### Eje · Métodos de investigación/);
          const grouped = await text.inputValue();
          expect(grouped).toContain("**Mesa · Mesa de metodología**");
          expect(grouped).toContain("Responsable ficticia de metodología");
          expect(grouped).toContain("### Eje · Fuentes y argumentación");
          expect(grouped).toContain("**Mesa · Mesa de fuentes**");
          expect(grouped).toContain("Responsable ficticio de fuentes");
          expect(grouped.indexOf(close)).toBeLessThan(grouped.indexOf(open));
          expect(grouped).not.toContain(excluded);
          expect(grouped).not.toContain("Confirmar panelistas del congreso");
          expect(grouped).not.toContain("Acuerdo privado sobre las invitaciones del comité.");
          expect((await db.altazorAcademicArtifact.findUniqueOrThrow({ where: { id: originalProgramId! } })).body).toBe(edited);
          const committeeAgenda = "/calendario?vista=agenda&ym=2030-05&tipo=evento";
          const taskHref = `/academico?trabajo=${projectId}#encargos-comite`;
          await page.goto(committeeAgenda);
          const agendaTask = page.getByRole("link", { name: "10:00 · Docencia · Encargo · Confirmar panelistas del congreso", exact: true });
          await expect(agendaTask).toHaveAttribute("href", taskHref);
          await agendaTask.click();
          await expect(page).toHaveURL(new RegExp(`trabajo=${projectId}#encargos-comite$`));
          await expect(committee).toBeVisible();
          await committeeTask.locator("details").first().locator("summary").first().click();
          await expect(committeeTask.getByRole("textbox", { name: "Encargo 1", exact: true })).toHaveValue("Confirmar panelistas del congreso");
          await expect(committeeTask.getByLabel("Fecha del encargo 1", { exact: true })).toHaveValue("2030-05-08T10:00");
          if (process.env.LEXOPEN_DOCENCIA_CONTENT_SCREENSHOT === "1") {
            await committee.screenshot({ path: info.outputPath("encargos-comite-movil.png") });
            await page.setViewportSize({ width: 1280, height: 880 });
            await committee.screenshot({ path: info.outputPath("encargos-comite-escritorio.png") });
            await page.setViewportSize({ width: 360, height: 800 });
          }
          await committeeTask.getByLabel("Estado del encargo 1", { exact: true }).selectOption("done");
          await academic.getByRole("button", { name: "Guardar cambios", exact: true }).click();
          await expect(academic.getByText("Objetivo y cambios guardados.", { exact: true })).toBeVisible();
          await page.goto(committeeAgenda);
          await expect(agendaTask).toHaveCount(0);
          await page.goto(taskHref);
          await committeeTask.locator("details").first().locator("summary").first().click();
          await expect(committeeTask.getByLabel("Estado del encargo 1", { exact: true })).toHaveValue("done");
          await organization.getByText("Ejes y mesas", { exact: true }).click();
          await organization.getByRole("button", { name: "Quitar mesa 1", exact: true }).click();
          await page.getByRole("dialog").getByRole("button", { name: "Quitar mesa", exact: true }).click();
          await expect(committeeTask.getByLabel("Mesa del encargo 1", { exact: true })).toHaveValue("");
          await expect(committeeTask.getByRole("textbox", { name: "Encargo 1", exact: true })).toHaveValue("Confirmar panelistas del congreso");
          await academic.getByRole("button", { name: "Guardar cambios", exact: true }).click();
          await expect(academic.getByText("Objetivo y cambios guardados.", { exact: true })).toBeVisible();
          const meetings = academic.getByRole("region", { name: "Reuniones del comité", exact: true });
          await meetings.getByText("Reuniones del comité", { exact: true }).click();
          await meetings.getByRole("button", { name: "Añadir reunión", exact: true }).click();
          const meeting = meetings.getByRole("group", { name: "Reunión 1", exact: true });
          await meeting.getByLabel("Nombre de la reunión 1", { exact: true }).fill("Reunión ficticia de coordinación");
          await meeting.getByLabel("Fecha de la reunión 1", { exact: true }).fill("2030-05-06");
          await meeting.getByText("Notas y asistentes", { exact: true }).click();
          await meeting.getByLabel("Asistentes de la reunión 1", { exact: true }).fill("Integrante ficticia del comité");
          await meeting.getByLabel("Notas de la reunión 1", { exact: true }).fill("Nota privada sobre la distribución de invitaciones.");
          await meeting.getByRole("button", { name: "Añadir acuerdo", exact: true }).click();
          const agreement = meeting.getByRole("group", { name: "Acuerdo 1 de la reunión 1", exact: true });
          const agreementText = "Enviar las invitaciones del encuentro.\nConservar una lista de respuestas.";
          await agreement.getByLabel("Texto del acuerdo 1 de la reunión 1", { exact: true }).fill(agreementText);
          if (process.env.LEXOPEN_DOCENCIA_CONTENT_SCREENSHOT === "1") {
            await meetings.screenshot({ path: info.outputPath("reuniones-comite-movil.png") });
            await page.setViewportSize({ width: 1280, height: 880 });
            await meetings.screenshot({ path: info.outputPath("reuniones-comite-escritorio.png") });
            await page.setViewportSize({ width: 360, height: 800 });
          }
          let agreementConversions = 0;
          page.on("request", request => {
            if (request.method() === "POST" && new URL(request.url()).pathname.endsWith("/committee-agreements")) agreementConversions++;
          });
          const conversionResponse = page.waitForResponse(response => response.url().endsWith("/committee-agreements") && response.request().method() === "POST");
          await agreement.getByRole("button", { name: "Crear encargo desde este acuerdo", exact: true }).click();
          const conversion = await conversionResponse;
          expect(conversion.ok()).toBeTruthy();
          const { actionId } = await conversion.json() as { actionId: string };
          await expect(page).toHaveURL(new RegExp(`#encargo-${actionId}$`));
          const convertedTask = committee.getByRole("group", { name: "Encargo 2", exact: true });
          await expect(convertedTask.getByRole("textbox", { name: "Encargo 2", exact: true })).toHaveValue(agreementText.replace(/\s+/g, " "));
          await expect(convertedTask.getByLabel("Indicaciones del encargo 2", { exact: true })).toHaveValue(agreementText);
          await convertedTask.getByText("Origen del encargo", { exact: true }).click();
          await expect(convertedTask.getByText("Reunión ficticia de coordinación", { exact: true })).toBeVisible();
          await expect(convertedTask.locator("time")).toHaveAttribute("datetime", "2030-05-06");
          await expect(convertedTask.getByRole("paragraph").filter({ hasText: agreementText })).toBeVisible();
          const deliverableSummary = convertedTask.locator("summary").filter({ hasText: /^Entregables/ });
          await deliverableSummary.click();
          await convertedTask.getByRole("button", { name: "Añadir entregable", exact: true }).click();
          const firstDeliverable = convertedTask.getByRole("group", { name: "Entregable 1 del encargo 2", exact: true });
          await firstDeliverable.getByRole("textbox", { name: "Entregable 1 del encargo 2", exact: true }).fill("Lista de confirmaciones para revisión");
          const firstDeliveryLink = firstDeliverable.getByLabel("Enlace del entregable 1 del encargo 2", { exact: true });
          await firstDeliveryLink.fill("javascript:alert(1)");
          await expect(firstDeliveryLink).toHaveAttribute("aria-invalid", "true");
          await expect(firstDeliverable.getByRole("link", { name: "Abrir entregable", exact: true })).toHaveCount(0);
          await firstDeliveryLink.fill("https://example.invalid/comite/confirmaciones.pdf");
          await firstDeliverable.getByLabel("Estado del entregable 1 del encargo 2", { exact: true }).selectOption("submitted");
          await firstDeliverable.getByLabel("Observaciones de revisión del entregable 1 del encargo 2", { exact: true }).fill("Falta confirmar una respuesta antes de aprobar.");
          await expect(firstDeliverable.getByRole("link", { name: "Abrir entregable", exact: true })).toHaveAttribute("href", "https://example.invalid/comite/confirmaciones.pdf");
          await convertedTask.getByRole("button", { name: "Añadir entregable", exact: true }).click();
          const secondDeliverable = convertedTask.getByRole("group", { name: "Entregable 2 del encargo 2", exact: true });
          await secondDeliverable.getByLabel("Documento de este trabajo para el entregable 2 del encargo 2", { exact: true }).selectOption(originalProgramId!);
          await expect(secondDeliverable.getByLabel("Enlace del entregable 2 del encargo 2", { exact: true })).toHaveValue(`/academico?trabajo=${projectId}&resultado=${originalProgramId}`);
          await secondDeliverable.getByLabel("Estado del entregable 2 del encargo 2", { exact: true }).selectOption("approved");
          await expect(deliverableSummary).toContainText("1 de 2 aprobados · 1 para revisar");
          await academic.getByRole("button", { name: "Guardar cambios", exact: true }).click();
          await expect(academic.getByText("Objetivo y cambios guardados.", { exact: true })).toBeVisible();
          await page.reload();
          await expect(deliverableSummary).toContainText("1 de 2 aprobados · 1 para revisar");
          await deliverableSummary.click();
          await expect(firstDeliverable.getByLabel("Observaciones de revisión del entregable 1 del encargo 2", { exact: true })).toHaveValue("Falta confirmar una respuesta antes de aprobar.");
          await firstDeliverable.getByLabel("Estado del entregable 1 del encargo 2", { exact: true }).selectOption("approved");
          await firstDeliverable.getByLabel("Observaciones de revisión del entregable 1 del encargo 2", { exact: true }).fill("Confirmaciones revisadas y aprobadas.");
          await expect(deliverableSummary).toContainText("2 de 2 aprobados");
          await expect(convertedTask.getByLabel("Estado del encargo 2", { exact: true })).toHaveValue("pending");
          await academic.getByRole("button", { name: "Guardar cambios", exact: true }).click();
          await expect(academic.getByText("Objetivo y cambios guardados.", { exact: true })).toBeVisible();
          const deliverablesDetail = deliverableSummary.locator("..");
          await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
          if (process.env.LEXOPEN_DOCENCIA_CONTENT_SCREENSHOT === "1") {
            await deliverablesDetail.screenshot({ path: info.outputPath("entregables-comite-movil.png") });
            await page.setViewportSize({ width: 1280, height: 880 });
            await deliverablesDetail.screenshot({ path: info.outputPath("entregables-comite-escritorio.png") });
            await page.setViewportSize({ width: 360, height: 800 });
          }
          await convertedTask.getByText("Origen del encargo", { exact: true }).click();
          await expect(convertedTask.getByText("Reunión ficticia de coordinación", { exact: true })).toBeVisible();
          await expect(convertedTask.getByRole("paragraph").filter({ hasText: agreementText })).toBeVisible();
          if (process.env.LEXOPEN_DOCENCIA_CONTENT_SCREENSHOT === "1") {
            await convertedTask.screenshot({ path: info.outputPath("origen-acuerdo-movil.png") });
            await page.setViewportSize({ width: 1280, height: 880 });
            await convertedTask.screenshot({ path: info.outputPath("origen-acuerdo-escritorio.png") });
            await page.setViewportSize({ width: 360, height: 800 });
          }
          await page.goto(`/academico?trabajo=${projectId}#reuniones-comite`);
          const meetingDisclosure = meeting.locator("details").first();
          if (!await meetingDisclosure.evaluate(element => (element as HTMLDetailsElement).open)) {
            await meetingDisclosure.locator("summary").first().click();
          }
          await expect(agreement.getByRole("button", { name: "Crear encargo desde este acuerdo", exact: true })).toHaveCount(0);
          const existingAction = agreement.getByRole("link", { name: "Ver encargo", exact: true });
          await expect(existingAction).toHaveAttribute("href", `#encargo-${actionId}`);
          await existingAction.click();
          await expect(convertedTask.getByRole("textbox", { name: "Encargo 2", exact: true })).toHaveValue(agreementText.replace(/\s+/g, " "));
          expect(agreementConversions).toBe(1);
          const storedCongress = JSON.parse((await db.altazorAcademicWorkspace.findUniqueOrThrow({ where: { id: projectId } })).briefJson).congress;
          expect(storedCongress.actions.filter((item: { agreementOrigin?: { agreementText: string } }) => item.agreementOrigin?.agreementText === agreementText)).toHaveLength(1);
          const storedAction = storedCongress.actions.find((item: { id: string }) => item.id === actionId);
          expect(storedAction.deliverables.map((item: { status: string }) => item.status)).toEqual(["approved", "approved"]);
          expect(storedAction.agreementOrigin.meetingTitle).toBe("Reunión ficticia de coordinación");
        }
        if (kind === "workshop") {
          const programId = new URL(page.url()).searchParams.get("resultado");
          expect(programId).toBeTruthy();
          await academic.getByRole("button", { name: "Objetivo", exact: true }).click();
          await program.getByText("Material para participantes", { exact: true }).click();
          await program.getByRole("button", { name: "Crear hoja para participantes", exact: true }).click();
          await expect(text).toHaveValue(/Hoja para participantes/);
          const handout = await text.inputValue();
          expect(handout).toContain(open);
          expect(handout).toContain(close);
          expect(handout).toMatch(/16:30\s*–\s*17:30 \(Santiago\)/);
          expect(handout).toContain("Lectura sobre métodos");
          expect(handout).toContain("Guía de discusión");
          expect(handout).toContain("Comparar métodos de análisis.");
          expect(handout).toContain("Ponente ficticia del encuentro");
          expect(handout).toContain("Moderador ficticio del encuentro");
          expect(handout).toContain("Sala 204 · modalidad híbrida");
          expect(handout).toContain("Compara las dos fuentes.\nAnota una conclusión fundamentada.");
          expect(handout).toContain("Tus notas");
          expect(handout).not.toContain(excluded);
          expect(handout).not.toContain("Nota privada del equipo organizador.");
          expect(handout).not.toContain("Nota para participantes del encuentro.");
          expect((await db.altazorAcademicArtifact.findUniqueOrThrow({ where: { id: programId! } })).body).toBe(edited);
          const download = page.waitForEvent("download");
          await editor.getByRole("link", { name: "Markdown", exact: true }).click();
          const destination = info.outputPath("hoja-participantes-ficticia.md");
          await (await download).saveAs(destination);
          expect(await readFile(destination, "utf8")).toBe(handout);
        }
      });
    }
  } finally {
    await db.auditEvent.deleteMany({ where: { actorId: ownerId } });
    await db.altazorAcademicWorkspace.deleteMany({ where: { ownerId } });
    await db.user.deleteMany({ where: { id: ownerId } });
  }
});
