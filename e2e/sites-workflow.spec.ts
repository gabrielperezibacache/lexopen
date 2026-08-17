import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("espacios: hub, creación vinculada y enlace desde causa", async ({ page }) => {
  await loginAs(page, "socio@estudio.cl");
  await page.goto("/sites");

  await expect(page.getByRole("heading", { name: "Espacios" })).toBeVisible();
  await expect(page.getByText("¿Cómo encaja con el resto de LexOpen?")).toBeVisible();

  const clientesRes = await page.request.get("/api/clientes");
  expect(clientesRes.ok()).toBeTruthy();
  const clientes = (await clientesRes.json()) as Array<{ id: string }>;
  expect(clientes.length).toBeGreaterThan(0);

  const causaRes = await page.request.post("/api/causas", {
    data: {
      titulo: `E2E Causa Espacios ${Date.now()}`,
      tribunal: "1° Juzgado Civil de Santiago",
      materia: "civil",
      clienteId: clientes[0]!.id,
    },
  });
  expect(causaRes.ok()).toBeTruthy();
  const causa = (await causaRes.json()) as { id: string; titulo: string };

  const siteName = `E2E Espacio ${Date.now()}`;
  const createRes = await page.request.post("/api/sites", {
    data: {
      name: siteName,
      description: "Prueba e2e espacios",
      tipo: "matter",
      clienteId: clientes[0]!.id,
      causaId: causa.id,
    },
  });
  expect(createRes.status()).toBe(201);
  const created = (await createRes.json()) as { id: string };
  expect(created.id).toBeTruthy();

  await page.goto(`/causas/${causa.id}`);
  await expect(page.getByRole("link", { name: "Abrir espacio" })).toBeVisible();
  await page.getByRole("link", { name: "Abrir espacio" }).click();
  await expect(page).toHaveURL(new RegExp(`/sites/${created.id}$`));
  await expect(page.getByRole("heading", { name: siteName })).toBeVisible();
  await expect(page.getByText("Cliente y causa vinculados")).toBeVisible();

  const patchRes = await page.request.patch(`/api/sites/${created.id}`, {
    data: { description: "Actualizado por PATCH e2e" },
  });
  expect(patchRes.ok()).toBeTruthy();

  await page.goto("/sites?q=E2E&tipo=matter");
  await expect(page.getByRole("link", { name: siteName })).toBeVisible();
});

test("espacios: filtros del hub respetan tipo", async ({ page }) => {
  await loginAs(page, "abogado@estudio.cl");
  await page.goto("/sites?tipo=knowledge");
  await expect(page.getByRole("heading", { name: "Espacios" })).toBeVisible();
  const knowledgeRow = page.locator("tbody tr").filter({ hasText: "Knowledge" });
  await expect(knowledgeRow.first()).toBeVisible();
});
