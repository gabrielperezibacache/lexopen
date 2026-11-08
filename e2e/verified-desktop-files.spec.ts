import { test, expect, type Page } from "@playwright/test";
import type { ComputerSessionSummary, VerifiedComputerFile } from "../src/lib/altazor/computer/types";
import { loginAs } from "./helpers";

const session: ComputerSessionSummary = { id: "verified-files-ui-fixture", state: "ready", expiresAt: "2031-05-06T18:00:00Z", renewableUntil: "2031-05-06T19:00:00Z", canRenew: false, held: false, createdAt: "2031-05-06T17:00:00Z", connectors: ["altazor-google-0123456789abcdef"], requiresStop: true };
const file: VerifiedComputerFile = { state: "desktop_verified", requestId: "owned-ui-request", approvalId: "owned-ui-approval", chatId: "owned-ui-chat", kittyId: "owned-ui-kitty", connector: session.connectors[0], kind: "google-workspace", action: "download_file", target: { id: "synthetic-document" }, localPath: `/home/kitty/work/imports/${"a".repeat(64)}/Programa.pdf`, name: "Programa.pdf", bytes: 4200, sha256: "a".repeat(64), pages: 3 };
const frame = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7ioAAAAASUVORK5CYII=", "base64");
async function fixture(page: Page, verifiedFiles: VerifiedComputerFile[]) {
  await page.route(/\/api\/altazor\/computer\/activity(?:\?.*)?$/, route => route.fulfill({ json: { state: "ready", sessionId: session.id, monitor: true, verifiedFiles } }));
  await page.route(/\/api\/altazor\/computer(?:\?.*)?$/, route => route.fulfill({ json: { computer: { enabled: true, configured: true, policyAllowed: true, canConfigure: false, state: "configured", workspaceId: "verified-files-workspace", provider: "synthetic-native", version: "synthetic-native.9", lastVerifiedAt: null, reason: null, runtime: "container", sessions: [session] } } }));
  await page.route(`**/api/altazor/connectors?workspaceId=verified-files-workspace`, route => route.fulfill({ json: { connectors: { catalog: [], connections: [], gateReady: true, version: "synthetic-native.9" } } }));
  await page.route(`**/api/altazor/computer/sessions/${session.id}`, route => route.fulfill({ json: { session, runtime: "container", kittyStatus: "running", working: false, approvals: [], turns: [{ index: 0, from: "assistant", text: "El modelo afirmó cinco páginas sin comprobarlas.", working: false, needsHelp: false, steps: [] }], verifiedFiles } }));
  await page.route(`**/api/altazor/computer/sessions/${session.id}/screenshot?*`, route => route.fulfill({ body: frame, contentType: "image/png" }));
}
test("el monitor muestra hechos de archivos verificados y los conserva al recargar", async ({ page }, info) => {
  await fixture(page, [file]); await loginAs(page, "abogado@estudio.cl"); await page.goto(`/inicio?altazor=computer&escritorio=${session.id}`);
  const panel = page.getByRole("region", { name: "Escritorio de Altazor", exact: true, includeHidden: true }).filter({ has: page.getByLabel("Sesión de este espacio", { exact: true }) });
  const verified = panel.getByRole("region", { name: "Archivos descargados y verificados" });
  await expect(verified).toContainText("Programa.pdf"); await expect(verified).toContainText("3 páginas"); await expect(verified).not.toContainText("cinco");
  await verified.getByText("Origen y verificación", { exact: true }).click(); await expect(verified).toContainText(file.sha256); await expect(verified).toContainText(file.localPath);
  await verified.screenshot({ path: info.outputPath("verified-desktop-file.png") });
  await page.setViewportSize({ width: 360, height: 800 }); await verified.scrollIntoViewIfNeeded();
  expect(await verified.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await verified.screenshot({ path: info.outputPath("verified-mobile-file.png") });
  await page.reload(); await expect(panel.getByRole("region", { name: "Archivos descargados y verificados" })).toContainText("3 páginas");
});
test("una afirmación del modelo sin recibo no crea una descarga verificada", async ({ page }) => {
  await fixture(page, []); await loginAs(page, "abogado@estudio.cl"); await page.goto(`/inicio?altazor=computer&escritorio=${session.id}`);
  await expect(page.getByText("El modelo afirmó cinco páginas sin comprobarlas.", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Archivos descargados y verificados" })).toHaveCount(0);
});
test("la primera línea se muestra como texto literal y no como HTML", async ({ page }) => {
  const textFile = { ...file, pages: undefined, firstLine: "<script>texto del archivo</script>", name: "Notas.txt", localPath: `/home/kitty/work/imports/${file.sha256}/Notas.txt` };
  await fixture(page, [textFile]); await loginAs(page, "abogado@estudio.cl"); await page.goto(`/inicio?altazor=computer&escritorio=${session.id}`);
  const panel = page.getByRole("region", { name: "Escritorio de Altazor", exact: true, includeHidden: true }).filter({ has: page.getByLabel("Sesión de este espacio", { exact: true }) });
  const verified = panel.getByRole("region", { name: "Archivos descargados y verificados" });
  await expect(verified).toContainText(textFile.firstLine); await expect(verified.locator("script")).toHaveCount(0); await expect(verified).not.toContainText("páginas");
});
