import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers";
test("búsqueda PJUD: páginas remotas, invalidación y preparación explícita", async ({ page }) => {
  test.setTimeout(180_000);
  const queries: unknown[] = [];
  await page.route("**/api/research/pjud", async route => {
    const input = route.request().postDataJSON(); queries.push(input);
    await route.fulfill({ json: { page: input.page, totalReported: 20, nextPage: input.page === 0 ? 1 : null,
      warnings: ["Resultados remotos: no son citas."], items: [{ id: String(123 + input.page), rol: "C-3630-2023", title: `Fallo página ${input.page + 1}`, tribunal: "Civil fixture", importUrl: `https://juris.pjud.cl/busqueda?Civiles#sentencia-${123 + input.page}` }] } });
  });
  await loginAs(page, "abogado@estudio.cl");
  await page.goto("/jurisprudencia");
  await page.getByRole("button", { name: "Fuentes", exact: true }).click();
  await page.getByRole("textbox", { name: "ROL (número o número y año)", exact: true }).fill("C-3630-2023");
  await page.getByRole("button", { name: "Buscar en PJUD", exact: true }).click();
  await expect(page.getByText("Fallo página 1", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  await expect(page.getByText("Fallo página 2", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Preparar incorporación del fallo 124", exact: true }).click();
  await expect(page.getByLabel("URL de la publicación oficial", { exact: true })).toHaveValue("https://juris.pjud.cl/busqueda?Civiles#sentencia-124");
  expect(queries).toEqual([{ terms: "", rol: "C-3630-2023", page: 0 }, { terms: "", rol: "C-3630-2023", page: 1 }]);
  await page.getByRole("textbox", { name: "Términos públicos", exact: true }).fill("contrato");
  await expect(page.getByText("Fallo página 2", { exact: false })).toHaveCount(0);
});
