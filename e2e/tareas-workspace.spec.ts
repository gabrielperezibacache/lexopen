import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("Tareas permite delegar, editar instrucciones y priorizar una causa", async ({ page }) => {
  test.slow();
  await loginAs(page, "socio@estudio.cl");
  await page.goto("/tareas");
  const filters = page.getByRole("group", { name: "Filtros de tareas" });
  await expect(filters).toBeVisible();
  const causes = await filters.getByRole("combobox", { name: "Causa", exact: true }).locator("option").evaluateAll(options =>
    options.map(option => (option as HTMLOptionElement).value).filter(Boolean)
  );
  expect(causes.length).toBeGreaterThanOrEqual(2);
  const first = "Preparar evidencia priorizable";
  const second = "Revisar escrito urgente";

  async function create(title: string, causeId: string, priority: string) {
    await page.getByRole("button", { name: "Nueva tarea", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Nueva tarea" });
    await dialog.getByLabel("Título").fill(title);
    await dialog.getByLabel("Descripción").fill("Revisión ficticia del expediente");
    await dialog.getByLabel("Cómo hacerlo").fill("Contrastar el original con la copia de trabajo");
    await dialog.getByLabel("Consideraciones").fill("Usar solo documentos aprobados");
    await dialog.getByRole("combobox", { name: "Causa", exact: true }).selectOption(causeId);
    await dialog.getByRole("combobox", { name: "Prioridad" }).selectOption(priority);
    await expect(dialog.getByRole("combobox", { name: "Responsable" })).toBeEnabled();
    await dialog.getByRole("combobox", { name: "Responsable" }).selectOption({ label: "Andrés Valenzuela" });
    await dialog.getByRole("button", { name: "Crear tarea" }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 15_000 });
  }

  await create(first, causes[0], "low");
  await create(second, causes[1], "urgent");
  const rows = page.getByRole("list", { name: "Tareas por prioridad" });
  const relevant = () => rows.getByRole("heading", { name: new RegExp(`${first}|${second}`) });
  await expect(relevant()).toHaveText([second, first]);
  await filters.getByRole("combobox", { name: "Priorizar causa" }).selectOption(causes[0]);
  await expect(relevant()).toHaveText([first, second]);
  await page.screenshot({ path: test.info().outputPath("tareas-priorizadas.png") });
  const selected = rows.getByRole("listitem").filter({ has: page.getByRole("heading", { name: first }) });
  await expect(selected).toContainText("Andrés Valenzuela");
  await selected.getByRole("button", { name: "Editar" }).click();
  const editor = page.getByRole("dialog", { name: "Editar tarea" });
  await expect(editor.getByLabel("Cómo hacerlo")).toHaveValue("Contrastar el original con la copia de trabajo");
  await editor.getByRole("combobox", { name: "Prioridad" }).selectOption("high");
  await editor.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(selected).toContainText("Alta");
  await selected.getByRole("button", { name: "Marcar hecha" }).click();
  await expect(selected).toHaveCount(0);
  await filters.getByRole("combobox", { name: "Estado", exact: true }).selectOption("closed");
  await expect(page.getByRole("heading", { name: first })).toBeVisible();
  await page.setViewportSize({ width: 360, height: 800 });
  await expect(filters).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});
