import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("staff puede re-ejecutar el chequeo de conflictos de una causa", async ({
  page,
}) => {
  await loginAs(page, "socio@estudio.cl");
  await expect(page).toHaveURL(/\/dashboard$/);

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
  await expect(page).toHaveURL(/\/dashboard$/);

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
