import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs } from "./helpers";

test("correo PJUD separa la configuración personal de la bandeja", async ({
  page,
}) => {
  test.slow(); // A cold development server compiles the settings route and both callbacks.
  await loginAs(page, "socio@estudio.cl");
  await expect(page).toHaveURL(/\/(inicio|dashboard)$/);
  await page.goto("/correo");

  await expect(page.getByRole("heading", { name: "Correo PJUD" })).toBeVisible();
  await expect(page.getByTestId("mailbox-connect")).toHaveCount(0);
  await expect(page.getByText("Sincronizar (demo)")).toHaveCount(0);
  await expect(page.getByTestId("mailbox-empty")).toBeVisible();
  await expect(page.getByTestId("mailbox-empty")).toContainText("pjud.cl");

  const inbox = await page.request.get("/api/mail");
  expect(inbox.ok()).toBeTruthy();
  const payload = (await inbox.json()) as {
    messages: Array<{ subject?: string; externalId?: string }>;
    account: Record<string, unknown>;
  };
  expect(Array.isArray(payload.messages)).toBeTruthy();
  expect(payload.messages.length).toBe(0);
  const serialized = JSON.stringify(payload.account);
  expect(serialized).not.toContain("passwordEnc");
  expect(serialized).not.toContain("oauthRefreshEnc");
  expect(serialized).not.toContain("oauthAccessEnc");

  await page.goto("/configuracion");
  await page.locator("main").getByRole("link", { name: "Configurar correo" }).click();
  await expect(page).toHaveURL(/\/configuracion\/correo$/, { timeout: 15_000 });
  await expect(page.getByTestId("mailbox-connect")).toBeVisible();
  await expect(page.getByTestId("mailbox-connect-gmail")).toBeVisible();
  await expect(page.getByTestId("mailbox-connect-microsoft")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("correo-configuracion-escritorio.png") });
  await page.getByText("Configurar por IMAP", { exact: true }).click();
  await page.getByTestId("mailbox-imap-host").fill("127.0.0.1");
  await page.getByTestId("mailbox-imap-email").fill("abogado@estudio.cl");
  await page.getByTestId("mailbox-imap-password").fill("invalid-password");
  await page.getByTestId("mailbox-imap-save").click();
  await expect(page.getByTestId("mailbox-error")).toBeVisible();
  await expect(page.getByTestId("mailbox-error")).toContainText(/IMAP|privada|Host/i);

  const start = await page.request.post("/api/mail/google/start");
  expect([200, 503]).toContain(start.status());
  const startBody = (await start.json()) as { authUrl?: string; error?: string };
  if (start.status() === 200) {
    expect(startBody.authUrl).toContain("accounts.google.com");
    expect(startBody.authUrl).toContain("gmail.readonly");
  } else {
    expect(startBody.error).toBeTruthy();
  }

  const callback = await page.request.get("/api/mail/google/callback?error=access_denied", { maxRedirects: 0 });
  expect(callback.status()).toBe(307);
  expect(new URL(callback.headers().location).pathname).toBe("/configuracion/correo");
  await page.goto("/correo?microsoft=invalid_state");
  await expect(page).toHaveURL(/\/configuracion\/correo\?microsoft=invalid_state$/);
  await expect(page.getByTestId("mailbox-error")).toContainText("No se pudo conectar el buzón");
  await page.locator("main").getByRole("link", { name: "Abrir bandeja" }).click();
  await expect(page).toHaveURL(/\/correo$/);
});

test("el equipo encuentra su correo en Configuración y el portal no puede acceder", async ({ page, browser }) => {
  await loginAs(page, "abogado@estudio.cl");
  await page.goto("/cuenta");
  await expect(page.locator("main").getByRole("link", { name: "Configurar correo" })).toHaveCount(0);
  await page.locator("main").getByRole("link", { name: "Configuración", exact: true }).click();
  await page.locator("main").getByRole("link", { name: "Configurar correo" }).click();
  await expect(page.getByRole("heading", { name: "Configuración de correo" })).toBeVisible();
  await page.setViewportSize({ width: 360, height: 800 });
  await page.getByText("Configurar por IMAP", { exact: true }).click();
  await expect(page.getByTestId("mailbox-imap-save")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await page.screenshot({ path: test.info().outputPath("correo-configuracion-movil.png"), fullPage: true });

  const client = await browser.newPage({ locale: "es-CL" });
  try {
    await loginAs(client, "cliente@andes.cl");
    await client.goto("/configuracion/correo");
    await expect(client).toHaveURL(/\/portal(?:\?|$)/);
    await expect(client.getByTestId("mailbox-connect")).toHaveCount(0);
  } finally {
    await client.close();
  }
});

test("un aviso de Altazor abre un correo que ya no aparece en el listado", async ({ page }) => {
  await loginAs(page, "abogado@estudio.cl");
  await page.route("**/api/mail", route => route.fulfill({ json: { messages: [], causas: [], account: null } }));
  await page.route("**/api/mail/messages/correo-antiguo-ficticio", route => route.fulfill({ json: { message: {
    id: "correo-antiguo-ficticio", subject: "Resolución de demostración", kind: "resolucion", status: "aplicado",
    receivedAt: "2026-01-12T15:00:00.000Z", bodyText: "Correo ficticio recuperado fuera del listado.",
  } } }));
  await page.route("**/api/mail/messages/correo-no-disponible", route => route.fulfill({ status: 404, json: { error: "No encontrado" } }));

  await page.goto("/correo?id=correo-antiguo-ficticio");
  await expect(page.getByRole("heading", { name: "Resolución de demostración" })).toBeVisible();
  await expect(page.getByText("Correo ficticio recuperado fuera del listado.")).toBeVisible();

  await page.evaluate(() => window.history.pushState(null, "", "/correo?id=correo-no-disponible"));
  await expect(page.getByText("No se pudo abrir este correo.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Resolución de demostración" })).toHaveCount(0);
});

test("el retorno de correo confirma el proveedor y el estado persistido", async ({ page }) => {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  expect(new URL(process.env.DATABASE_URL!).toString()).toBe(url);
  const db = new PrismaClient({ datasources: { db: { url } } });
  const user = await db.user.create({ data: {
    email: `mail-status-${randomUUID()}@example.invalid`,
    name: "Profesional ficticio",
    role: "abogado",
    password: await bcrypt.hash("lexopen", 10),
  } });
  try {
    await loginAs(page, user.email);
    const success = page.getByText("Buzón conectado", { exact: true });
    const error = page.getByTestId("mailbox-error");
    await page.goto("/configuracion/correo?gmail=connected");
    await expect(error).toContainText("No se pudo conectar el buzón");
    await expect(success).toHaveCount(0);

    const account = await db.mailboxAccount.create({ data: {
      userId: user.id, protocol: "microsoft", status: "connected", email: user.email,
      oauthRefreshEnc: "synthetic-placeholder-not-a-credential",
    } });
    await page.reload();
    await expect(error).toContainText("No se pudo conectar el buzón");
    await expect(success).toHaveCount(0);

    await page.goto("/configuracion/correo?microsoft=connected");
    await expect(success).toBeVisible();
    await expect(error).toHaveCount(0);

    await db.mailboxAccount.update({ where: { id: account.id }, data: { status: "error", lastError: "La autorización de prueba dejó de ser válida." } });
    await page.reload();
    await expect(error).toContainText("No se pudo conectar el buzón");
    await expect(success).toHaveCount(0);
  } finally {
    await db.user.delete({ where: { id: user.id } });
    await db.$disconnect();
  }
});
