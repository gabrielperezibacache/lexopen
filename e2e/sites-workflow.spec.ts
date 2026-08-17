import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("espacios: hub, creación vinculada y enlace desde causa", async ({ page }) => {
  await loginAs(page, "socio@estudio.cl");
  await page.goto("/sites");

  await expect(page.getByRole("heading", { name: "Espacios" })).toBeVisible();
  await expect(page.getByText("¿Cómo encaja con el resto de LexOpen?")).toBeVisible();

  const causasRes = await page.request.get("/api/causas");
  expect(causasRes.ok()).toBeTruthy();
  const causas = (await causasRes.json()) as Array<{
    id: string;
    titulo: string;
    rit: string | null;
    clienteId: string | null;
    site: { id: string } | null;
  }>;
  const causaSinSite = causas.find((c) => !c.site);
  expect(causaSinSite).toBeTruthy();

  const siteName = `E2E Espacio ${Date.now()}`;
  const createRes = await page.request.post("/api/sites", {
    data: {
      name: siteName,
      description: "Prueba e2e espacios",
      tipo: "matter",
      clienteId: causaSinSite!.clienteId,
      causaId: causaSinSite!.id,
    },
  });
  expect(createRes.status()).toBe(201);
  const created = (await createRes.json()) as { id: string };
  expect(created.id).toBeTruthy();

  await page.goto(`/causas/${causaSinSite!.id}`);
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
  const res = await page.request.get("/api/sites?tipo=knowledge");
  expect(res.ok()).toBeTruthy();
  const sites = (await res.json()) as Array<{ tipo: string }>;
  expect(sites.length).toBeGreaterThan(0);
  for (const s of sites) {
    expect(s.tipo).toBe("knowledge");
  }
});
