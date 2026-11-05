import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("los accesos anteriores preparan ALTAZOR sin enviar y conservan el archivo privado", async ({ page }) => {
  await loginAs(page, "abogado@estudio.cl");
  const response = await page.request.get("/api/causas");
  expect(response.ok()).toBeTruthy();
  const causes = await response.json() as Array<{ id: string; rit: string | null }>;
  const cause = causes.find(item => item.rit === "C-4521-2025") || causes[0];
  expect(cause?.id).toBeTruthy();
  await page.goto(`/agente?causaId=${encodeURIComponent(cause.id)}&utility=doc_qa&run=1`);
  await expect(page).toHaveURL(/\/inicio\?/);
  await expect(page.getByTestId("inicio-composer")).not.toHaveValue("");
  await expect(page.locator(".altazor-user-message")).toHaveCount(0);
  await expect(page.locator("summary").filter({ hasText: "Elegir fuentes para este mensaje" })).toBeVisible();
  const chatsResponse = await page.request.get("/api/integrations/hermes?chats=1");
  expect(chatsResponse.ok()).toBeTruthy();
  const chats = await chatsResponse.json() as Array<{ id: string; causaId: string | null }>;
  const seeded = chats.find(chat => chat.causaId === cause.id);
  expect(seeded).toBeTruthy();
  await page.goto(`/agente?chatId=${encodeURIComponent(seeded!.id)}`);
  await expect(page).toHaveURL(/\/agente\/archivo\?/);
  await expect(page.getByRole("heading", { name: "Conversaciones anteriores" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Conversación", exact: true })).toHaveValue(seeded!.id);
  await expect(page.locator(".altazor-turns")).toContainText(/montos|monto|reclamado/i);
  await expect(page.locator("textarea")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Volver a ALTAZOR" })).toBeVisible();
});
