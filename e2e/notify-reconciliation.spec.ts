import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { loginAs } from "./helpers";

for (const viewport of [{ width: 1366, height: 900 }, { width: 360, height: 800 }]) {
  test(`reconcile uncertain deliveries at ${viewport.width}px`, async ({ page }, testInfo) => {
    const url = process.env.E2E_DATABASE_URL;
    if (!url || !new URL(url).pathname.endsWith("_e2e")) throw new Error("Use una base ficticia E2E");
    const db = new PrismaClient({ datasources: { db: { url } } });
    const tag = `notify_ui_${randomUUID()}`, noticeId = `${tag}_notice`, deliveryId = `${tag}_delivery`;
    let actorId: string | undefined;
    try {
      const actor = await db.user.findUniqueOrThrow({ where: { email: "socio@estudio.cl" } });
      actorId = actor.id;
      await db.notification.create({ data: { id: noticeId, userId: actor.id, title: "Fixture conciliación", body: "Fixture sin datos reales", tipo: "general" } });
      await db.mensajeSaliente.create({ data: { id: deliveryId, notificationId: noticeId, userId: actor.id, canal: "email",
        plantilla: "general", payloadJson: "{}", nivelDetalle: "minimo", dedupeKey: tag, estado: "incierto", envioIniciadoAt: new Date() } });
      await page.setViewportSize(viewport);
      await loginAs(page, "socio@estudio.cl");
      await page.goto("/configuracion#notify-settings");
      const region = page.getByRole("region", { name: "Envíos por revisar" });
      const row = region.getByTestId(`delivery-${deliveryId}`);
      await expect(row).toBeVisible();
      expect(await region.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await row.getByRole("button", { name: "Autorizar reenvío" }).click();
      const dialog = page.getByRole("dialog", { name: "Autorizar reenvío", exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Confirmar y reenviar" })).toBeDisabled();
      await dialog.getByLabel("Motivo de la decisión").fill("Fixture: revisé el buzón y no llegó el aviso.");
      await expect(dialog.getByRole("button", { name: "Confirmar y reenviar" })).toBeDisabled();
      await dialog.getByRole("checkbox").check();
      await expect(dialog.getByRole("button", { name: "Confirmar y reenviar" })).toBeEnabled();
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => Boolean(document.activeElement?.closest("dialog")))).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`notify-review-${viewport.width}.png`), fullPage: false });
      await dialog.getByRole("button", { name: "Confirmar y reenviar" }).click();
      await expect(dialog).not.toBeVisible();
      await expect.poll(async () => (await db.mensajeSaliente.findUniqueOrThrow({ where: { id: deliveryId } })).estado).toBe("encolado");
      await expect(row).not.toBeVisible();
      expect(await db.auditEvent.count({ where: { entityId: deliveryId, action: "notify.reenviar", actorId: actor.id } })).toBe(1);
      // Separate fixture transition exercises positive confirmation without sending externally.
      await db.mensajeSaliente.update({ where: { id: deliveryId }, data: { estado: "incierto" } });
      await region.getByRole("button", { name: "Actualizar lista" }).click();
      await row.getByRole("button", { name: "Llegó al destinatario" }).click();
      const confirm = page.getByRole("dialog", { name: "Confirmar entrega", exact: true });
      await confirm.getByLabel("Motivo de la decisión").fill("Fixture: destinatario confirmó la recepción.");
      await confirm.getByRole("button", { name: "Registrar entrega" }).click();
      await expect.poll(async () => (await db.mensajeSaliente.findUniqueOrThrow({ where: { id: deliveryId } })).estado).toBe("enviado");
    } finally {
      await db.eventoEntrega.deleteMany({ where: { mensajeId: deliveryId } });
      await db.mensajeSaliente.deleteMany({ where: { id: deliveryId } });
      await db.notification.deleteMany({ where: { id: noticeId } });
      await db.auditEvent.deleteMany({ where: { entityId: deliveryId, ...(actorId ? { actorId } : {}) } });
      await db.$disconnect();
    }
  });
}
