import { expect, test } from "@playwright/test";

async function login(
  page: import("@playwright/test").Page,
  email: string
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Contraseña").fill("lexopen");
  await page.getByRole("button", { name: "Entrar" }).click();
}

test("copiloto muestra alcance documental y restaura chat con fuentes", async ({
  page,
}) => {
  await login(page, "abogado@estudio.cl");
  await expect(page).toHaveURL(/\/dashboard$/);

  const causasRes = await page.request.get("/api/causas");
  expect(causasRes.ok()).toBeTruthy();
  const causas = (await causasRes.json()) as Array<{
    id: string;
    rit: string | null;
  }>;
  const causa = causas.find((c) => c.rit === "C-4521-2025") || causas[0];
  expect(causa?.id).toBeTruthy();

  await page.goto(`/agente?causaId=${causa!.id}&utility=doc_qa`);
  await expect(
    page.getByRole("heading", { name: "Asistente LexOpen" })
  ).toBeVisible();
  await expect(page.getByText("Alcance documental")).toBeVisible();
  await expect(page.getByLabel("Carpeta investigativa")).toBeVisible();

  const chatsRes = await page.request.get("/api/integrations/hermes?chats=1");
  expect(chatsRes.ok()).toBeTruthy();
  const chats = (await chatsRes.json()) as Array<{
    id: string;
    causaId: string | null;
    title: string;
  }>;
  const seeded = chats.find((c) => c.causaId === causa!.id);
  expect(seeded).toBeTruthy();

  await page
    .getByRole("button", { name: /Montos reclamados en Escritos/i })
    .click();
  await expect(page.getByText("Fuentes del estudio")).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText(/documento:/i).first()).toBeVisible();
  await expect(page.getByLabel("Carpeta investigativa")).toHaveValue("Escritos");
});
