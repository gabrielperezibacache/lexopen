import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomInt } from "node:crypto";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs } from "./helpers";

// Both portal responses are supplied by the browser fixture.
test.use({ serviceWorkers: "block" });
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


test("el lector histórico ofrece recuperar la versión pública sin mostrar el material en custodia", async ({ page }) => {
  const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
  const judgmentId = String(randomInt(1_000_000_000, 9_000_000_000));
  const canonicalUrl = `https://juris.pjud.cl/busqueda?Civiles#sentencia-${judgmentId}`;
  const marker = `Título reservado de prueba ${judgmentId}`;
  let sourceId: string | undefined;
  try {
    const source = await db.legalSource.create({ data: { title: marker, organism: "PJUD", kind: "jurisprudence", canonicalUrl,
      versions: { create: { title: marker, organism: "PJUD", kind: "jurisprudence", text: marker, sourceSha256: "fixture", textSha256: "fixture", retrievedAt: new Date() } } },
      include: { versions: true } });
    sourceId = source.id;
    await loginAs(page, "abogado@estudio.cl");
    const id = source.versions[0].id;
    expect((await page.request.get(`/api/research/sources/${id}/original`)).status()).toBe(404);
    await page.goto(`/jurisprudencia/fuentes/${id}`);
    await expect(page.getByRole("heading", { name: "Sentencia pendiente de revisión" })).toBeVisible();
    await expect(page.getByText(marker)).toHaveCount(0);
    await page.route("**/api/research/sources", async route => {
      expect(route.request().postDataJSON()).toEqual({ mode: "url", url: canonicalUrl });
      await route.fulfill({ status: 422, json: { error: "Texto público no disponible." } });
    });
    await page.getByRole("button", { name: "Recuperar versión pública" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Texto público no disponible." })).toBeVisible();
    await expect(page.getByRole("link", { name: /descargar/i })).toHaveCount(0);
  } finally {
    if (sourceId) await db.legalSource.delete({ where: { id: sourceId } });
    await db.$disconnect();
  }
});
