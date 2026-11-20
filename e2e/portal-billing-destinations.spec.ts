import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { randomUUID } from "node:crypto";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { clp } from "../src/lib/billing";
import { billingMonthRange } from "../src/lib/billing-overview";
import { loginAs } from "./helpers";

const database = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
if (new URL(process.env.DATABASE_URL!).toString() !== database) throw Error("Use the disposable E2E database");
const db = new PrismaClient({ datasources: { db: { url: database } } });
test.slow();
test.afterAll(async () => { await db.$disconnect(); });

test("el portal abre la pregunta exacta y la paginación conserva el ámbito del cliente", async ({ page }) => {
  const tag = randomUUID();
  const user = await db.user.create({ data: { email: `portal-${tag}@example.invalid`, password: await hash("lexopen", 10), name: "Cliente de prueba", role: "cliente" } });
  const sites = [`${tag}-site`, `${tag}-other`];
  try {
    await db.site.createMany({ data: sites.map((id, index) => ({ id, slug: id, name: index ? "Espacio ajeno" : "Espacio compartido de prueba", isClientVisible: true })) });
    await db.siteMember.create({ data: { userId: user.id, siteId: sites[0], role: "client" } });
    const subjects = Array.from({ length: 27 }, (_, i) => `Consulta de prueba ${i + 1}`);
    await db.qaThread.createMany({ data: subjects.map((subject, i) => ({
      siteId: sites[0], subject, id: `${tag}-q${i}`, updatedAt: new Date(Date.UTC(2026, 4, i + 1)),
    })) });
    const closed = await db.qaThread.create({ data: { siteId: sites[0], subject: "Pregunta cerrada de prueba", status: "closed" } });
    const foreign = await db.qaThread.create({ data: { siteId: sites[1], subject: "Consulta ajena de prueba" } });

    await loginAs(page, user.email);
    await page.goto("/portal");
    const portal = page.getByRole("article").filter({ hasText: "Espacio compartido de prueba" });
    const question = portal.getByRole("link", { name: subjects[26], exact: true });
    await expect(question).toHaveAttribute("href", `/sites/${sites[0]}/qa?pregunta=${tag}-q26`);
    await question.click();
    await expect(page.getByRole("heading", { name: subjects[26], exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: subjects[25], exact: true })).toHaveCount(0);
    await page.getByRole("link", { name: "Todas las preguntas" }).click();
    await page.getByRole("link", { name: "Ver siguientes" }).click();
    await expect(page).toHaveURL(url => url.searchParams.has("after") && !url.searchParams.has("pregunta"));
    const secondPage = page.url();
    await page.getByRole("link", { name: subjects[0], exact: true }).click();
    await expect(page.getByRole("heading", { name: subjects[0], exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Todas las preguntas" }).click();
    await expect(page).toHaveURL(secondPage);
    for (const thread of [closed, foreign]) {
      await page.goto(`/sites/${sites[0]}/qa?pregunta=${thread.id}`);
      await expect(page.getByText("404", { exact: true })).toBeVisible();
      await expect(page.getByText(thread.subject)).toHaveCount(0);
    }
  } finally {
    await db.site.deleteMany({ where: { id: { in: sites } } });
    await db.auditEvent.deleteMany({ where: { actorId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  }
});

test("facturación desglosa el saldo y los pagos por fecha de pago en Chile con el mismo permiso", async ({ page }) => {
  const tag = randomUUID(), own = `${tag}-own`, other = `${tag}-other`;
  const user = await db.user.create({ data: { email: `billing-${tag}@example.invalid`, password: await hash("lexopen", 10), name: "Profesional de prueba", role: "abogado" } });
  const client = await db.cliente.create({ data: { razonSocial: "Cliente ficticio de cobros" } });
  const prefix = `FAC-${tag.slice(0, 8)}`;
  const invoiceNumbers = [`${prefix}-abierta`, `${prefix}-pagada`, `${prefix}-privada`];
  const month = billingMonthRange();
  try {
    await db.causa.createMany({ data: [own, other].map(id => ({ id, titulo: id, acceso: "equipo", abogadoId: id === own ? user.id : null, materia: "civil", tribunal: "Tribunal de prueba" })) });
    for (const [index, number] of invoiceNumbers.entries()) {
      const item = await db.invoice.create({ data: {
        number, clienteId: client.id, causaId: index === 2 ? other : own,
        status: index === 1 ? "pagada" : "parcialmente_pagada", issueDate: new Date("2022-01-15"),
        totalClp: 10000, paidClp: index === 1 ? 10000 : 3000,
      } });
      await db.payment.create({ data: { invoiceId: item.id, clienteId: client.id, amountClp: index === 1 ? 10000 : 3000,
        date: new Date(month.start.getTime() + (index === 0 ? -1 : 1)) } });
    }
    await loginAs(page, user.email);
    await page.goto("/facturacion");
    await page.getByRole("link", { name: /Por cobrar/ }).click();
    const receivables = page.getByRole("region", { name: "Por cobrar", exact: true });
    await expect(receivables.getByRole("heading", { level: 2 })).toHaveText(clp(7000));
    await expect(receivables.getByRole("link", { name: invoiceNumbers[0] })).toBeVisible();
    await expect(receivables.getByText(invoiceNumbers[1])).toHaveCount(0);
    await expect(receivables.getByText(invoiceNumbers[2])).toHaveCount(0);
    await page.getByRole("navigation", { name: "Secciones de facturación" }).getByRole("link", { name: "Resumen" }).click();
    await page.getByRole("link", { name: /Cobrado este mes/ }).click();
    const payments = page.getByRole("region", { name: "Pagos recibidos", exact: true });
    await expect(payments.getByRole("heading", { level: 2 })).toHaveText(clp(10000));
    await expect(payments.getByText(invoiceNumbers[0])).toHaveCount(0);
    await expect(payments.getByText(invoiceNumbers[2])).toHaveCount(0);
    await payments.getByRole("link", { name: invoiceNumbers[1] }).click();
    await expect(page.getByRole("heading", { name: invoiceNumbers[1] })).toBeVisible();
    await page.getByRole("link", { name: /Pagos recibidos/ }).click();
    await expect(page.getByLabel("Mes de pago (Chile)", { exact: true })).toHaveValue(month.key);
    const prev = billingMonthRange(new Date(month.start.getTime() - 1));
    await page.getByLabel("Mes de pago (Chile)", { exact: true }).fill(prev.key);
    await page.getByRole("button", { name: "Aplicar" }).click();
    await expect(payments.getByRole("heading", { level: 2 })).toHaveText(clp(3000));
    await expect(payments.getByRole("link", { name: invoiceNumbers[0] })).toBeVisible();
    await expect(payments.getByText(invoiceNumbers[1])).toHaveCount(0);
    await expect(payments.getByText(invoiceNumbers[2])).toHaveCount(0);
  } finally {
    await db.payment.deleteMany({ where: { clienteId: client.id } });
    await db.invoice.deleteMany({ where: { clienteId: client.id } });
    await db.causa.deleteMany({ where: { id: { in: [own, other] } } });
    await db.cliente.delete({ where: { id: client.id } });
    await db.auditEvent.deleteMany({ where: { actorId: user.id } });
    await db.user.delete({ where: { id: user.id } });
  }
});
