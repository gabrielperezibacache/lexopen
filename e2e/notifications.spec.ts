import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs } from "./helpers";

test("la campana muestra avisos privados, sincroniza las lecturas y se puede usar en móvil", async ({ page }, testInfo) => {
  test.setTimeout(75_000);
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  expect(new URL(process.env.DATABASE_URL!).toString()).toBe(url);
  const db = new PrismaClient({ datasources: { db: { url } } });
  const email = `avisos-${randomUUID()}@example.invalid`;
  const user = await db.user.create({ data: { name: "Profesional ficticio", email, role: "abogado", password: await bcrypt.hash("lexopen", 10) } });
  let hiddenCausaId = "";
  try {
    const other = await db.user.findUniqueOrThrow({ where: { email: "socio@estudio.cl" } });
    const hiddenCausa = await db.causa.create({ data: { titulo: "Causa de otro equipo", materia: "civil", tribunal: "Tribunal ficticio", acceso: "equipo", abogadoId: other.id } });
    hiddenCausaId = hiddenCausa.id;
    const hidden = await db.notification.create({ data: { userId: user.id, title: "Aviso fuera del equipo", body: "No aparece en la bandeja", entityType: "causa", entityId: hiddenCausa.id, href: `/causas/${hiddenCausa.id}` } });
    await page.setViewportSize({ width: 360, height: 800 });
    await page.emulateMedia({ colorScheme: "dark" });
    await loginAs(page, email);
    const bell = page.getByRole("button", { name: /^Notificaciones/ });
    const drawer = page.getByRole("dialog", { name: "Notificaciones", exact: true });
    await expect(bell).toHaveAccessibleName("Notificaciones");
    await bell.focus();
    await page.keyboard.press("Enter");
    await expect(drawer.getByText("Aún no tienes notificaciones", { exact: true })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Cerrar", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(bell).toBeFocused();

    const access = await db.causaMiembro.create({ data: { causaId: hiddenCausa.id, userId: user.id, rol: "lectura", desde: new Date(0) } });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(bell).toHaveAccessibleName("Notificaciones · 1 sin leer");
    const badge = bell.locator(".notification-bell-badge");
    await expect(badge).toHaveText("1");
    await expect(badge).toHaveCSS("background-color", "rgb(170, 181, 255)");
    await bell.click();
    await expect(drawer.getByText(hidden.title, { exact: true })).toBeVisible();
    await db.causaMiembro.delete({ where: { id: access.id } });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(drawer.getByText("Aún no tienes notificaciones", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");

    const general = await db.notification.create({ data: { userId: user.id, title: "Tarea ficticia para revisar", body: "Lee la resolución antes de la reunión.", href: "javascript:void(0)" } });
    const critical = await db.notification.create({ data: { userId: user.id, title: "Aviso crítico ficticio", body: "Confirma recepción del aviso de prueba.", severidad: "critica", href: "/tareas" } });
    await db.notification.createMany({ data: Array.from({ length: 105 }, (_, index) => ({
      userId: user.id, title: `Aviso revocado ${index}`, body: "Ejemplo reservado", entityType: "causa", entityId: hiddenCausa.id,
      createdAt: new Date("2099-01-01T00:00:00.000Z"),
    })) });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(bell).toHaveAccessibleName("Notificaciones · 2 sin leer");
    const preview = "**/api/notifications?view=preview";
    await page.route(preview, route => route.fulfill({ status: 503, json: { error: "Error ficticio" } }));
    await bell.click();
    await expect(drawer.getByRole("alert")).toHaveText("No pudimos cargar tus notificaciones.");
    await page.unroute(preview);
    await drawer.getByRole("button", { name: "Volver a intentar", exact: true }).click();
    const list = drawer.getByRole("list", { name: "Avisos recientes" });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await expect(drawer.getByText(hidden.title, { exact: true })).toHaveCount(0);
    const generalItem = list.getByRole("listitem").filter({ hasText: general.title });
    await expect(generalItem.getByRole("link")).toHaveCount(0);
    await expect.poll(() => drawer.evaluate(dialog => dialog.scrollWidth)).toBeLessThanOrEqual(360);
    await page.screenshot({ path: testInfo.outputPath("notificaciones-movil.png"), animations: "disabled" });

    const markOne = generalItem.getByRole("button", { name: /Marcar como leída/ });
    const mutation = "**/api/notifications";
    await page.route(mutation, route => route.fulfill({ status: 503, json: { error: "Error ficticio" } }));
    await markOne.click();
    await expect(drawer.getByRole("alert")).toHaveText("No pudimos confirmar el cambio. Vuelve a intentarlo.");
    await expect(drawer.getByRole("status")).toHaveText("2 sin leer");
    await page.unroute(mutation);
    await markOne.click();
    await expect(drawer.getByRole("status")).toHaveText("1 sin leer");
    await expect(markOne).toHaveCount(0);
    await drawer.getByRole("button", { name: "Marcar todas como leídas", exact: true }).click();
    await expect(drawer.getByRole("status")).toHaveText("Todas leídas");
    await expect(drawer.getByText("Pendiente de acuse", { exact: true })).toBeVisible();
    expect((await db.notification.findUniqueOrThrow({ where: { id: critical.id } })).ackAt).toBeNull();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: testInfo.outputPath("notificaciones-escritorio.png"), animations: "disabled" });
    await drawer.getByRole("link", { name: "Ver todas las notificaciones", exact: true }).click();
    await expect(page).toHaveURL(/\/notificaciones$/);
    await expect(drawer).toBeHidden();
    await expect(bell).toHaveAccessibleName("Notificaciones");
    const criticalRow = page.getByRole("article").filter({ hasText: critical.title });
    await criticalRow.getByRole("button", { name: "Acusar recibo", exact: true }).click();
    await expect(criticalRow.getByText("Acusado", { exact: true })).toBeVisible();
    await expect(bell).toHaveAccessibleName("Notificaciones");

    const next = await db.notification.create({ data: { userId: user.id, title: "Nueva notificación ficticia", body: "Otro aviso por revisar." } });
    await page.reload();
    await expect(bell).toHaveAccessibleName("Notificaciones · 1 sin leer");
    await expect(criticalRow.getByText("Acusado", { exact: true })).toBeVisible();
    await bell.click();
    await drawer.getByRole("button", { name: "Marcar todas como leídas", exact: true }).click();
    await expect(drawer.getByRole("status")).toHaveText("Todas leídas");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("main").getByText("Todas leídas", { exact: true })).toBeVisible();
    await page.reload();
    await expect(bell).toHaveAccessibleName("Notificaciones");
    const persisted = await db.notification.findMany({ where: { userId: user.id } });
    expect(persisted.filter(n => n.read).map(n => n.id).sort()).toEqual([general.id, critical.id, next.id].sort());
    expect(persisted.find(n => n.id === critical.id)?.ackAt).not.toBeNull();
    expect(persisted.find(n => n.id === hidden.id)?.read).toBe(false);
  } finally {
    if (hiddenCausaId) await db.causa.delete({ where: { id: hiddenCausaId } });
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
});
