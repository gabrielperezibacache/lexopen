/** Native forms/API/database; a fictitious professional and templates only. */
import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { CSRF_COOKIE, CSRF_HEADER } from "../src/lib/auth/csrf-constants";
import { loginAs } from "./helpers";
const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
if (url !== new URL(process.env.DATABASE_URL!).toString()) throw new Error("Use an explicitly disposable fixture");
const db = new PrismaClient({ datasources: { db: { url } } }), tag = randomUUID(), email = `${tag}@minute-templates.invalid`, name = `Audiencia ficticia ${tag}`;
let ownerId = "";
test.beforeAll(async () => { ownerId = (await db.user.create({ data: { email, name: "Profesional ficticio de minutas", role: "abogado", password: await hash("lexopen", 10) } })).id; });
test.afterAll(async () => {
  try {
    await db.minutaPlantilla.deleteMany({ where: { nombre: { in: [name, `${name}-invalid`] } } });
    if (ownerId) { await db.auditEvent.deleteMany({ where: { actorId: ownerId } }); await db.user.deleteMany({ where: { id: ownerId } }); }
  } finally { await db.$disconnect(); }
});
test("la plantilla se crea con campos normales y rechaza un formato avanzado inválido", async ({ page }, info) => {
  await loginAs(page, email); await page.goto("/minutas");
  await page.getByText("Administrar plantillas", { exact: true }).click();
  const form = page.getByRole("region", { name: "Plantillas de minutas" });
  await form.getByRole("combobox", { name: "Tipo", exact: true }).selectOption("audiencia");
  await form.getByRole("textbox", { name: "Nombre", exact: true }).fill(name);
  await form.getByText("Añadir textos sugeridos a la plantilla", { exact: true }).click();
  await form.getByLabel("Título sugerido", { exact: true }).fill("Audiencia preparatoria ficticia");
  await form.getByLabel("Acuerdos", { exact: true }).fill("Revisar los antecedentes del ejemplo");
  await form.getByLabel("Próximos pasos · uno por línea", { exact: true }).fill("Consultar los documentos\nPreparar las preguntas");
  await form.getByRole("button", { name: "Crear", exact: true }).click();
  await expect(form.getByText(name, { exact: true })).toBeVisible();
  const saved = await db.minutaPlantilla.findFirstOrThrow({ where: { nombre: name } });
  expect(JSON.parse(saved.bodyJson)).toMatchObject({ titulo: "Audiencia preparatoria ficticia", acuerdos: "Revisar los antecedentes del ejemplo", proximosPasos: ["Consultar los documentos", "Preparar las preguntas"] });
  const origin = new URL(info.project.use.baseURL as string).origin, csrf = (await page.context().cookies()).find(cookie => cookie.name === CSRF_COOKIE)?.value;
  expect(csrf).toBeTruthy();
  const invalid = await page.request.post("/api/minutas/plantillas", { headers: { Origin: origin, [CSRF_HEADER]: csrf! }, data: { tipo: "audiencia", nombre: `${name}-invalid`, bodyJson: "{" } });
  expect(invalid.status()).toBe(400); expect(await db.minutaPlantilla.count({ where: { nombre: `${name}-invalid` } })).toBe(0);
});
