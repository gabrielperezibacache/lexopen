import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("correo PJUD muestra conector y no inventa mensajes demo", async ({
  page,
}) => {
  await loginAs(page, "socio@estudio.cl");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/correo");

  await expect(page.getByRole("heading", { name: "Correo PJUD" })).toBeVisible();
  await expect(page.getByTestId("mailbox-connect")).toBeVisible();
  await expect(page.getByTestId("mailbox-connect-gmail")).toBeVisible();
  await expect(page.getByTestId("mailbox-connect-microsoft")).toBeVisible();
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
});
