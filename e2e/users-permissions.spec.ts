import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs } from "./helpers";

const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
const tag = randomUUID();
const ownerEmail = `host-owner-${tag}@example.test`, delegateEmail = `host-delegate-${tag}@example.test`, revokedEmail = `host-revoked-${tag}@example.test`;
const ids: string[] = [];
test.beforeAll(async () => {
  const seed = await db.user.findUniqueOrThrow({ where: { email: "abogado@estudio.cl" }, select: { password: true } });
  for (const data of [
    { email: ownerEmail, role: "admin", capabilityGrants: "doc.privileged.read", capabilityRevokes: "voice.use" },
    { email: delegateEmail, role: "abogado", capabilityGrants: "host.admin", capabilityRevokes: "" },
    { email: revokedEmail, role: "admin", capabilityGrants: "", capabilityRevokes: "host.admin" },
  ]) ids.push((await db.user.create({ data: { ...data, name: data.email, password: seed.password } })).id);
});
test.afterAll(async () => {
  try {
    await db.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  } finally { await db.$disconnect(); }
});

test("editar el perfil conserva excepciones y muestra permisos heredados", async ({ page }) => {
  test.setTimeout(90_000);
  await loginAs(page, ownerEmail);
  await page.goto("/configuracion#usuarios");
  await page.getByTestId("studio-user").filter({ hasText: ownerEmail }).getByRole("button", { name: "Editar", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Editar usuario", exact: true });
  await dialog.getByText("Permisos del rol y excepciones personales", { exact: true }).click();
  await expect(dialog.getByRole("combobox", { name: "Ver documentos con privilegio", exact: true })).toHaveValue("grant");
  await expect(dialog.getByRole("combobox", { name: "Usar voz", exact: true })).toHaveValue("revoke");
  await expect(dialog.getByRole("combobox", { name: "Administrar el Host (usuarios, integraciones)", exact: true })).toHaveValue("inherit");
  await dialog.getByLabel("Cargo (opcional)", { exact: true }).fill("Perfil revisado sin cambiar permisos");
  const saved = page.waitForResponse(response => new URL(response.url()).pathname === "/api/people" && response.request().method() === "PATCH", { timeout: 20_000 });
  await dialog.getByRole("button", { name: "Guardar", exact: true }).click();
  const response = await saved;
  expect(response.ok(), await response.text()).toBeTruthy();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Usuario actualizado" })).toBeVisible();
  const stored = await db.user.findUniqueOrThrow({ where: { id: ids[0] } });
  expect(stored.capabilityGrants).toBe("doc.privileged.read");
  expect(stored.capabilityRevokes).toBe("voice.use");
  expect(stored.sessionVersion).toBe(0);
});

test("administración delegada respeta excepciones y el usuario revocado no gestiona cuentas", async ({ page }) => {
  await loginAs(page, delegateEmail);
  await page.goto("/personas");
  await expect(page.getByRole("button", { name: "Crear usuario", exact: true })).toBeVisible();
  const selfEscalation = await page.request.patch("/api/people", { data: { action: "update-user", userId: ids[1], capabilityGrants: "host.admin,escrito.approve" } });
  expect(selfEscalation.status()).toBe(403);
  expect((await db.user.findUniqueOrThrow({ where: { id: ids[1] } })).capabilityGrants).toBe("host.admin");
  const delegatedUpdate = await page.request.patch("/api/people", { data: { action: "update-user", userId: ids[2], title: "Administrado por delegado" } });
  expect(delegatedUpdate.ok()).toBeTruthy();
  await page.context().clearCookies();
  await loginAs(page, revokedEmail);
  await page.goto("/personas");
  await expect(page.getByRole("button", { name: "Crear usuario", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Nuevo grupo", exact: true })).toHaveCount(0);
  expect((await page.request.post("/api/people", { data: { action: "create-group", name: "Forbidden" } })).status()).toBe(403);
  const response = await page.request.get("/api/people");
  expect(response.headers()["cache-control"]).toContain("no-store");
  const result = await response.json() as { users: Array<{ capabilityGrants?: string; capabilityRevokes?: string }> };
  expect(result.users.some(user => Object.hasOwn(user, "capabilityGrants") || Object.hasOwn(user, "capabilityRevokes"))).toBe(false);
});
