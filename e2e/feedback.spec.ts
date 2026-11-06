import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("el equipo informa problemas y sólo la administración puede seguir comentarios ajenos", async ({ page, browser, baseURL }, testInfo) => {
  const title = `Sugerencia ficticia ${randomUUID().slice(0, 8)}`;
  await page.setViewportSize({ width: 360, height: 800 });
  await loginAs(page, "abogado@estudio.cl");
  await page.goto("/cuenta");
  await page.getByRole("link", { name: "Feedback", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Feedback" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  const launcher = page.getByRole("button", { name: "Conversar con ALTAZOR" });
  const send = page.getByRole("button", { name: "Enviar comentario" });
  await expect(launcher).toBeVisible();
  const overlay = (await launcher.boundingBox())!;
  for (const control of [send, page.locator("#feedback-privacy")]) {
    const bounds = (await control.boundingBox())!;
    expect(bounds.x + bounds.width <= overlay.x || bounds.y + bounds.height <= overlay.y).toBeTruthy();
  }
  await page.screenshot({ path: testInfo.outputPath("feedback-movil.png"), fullPage: true });

  await page.getByLabel("Tipo de comentario").selectOption("error");
  await page.getByLabel("Título", { exact: true }).fill(title);
  await page.getByLabel("Descripción", { exact: true }).fill("Reproducción ficticia para probar el seguimiento.");
  await send.click();
  await expect(page.getByRole("status").filter({ hasText: "Comentario recibido" })).toBeVisible();
  const own = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(own).toContainText("Recibido");
  await expect(own.getByRole("button", { name: "Marcar resuelto" })).toHaveCount(0);

  const staff = await browser.newContext({ baseURL, locale: "es-CL" });
  const administrator = await browser.newContext({ baseURL, locale: "es-CL", viewport: { width: 1440, height: 1000 } });
  try {
    const other = await staff.newPage();
    await loginAs(other, "asistente@estudio.cl");
    await other.goto("/cuenta/feedback");
    await expect(other.getByRole("heading", { name: "Mis comentarios" })).toBeVisible();
    await expect(other.getByRole("heading", { name: title, exact: true })).toHaveCount(0);

    const admin = await administrator.newPage();
    await loginAs(admin, "socio@estudio.cl");
    await admin.goto("/cuenta/feedback");
    await expect(admin.getByRole("heading", { name: "Comentarios del equipo" })).toBeVisible();
    const item = admin.getByRole("listitem").filter({ has: admin.getByRole("heading", { name: title, exact: true }) });
    await item.getByRole("button", { name: "Marcar en revisión" }).click();
    await expect(item).toContainText("En revisión");
    await item.getByRole("button", { name: "Marcar resuelto" }).click();
    await expect(item).toContainText("Resuelto");
    await admin.screenshot({ path: testInfo.outputPath("feedback-escritorio.png"), fullPage: true });
  } finally {
    await Promise.all([staff.close(), administrator.close()]);
  }
  await page.reload();
  await expect(own).toContainText("Resuelto");
});
