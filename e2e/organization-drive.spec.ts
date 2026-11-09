import { test, expect } from "@playwright/test";
import { loginAs } from "./helpers";
test("Organización Drive: elegir raíz una vez y preparar carpeta personal", async ({ page }) => {
  test.setTimeout(180_000);
  let selected = false, writes = 0;
  const commands: Record<string, unknown>[] = [];
  await page.route("**/api/integrations/google/organization**", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { userId: "fixture-user", canConfigureRoot: true, connectionId: "fixture-connection", bindingRevision: "a".repeat(64), revision: selected ? "root-revision" : "", canManage: true, root: selected ? { id: "RootFolderFixture123", name: "Estudio fixture", url: "https://drive.google.com/drive/folders/RootFolderFixture123" } : null, listing: { folders: [{ id: "RootFolderFixture123", name: "Estudio fixture" }], nextPageToken: null, incompleteSearch: false } } });
    const body = route.request().postDataJSON(); commands.push(body); writes++;
    if (body.action === "root") selected = true;
    return route.fulfill({ json: { state: "completed", message: "Destino preparado", ...(body.action === "organize" ? { folder: { id: "UserFolderFixture123", name: "Usuario fixture", url: "https://drive.google.com/drive/folders/UserFolderFixture123" } } : {}) } });
  });
  await loginAs(page, "socio@estudio.cl");
  await page.goto("/configuracion?section=google-settings");
  const panel = page.getByRole("region", { name: "Organización en Google Drive", exact: true });
  await expect(panel).toBeVisible({ timeout: 20_000 });
  await panel.getByRole("button", { name: "Elegir Organización", exact: true }).click();
  await panel.getByRole("button", { name: "Elegir Estudio fixture", exact: true }).click();
  await expect(panel.getByRole("link", { name: "Estudio fixture", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Preparar mi carpeta de usuario", exact: true }).click();
  await expect(panel.getByRole("link", { name: "Abrir carpeta preparada", exact: true })).toHaveAttribute("href", "https://drive.google.com/drive/folders/UserFolderFixture123");
  expect(writes).toBe(2); expect(commands[0].action).toBe("root"); expect(commands[1]).toMatchObject({ action: "organize", kind: "user", id: "fixture-user", revision: "root-revision", confirmed: true });
});
