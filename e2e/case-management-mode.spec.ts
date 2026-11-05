import { randomInt, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs } from "./helpers";

const db = new PrismaClient();
const createdIds: string[] = [];
let setting: { id: string; caseManagementMode: string } | null = null;

test.beforeAll(async () => {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  expect(url).toBe(new URL(process.env.DATABASE_URL!).toString());
  setting = await db.firmSettings.findFirstOrThrow({ select: { id: true, caseManagementMode: true } });
});
test.afterAll(async () => {
  try {
    if (createdIds.length) {
      await db.activity.deleteMany({ where: { causaId: { in: createdIds } } });
      await db.auditEvent.deleteMany({ where: { entityType: "Causa", entityId: { in: createdIds } } });
      await db.causa.deleteMany({ where: { id: { in: createdIds } } });
    }
  } finally {
    if (setting) await db.firmSettings.update({ where: { id: setting.id }, data: { caseManagementMode: setting.caseManagementMode } });
    await db.$disconnect();
  }
});

// Use an unused, plausible format with an intentionally wrong check digit.
function fictitiousInvalidRut() {
  const body = String(randomInt(20_000_000, 89_999_999));
  const sum = [...body].reverse().reduce((total, digit, index) => total + Number(digit) * (index % 6 + 2), 0);
  const digit = 11 - sum % 11 === 11 ? "1" : "0";
  return {
    formatted: `${body.slice(0, 2)}.${body.slice(2, 5)}.${body.slice(5)}-${digit}`,
    compact: `${body}${digit}`,
  };
}

