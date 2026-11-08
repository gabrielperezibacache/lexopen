/** Real sign-in and app shell; help replies are synthetic and never notify a provider. */
import { expect, test, type Page } from "@playwright/test";
import { loginAs } from "./helpers";

const api = "/api/altazor/help";
async function fixture(page: Page) {
  await page.context().route("**/*", route => {
    const url = new URL(route.request().url());
    return ["http:", "https:"].includes(url.protocol) && !["localhost", "127.0.0.1"].includes(url.hostname) ? route.abort() : route.continue();
  });
  const writes: Record<string, unknown>[] = [];
  const request = {
    id: "help-ui-fictitious", question: "**Elige cómo continuar**\n\nEl expediente permanece en LexOpen.",
    status: "pending", notificationStatus: "notified", expiresAt: "2030-05-06T18:00:00Z", response: null as string | null,
    computerSessionId: "help-ui-desktop", computerTurnId: "help-ui-turn", conversationId: null, causaId: "help-ui-cause",
  };
  const state = {
    config: { ntfy: { enabled: true, baseUrl: "https://ntfy.sh", topic: "private-fictitious-notices", replyTopic: "private-fictitious-replies", hasToken: true }, whatsapp: { enabled: false, channelId: null } },
    requests: [request], whatsappChannels: [], whatsappAvailable: false, whatsappDisplayPhone: null, canConfigureProviders: false, canUse: true,
  };
  let forbidden = false, reconciliations = 0;
  await page.route(url => url.pathname === api, route => {
    if (route.request().method() === "GET") return forbidden
      ? route.fulfill({ status: 403, json: { error: "El acceso de prueba ya no está disponible." } })
      : route.fulfill({ json: state });
    const body = route.request().postDataJSON(); writes.push(body);
    if (body.action === "answer") { request.response = body.response; request.status = "answered"; }
    return route.fulfill({ json: body.action === "answer" ? { accepted: true } : { config: state.config } });
  });
  await page.route(url => url.pathname === `${api}/reconcile`, route => {
    reconciliations++;
    if (request.status === "answered") request.status = "resumed";
    return route.fulfill({ json: { checked: 1 } });
  });
  return { writes, reconciliations: () => reconciliations, revoke: () => { forbidden = true; } };
}

test("una respuesta humana mantiene el estado real y retoma sólo tras comprobar las respuestas", async ({ page }) => {
  await page.clock.install();
  const view = await fixture(page);
  await loginAs(page, "abogado@estudio.cl"); await page.goto("/inicio?altazor=help");
  const panel = page.getByTestId("altazor-help");
  await expect(panel.getByText("Elige cómo continuar", { exact: true })).toHaveJSProperty("tagName", "STRONG");
  await expect(panel.getByRole("link", { name: "Abrir escritorio", exact: true })).toHaveAttribute("href", "/inicio?altazor=computer&escritorio=help-ui-desktop&causaId=help-ui-cause");
  const answer = "**Continúa con el texto revisado**, sin abrir otras cuentas.";
  await panel.getByRole("textbox", { name: "Respuesta para Altazor", exact: true }).fill(answer);
  await panel.getByRole("button", { name: "Enviar respuesta", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "Respuesta recibida", exact: true })).toBeVisible();
  const reply = panel.getByText(answer, { exact: true });
  await expect(reply).toBeVisible(); await expect(reply.locator("strong")).toHaveCount(0);
  await expect(panel.getByRole("heading", { name: "Tarea retomada", exact: true })).toHaveCount(0);
  expect(view.writes).toEqual([{ action: "answer", requestId: "help-ui-fictitious", response: answer }]);
  const before = view.reconciliations();
  await panel.getByRole("button", { name: "Comprobar respuestas", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "Tarea retomada", exact: true })).toBeVisible();
  expect(view.reconciliations()).toBe(before + 1);
  await expect(panel.getByText("Administración del Host · WhatsApp", { exact: true })).toHaveCount(0);
});

test("la configuración personal conserva el token oculto y retira las solicitudes al perder acceso", async ({ page }, info) => {
  await page.clock.install();
  const view = await fixture(page);
  await loginAs(page, "abogado@estudio.cl"); await page.goto("/inicio?altazor=help");
  const panel = page.getByTestId("altazor-help");
  await panel.getByText("Mis canales de ayuda", { exact: true }).click();
  const token = panel.getByLabel("Token de ntfy", { exact: true });
  await expect(token).toHaveValue("");
  await expect(token).toHaveAttribute("placeholder", "Token guardado · vacío para conservar");
  await panel.getByRole("button", { name: "Guardar ntfy", exact: true }).click();
  await expect(panel.getByRole("status")).toContainText("Tu configuración de ayuda por ntfy quedó guardada.");
  expect(view.writes).toEqual([{ action: "configure", config: { ntfy: { enabled: true, baseUrl: "https://ntfy.sh", topic: "private-fictitious-notices", replyTopic: "private-fictitious-replies" } } }]);
  for (const width of [360, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`altazor-help-${width}.png`), animations: "disabled" });
  }
  view.revoke(); await page.clock.fastForward(16_000);
  await expect(panel.getByRole("alert")).toContainText("El acceso de prueba ya no está disponible.");
  await expect(panel.getByText("Elige cómo continuar", { exact: true })).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Enviar respuesta", exact: true })).toHaveCount(0);
  expect(view.writes).toHaveLength(1);
});
