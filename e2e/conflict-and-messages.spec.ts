import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("staff puede re-ejecutar el chequeo de conflictos de una causa", async ({
  page,
}) => {
  await loginAs(page, "socio@estudio.cl");
  await expect(page).toHaveURL(/\/(inicio|dashboard)$/);

  const causasRes = await page.request.get("/api/causas");
  expect(causasRes.ok()).toBeTruthy();
  const causas = (await causasRes.json()) as Array<{ id: string; rit?: string | null }>;
  const causa = causas.find((c) => c.rit === "C-4521-2025") || causas[0];
  expect(causa?.id).toBeTruthy();

  const recheck = await page.request.post(`/api/causas/${causa!.id}/conflict-check`);
  expect(recheck.ok()).toBeTruthy();
  const body = (await recheck.json()) as {
    conflicts?: unknown[];
    conflictStatus?: string;
  };
  expect(Array.isArray(body.conflicts)).toBe(true);
  expect(typeof body.conflictStatus).toBe("string");
});

test("el staff puede enviar un mensaje interno", async ({ page }) => {
  await loginAs(page, "socio@estudio.cl");
  await expect(page).toHaveURL(/\/(inicio|dashboard)$/);

  const peopleRes = await page.request.get("/api/people");
  expect(peopleRes.ok()).toBeTruthy();
  const people = (await peopleRes.json()) as {
    users: Array<{ id: string; email?: string }>;
  };
  const asistente = people.users.find((p) => p.email === "asistente@estudio.cl");
  expect(asistente?.id).toBeTruthy();

  const staffSend = await page.request.post("/api/messages", {
    data: { receiverId: asistente!.id, body: "handoff e2e 0.1.6" },
  });
  expect(staffSend.status()).toBe(201);
});

test("el portal cliente no puede mensajear fuera de ACL", async ({ page }) => {
  await loginAs(page, "cliente@andes.cl");
  await expect(page).toHaveURL(/\/portal$/);

  const peopleAsClient = await page.request.get("/api/people");
  expect(peopleAsClient.status()).toBe(403);

  const clientSend = await page.request.post("/api/messages", {
    data: { receiverId: "not-a-peer", body: "fuera de ACL" },
  });
  expect(clientSend.status()).toBe(403);
});

test("la bandeja conserva el borrador al cerrarlo sin enviar automáticamente", async ({ page }) => {
  await loginAs(page, "socio@estudio.cl");
  const peopleResponse = await page.request.get("/api/people");
  expect(peopleResponse.ok()).toBeTruthy();
  const people = await peopleResponse.json() as { users: Array<{ id: string; email?: string }> };
  const receiver = people.users.find(person => person.email === "asistente@estudio.cl");
  expect(receiver?.id).toBeTruthy();
  let messagesSent = 0;
  page.on("request", request => {
    if (request.method() === "POST" && new URL(request.url()).pathname === "/api/messages") messagesSent++;
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/mensajes");
  const composer = page.locator("#message-composer");
  await expect(composer).toBeHidden();
  await page.getByRole("button", { name: "Nuevo mensaje", exact: true }).click();
  await composer.getByRole("combobox", { name: "Destinatario", exact: true }).selectOption(receiver!.id);
  await composer.getByRole("textbox", { name: "Asunto", exact: true }).fill("Borrador ficticio para continuar");
  await composer.getByRole("textbox", { name: "Mensaje", exact: true }).fill("Texto de prueba que todavía no se debe enviar.");
  await page.getByRole("button", { name: "Cerrar borrador", exact: true }).click();
  await expect(composer).toBeHidden();
  expect(messagesSent).toBe(0);
  await page.getByRole("button", { name: "Continuar borrador", exact: true }).click();
  await expect(composer.getByRole("combobox", { name: "Destinatario", exact: true })).toHaveValue(receiver!.id);
  await expect(composer.getByRole("textbox", { name: "Asunto", exact: true })).toHaveValue("Borrador ficticio para continuar");
  await expect(composer.getByRole("textbox", { name: "Mensaje", exact: true })).toHaveValue("Texto de prueba que todavía no se debe enviar.");
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(messagesSent).toBe(0);
});