test("las causas manuales admiten referencias internacionales en ambos modos y PJUD valida sus propios criterios", async ({ page }) => {
  test.setTimeout(120_000);
  const tag = randomUUID().slice(0, 8);
  const numericIdentifier = fictitiousInvalidRut();
  await db.firmSettings.update({ where: { id: setting!.id }, data: { caseManagementMode: "manual" } });
  await loginAs(page, "abogado@estudio.cl");
  const cases = page.getByTestId("desktop-sidebar").getByTestId("primary-navigation").getByRole("link", { name: "Causas", exact: true });
  await cases.click();
  await expect(page).toHaveURL(/\/mis-causas$/);
  await expect(page.getByRole("link", { name: "Herramientas PJUD", exact: true })).toHaveCount(0);

  async function createManualCase(suffix: string, identifiers: [string, string]) {
    await page.goto("/causas/nueva");
    await expect(page.getByRole("textbox", { name: "RIT", exact: true })).toHaveCount(0);
    await expect(page.locator("datalist#tribunales-chile")).toHaveCount(0);
    const reference = `INT/2026-${tag}.${suffix}`;
    const additional = `Expediente UE #${tag}-${suffix}`;
    const tribunal = `Sede arbitral ficticia ${tag}`;
    await page.getByRole("textbox", { name: "Título", exact: true }).fill(`Asunto general ficticio ${tag} ${suffix}`);
    await page.getByRole("textbox", { name: "Referencia", exact: true }).fill(reference);
    await page.getByRole("textbox", { name: "Identificador adicional", exact: true }).fill(additional);
    await page.getByRole("textbox", { name: "Tribunal u órgano", exact: true }).fill(tribunal);
    await page.getByRole("textbox", { name: "Materia", exact: true }).fill("Arbitraje internacional");
    await page.locator('input[name="demandante"]').fill(`Titular sintético ${tag} ${suffix}`);
    await page.locator('input[name="demandanteRut"]').fill(identifiers[0]);
    await page.locator('input[name="demandado"]').fill(`Contraparte sintética ${tag} ${suffix}`);
    await page.locator('input[name="demandadoRut"]').fill(identifiers[1]);
    const pending = page.waitForResponse(response => new URL(response.url()).pathname === "/api/causas" && response.request().method() === "POST");
    await page.getByRole("button", { name: "Crear causa", exact: true }).click();
    const response = await pending;
    expect(response.status(), await response.text()).toBe(201);
    const created = await response.json();
    createdIds.push(created.id);
    expect(created).toMatchObject({ rit: reference, ruc: additional, tribunal, pjudOrigin: "manual", pjudMonitoreoActivo: false });
    expect(created.partes.map((parte: { rut: string }) => parte.rut)).toEqual(expect.arrayContaining(identifiers));
    await page.waitForURL(`/causas/${created.id}`);
    return { id: created.id as string, reference };
  }

  async function editManualCase(id: string, currentReference: string, reference: string, additional: string) {
    await page.goto(`/causas/${id}/editar`);
    const input = page.getByRole("textbox", { name: "Referencia", exact: true });
    await expect(input).toHaveValue(currentReference);
    await expect(page.getByRole("textbox", { name: "Materia", exact: true })).toHaveValue("Arbitraje internacional");
    await input.fill(reference);
    await page.getByRole("textbox", { name: "Identificador adicional", exact: true }).fill(additional);
    const pending = page.waitForResponse(response => new URL(response.url()).pathname === `/api/causas/${id}` && response.request().method() === "PATCH");
    await page.getByRole("button", { name: "Guardar cambios", exact: true }).click();
    const response = await pending;
    expect(response.status(), await response.text()).toBe(200);
    expect(await response.json()).toMatchObject({ rit: reference, ruc: additional });
    await page.waitForURL(`/causas/${id}`);
  }

  async function expectNoNumericAlias() {
    const response = await page.request.post("/api/conflict-check", {
      data: { partes: [{ nombre: `Persona diferente ${randomUUID()}`, rut: numericIdentifier.compact }] },
    });
    expect(response.status()).toBe(200);
    expect((await response.json()).status).not.toBe("blocked");
  }

  const manual = await createManualCase("A", [`AB-${tag}/123456`, numericIdentifier.formatted]);
  await expectNoNumericAlias();
  const revisedReference = `Dossier #${tag}/B`;
  await editManualCase(manual.id, manual.reference, revisedReference, `Referencia complementaria ${tag}`);
  const tooLong = await page.request.patch(`/api/causas/${manual.id}`, { data: { ruc: "X".repeat(81) } });
  expect(tooLong.status()).toBe(400);
  const oversizedCreate = await page.request.post("/api/causas", { data: { titulo: "Referencia demasiado extensa", rit: "X".repeat(81), tribunal: "Órgano ficticio", materia: "General" } });
  expect(oversizedCreate.status()).toBe(400);
  const controlCharacter = await page.request.patch(`/api/causas/${manual.id}`, { data: { rit: "Referencia\u0000inválida" } });
  expect(controlCharacter.status()).toBe(400);

  await db.firmSettings.update({ where: { id: setting!.id }, data: { caseManagementMode: "pjud_cl" } });
  await page.reload();
  await cases.click();
  await expect(page).toHaveURL(/\/mis-causas$/);
  await expect(page.getByRole("link", { name: "Herramientas PJUD", exact: true })).toHaveAttribute("href", "/pjud");
  await expectNoNumericAlias();
  const finalReference = `Dossier #${tag}/C`;
  await editManualCase(manual.id, revisedReference, finalReference, `Nuevo identificador europeo ${tag}`);
  const newManual = await createManualCase("D", [`CD-${tag}/456789`, `Registro.UE/${tag}`]);
  await editManualCase(newManual.id, newManual.reference, `Expediente AR/${tag}`, `Referencia CR/${tag}`);
  expect((await db.causa.findUniqueOrThrow({ where: { id: manual.id } })).rit).toBe(finalReference);

  const tribunal = "1º Juzgado Civil de Santiago";
  for (const action of ["preview-rol", "add-rol"]) {
    const invalidReference = await page.request.post("/api/pjud/lookup", { data: { action, rit: finalReference, tribunal } });
    expect(invalidReference.status()).toBe(400);
    expect((await invalidReference.json()).error).toMatch(/RIT\/ROL/);
    const invalidRuc = await page.request.post("/api/pjud/lookup", { data: { action, rit: "C-123-2026", ruc: `Referencia ${tag}`, tribunal } });
    expect(invalidRuc.status()).toBe(400);
    expect((await invalidRuc.json()).error).toMatch(/RUC/);
  }
  const invalidRut = await page.request.post("/api/pjud/lookup", { data: { action: "buscar-rut", rut: numericIdentifier.formatted } });
  expect(invalidRut.status()).toBe(400);
  expect((await invalidRut.json()).error).toMatch(/RUT/);

  await db.causa.update({ where: { id: manual.id }, data: { acceso: "equipo" } });
  await loginAs(page, "asistente@estudio.cl");
  const forbidden = await page.request.patch(`/api/causas/${manual.id}`, { data: { titulo: "No debe reemplazar el título", rit: "X".repeat(81) } });
  expect(forbidden.status()).toBe(404);
  expect(JSON.stringify(await forbidden.json())).not.toContain(finalReference);
});
