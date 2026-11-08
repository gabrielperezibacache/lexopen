import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { CSRF_COOKIE, CSRF_HEADER } from "../src/lib/auth/csrf-constants";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs } from "./helpers";

const database = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
if (new URL(process.env.DATABASE_URL!).toString() !== database) throw new Error("Use the disposable browser database");
const db = new PrismaClient({ datasources: { db: { url: database } } });

test("Calendario docente por URL: actualizaciones, lectura sin sesión y revocación", async ({ page, browser, playwright }, testInfo) => {
  const baseURL = new URL(testInfo.project.use.baseURL as string).origin;
  const tag = randomUUID();
  const accounts = [`owner-${tag}@example.invalid`, `other-${tag}@example.invalid`];
  const password = await hash("lexopen", 10);
  const otherContext = await browser.newContext({ baseURL });
  const calendar = await playwright.request.newContext({ baseURL });
  try {
    const [owner] = await Promise.all(accounts.map(email => db.user.create({
      data: { email, name: "Usuario ficticio", role: "abogado", password },
    })));
    const work = await db.altazorAcademicWorkspace.create({ data: {
      ownerId: owner.id, kind: "call", title: "Convocatoria de prueba", requestId: randomUUID(),
      briefJson: JSON.stringify({ call: { deadline: "2026-12-16" }, objective: "Texto privado ajeno a la Agenda." }),
    } });
    await loginAs(page, accounts[0]);
    const otherPage = await otherContext.newPage();
    await loginAs(otherPage, accounts[1]);
    const csrf = (await page.context().cookies()).find(cookie => cookie.name === CSRF_COOKIE)?.value;
    expect(csrf).toBeTruthy();
    const headers = { Origin: baseURL, [CSRF_HEADER]: csrf! };
    const base = `/api/altazor/academic/${work.id}`;
    const manage = `${base}/calendar-feed`;
    const agenda = `${base}/teaching-sessions`;
    expect((await otherPage.request.get(manage)).status()).toBe(404);
    expect(await (await page.request.get(manage)).json()).toMatchObject({ enabled: false });
    expect((await page.request.post(manage, { headers: { Origin: "https://other.example.invalid" } })).status()).toBe(403);
    if (process.env.E2E_SERVER_MODE === "production") expect((await page.request.post(manage)).status()).toBe(403);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`/academico?trabajo=${work.id}#agenda-docencia`);
    const panel = page.getByRole("region", { name: "Actividades en mi Agenda" });
    const disclosure = panel.getByText("Suscribir otro calendario", { exact: true });
    await disclosure.click();
    await panel.getByRole("button", { name: "Activar suscripción" }).click();
    const confirmation = panel.getByRole("group", { name: "Confirmar cambio de suscripción" });
    await expect(confirmation).toContainText("títulos y horarios");
    await confirmation.getByRole("button", { name: "Generar enlace" }).click();
    const url = panel.getByRole("textbox", { name: "Enlace para suscribirse" });
    await expect(url).toHaveValue(new RegExp("^" + baseURL.replace(/\./g, "\\.") + "/api/"));
    const firstLink = new URL(await url.inputValue()).pathname;
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await disclosure.click();
    await expect(url).toHaveCount(0);
    await disclosure.click();
    await expect(panel.getByText(/Enlace activo/)).toBeVisible();
    await expect(url).toHaveCount(0);
    expect(firstLink).toMatch(/^\/api\/altazor\/academic\/calendar-subscriptions\//);
    expect(await (await page.request.get(manage)).json()).toEqual({
      enabled: true, enabledAt: expect.any(String),
    });
    const wrongToken = firstLink.slice(0, -1) + (firstLink.endsWith("A") ? "B" : "A");
    const missing = await calendar.get(wrongToken, { maxRedirects: 0 });
    expect(missing.status()).toBe(404);
    expect((await calendar.get(firstLink + "x", { maxRedirects: 0 })).status()).toBe(404);
    expect((await calendar.post(firstLink, { maxRedirects: 0 })).status()).toBe(404);
    const empty = await calendar.get(firstLink, { maxRedirects: 0 });
    expect(empty.status()).toBe(200);
    expect(empty.headers()["cache-control"]).toContain("no-store");
    expect(empty.headers()["referrer-policy"]).toBe("no-referrer");
    const emptyFeed = await empty.text();
    expect(emptyFeed).toContain("BEGIN:VTIMEZONE");
    expect(emptyFeed).not.toContain("BEGIN:VEVENT");
    const head = await calendar.head(firstLink, { maxRedirects: 0 });
    expect(head.status()).toBe(200);
    expect((await head.body()).length).toBe(0);

    const schedule = async (time: string) => {
      const response = await page.request.post(agenda, { headers, data: {
        action: "schedule-call-deadline", date: "2026-12-16", localDate: "2026-12-15", time,
      } });
      expect(response.ok()).toBeTruthy();
      return (await response.json()).session.id as string;
    };
    const activityId = await schedule("15:30");
    const first = await (await calendar.get(firstLink)).text();
    expect(first).toContain("DTSTART:20261215T183000Z");
    expect(first).not.toContain("Texto privado ajeno a la Agenda.");
    expect(first).not.toContain(accounts[0]);
    const uid = first.match(/^UID:.*$/m)?.[0];
    expect(uid).toBeTruthy();
    expect(await schedule("17:30")).toBe(activityId);
    const second = await (await calendar.get(firstLink)).text();
    expect(second).toContain(uid!);
    expect(second).toContain("DTSTART:20261215T203000Z");
    expect(second).not.toContain("DTSTART:20261215T183000Z");
    expect(second).toContain("SEQUENCE:1");
    expect((await page.request.delete(`${agenda}/${activityId}`, { headers })).ok()).toBeTruthy();
    expect(await (await calendar.get(firstLink)).text()).not.toContain(uid!);

    const replacement = (await (await page.request.post(manage, { headers })).json()).path as string;
    expect(replacement).not.toBe(firstLink);
    expect((await calendar.get(firstLink, { maxRedirects: 0 })).status()).toBe(404);
    expect((await calendar.get(replacement, { maxRedirects: 0 })).status()).toBe(200);
    expect((await page.request.delete(manage, { headers })).ok()).toBeTruthy();
    expect((await calendar.get(replacement, { maxRedirects: 0 })).status()).toBe(404);
  } finally {
    await calendar.dispose();
    await otherContext.close();
    const rows = await db.user.findMany({ where: { email: { in: accounts } }, select: { id: true } });
    await db.auditEvent.deleteMany({ where: { actorId: { in: rows.map(row => row.id) } } });
    await db.user.deleteMany({ where: { email: { in: accounts } } });
  }
});

test.afterAll(async () => db.$disconnect());
