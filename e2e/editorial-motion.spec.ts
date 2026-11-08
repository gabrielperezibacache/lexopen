import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test.beforeEach(async ({ page }) => { await loginAs(page, "socio@estudio.cl"); });

for (const [route, subject, name] of [
  ["/mis-causas", "casefiles", "del expediente"],
  ["/facturacion", "billing", "del libro contable"],
  ["/plazos", "deadlines", "del reloj de bolsillo"],
  ["/buscar", "research", "de la lupa"],
] as const) {
  test(`Flow: animación ${name} comienza sola, despacio y sin sonido`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(route);
    const art = page.locator(`[data-editorial-motion="${subject}"]`);
    const video = art.locator("video");
    await expect(video).toHaveCount(1);
    await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(0.1);
    expect(await video.evaluate(element => (element as HTMLVideoElement).muted)).toBeTruthy();
    expect(await video.evaluate(element => (element as HTMLVideoElement).playbackRate)).toBe(.8);
    await art.getByRole("button", { name: `Pausar animación ${name}`, exact: true }).click();
    expect(await video.evaluate(element => (element as HTMLVideoElement).paused)).toBeTruthy();
    const pausedAt = await video.evaluate(element => (element as HTMLVideoElement).currentTime);
    await art.getByRole("button", { name: `Reanudar animación ${name}`, exact: true }).click();
    await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(pausedAt);
  });
}

test("Flow: móvil oscuro conserva la ilustración y permite reintentar una descarga fallida", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  await page.route("**/editorial/generated/expedientes-flow-v*.mp4", route => route.abort());
  await page.goto("/mis-causas");
  const art = page.locator('[data-editorial-motion="casefiles"]');
  await art.getByRole("button", { name: "Reproducir animación del expediente", exact: true }).click();
  await expect(art.getByRole("status")).toContainText("No se pudo reproducir");
  await expect(art.locator("img")).toBeVisible();
  await expect(art.locator("video")).toHaveCount(0);
  await page.unroute("**/editorial/generated/expedientes-flow-v*.mp4");
  await art.getByRole("button", { name: "Reintentar animación del expediente", exact: true }).click();
  await expect.poll(() => art.locator("video").evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(0.1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

test("Flow: deja reposar la ilustración antes de repetir el ciclo", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/buscar");
  const art = page.locator('[data-editorial-motion="research"]');
  const video = art.locator("video");
  await expect(video).toHaveCount(1);
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
  await video.evaluate(element => { const clip = element as HTMLVideoElement; clip.currentTime = clip.duration - .05; });
  await expect(video).toHaveJSProperty("ended", true);
  const endedAt = Date.now();
  await expect(art.locator("img")).toHaveCSS("opacity", "1");
  await expect.poll(() => video.evaluate(element => {
    const clip = element as HTMLVideoElement;
    return !clip.paused && clip.currentTime > .05 && clip.currentTime < 3;
  }), { timeout: 18_000 }).toBeTruthy();
  expect(Date.now() - endedAt).toBeGreaterThan(13_000);
});

test("Flow: suspende fuera de pantalla y en una pestaña oculta, conservando la pausa manual", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/buscar");
  const art = page.locator('[data-editorial-motion="research"]');
  const video = art.locator("video");
  await expect(video).toHaveCount(1);
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
  await art.evaluate(element => { (element as HTMLElement).style.transform = "translateY(200vh)"; });
  await expect(video).toHaveJSProperty("paused", true);
  await art.evaluate(element => { (element as HTMLElement).style.transform = ""; });
  await expect(video).toHaveJSProperty("paused", false);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(video).toHaveJSProperty("paused", true);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(video).toHaveJSProperty("paused", false);
  await art.getByRole("button", { name: "Pausar animación de la lupa", exact: true }).click();
  await art.evaluate(element => { (element as HTMLElement).style.transform = "translateY(200vh)"; });
  await art.evaluate(element => { (element as HTMLElement).style.transform = ""; });
  await expect(video).toHaveJSProperty("paused", true);
  await expect(art.getByRole("button", { name: "Reanudar animación de la lupa", exact: true })).toBeVisible();
});

test("Flow: movimiento reducido conserva la imagen y permite una reproducción explícita con teclado", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const requests: string[] = [];
  page.on("request", request => { if (/\/editorial\/generated\/.*\.mp4/.test(request.url())) requests.push(request.url()); });
  await page.goto("/buscar");
  const art = page.locator('[data-editorial-motion="research"]');
  await expect(art.getByRole("button", { name: "Reproducir animación de la lupa", exact: true })).toHaveCSS("opacity", "1");
  await expect(art.locator("video")).toHaveCount(0);
  expect(requests).toHaveLength(0);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const video = art.locator("video");
  await expect(video).toHaveCount(1);
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(video).toHaveJSProperty("paused", true);
  await expect(art.locator("img")).toHaveCSS("opacity", "1");
  await art.getByRole("button", { name: "Reproducir animación de la lupa", exact: true }).focus();
  await page.keyboard.press("Enter");
  const pausedAt = await video.evaluate(element => (element as HTMLVideoElement).currentTime);
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(pausedAt);
  await video.evaluate(element => { const clip = element as HTMLVideoElement; clip.currentTime = clip.duration - .05; });
  await expect(video).toHaveJSProperty("ended", true);
  await expect(art.locator("img")).toHaveCSS("opacity", "1");
  await expect(art.getByRole("button", { name: "Reproducir animación de la lupa", exact: true })).toBeVisible();
});

test("Flow: ahorro de datos conserva la imagen sin descargar el vídeo", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "connection", { configurable: true, value: Object.assign(new EventTarget(), { saveData: true }) });
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const requests: string[] = [];
  page.on("request", request => { if (/\/editorial\/generated\/.*\.mp4/.test(request.url())) requests.push(request.url()); });
  await page.goto("/buscar");
  const art = page.locator('[data-editorial-motion="research"]');
  await expect(art.getByRole("button", { name: "Reproducir animación de la lupa", exact: true })).toHaveCSS("opacity", "1");
  await expect(art.locator("video")).toHaveCount(0);
  expect(requests).toHaveLength(0);
  await art.getByRole("button", { name: "Reproducir animación de la lupa", exact: true }).click();
  await expect.poll(() => art.locator("video").evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
});

for (const reducedMotion of ["no-preference", "reduce"] as const) {
test(`Flow: reproducción manual dentro del gesto autorizado (${reducedMotion})`, async ({ page }) => {
  await page.addInitScript(() => {
    const play = HTMLMediaElement.prototype.play;
    let userEvent = false;
    document.addEventListener("click", event => {
      userEvent = event.isTrusted;
    }, true);
    // Next delegates React events on document; close the permission after that listener.
    window.addEventListener("click", () => { userEvent = false; });
    HTMLMediaElement.prototype.play = function () {
      if (!userEvent) return Promise.reject(new DOMException("Requires current user event", "NotAllowedError"));
      return play.call(this);
    };
  });
  await page.emulateMedia({ reducedMotion });
  await page.goto("/buscar");
  const art = page.locator('[data-editorial-motion="research"]');
  await expect(art.getByRole("button", { name: "Reproducir animación de la lupa", exact: true })).toHaveCSS("opacity", "1");
  await expect(art.locator("img")).toHaveCSS("opacity", "1");
  const start = art.getByRole("button", { name: "Reproducir animación de la lupa", exact: true });
  if (reducedMotion === "reduce") { await start.focus(); await page.keyboard.press("Enter"); }
  else await start.click();
  await expect.poll(() => art.locator("video").evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
});
}

test("Flow: mantiene el póster hasta que llega un fotograma válido del navegador", async ({ page }) => {
  await page.addInitScript(() => {
    const requestFrame = HTMLVideoElement.prototype.requestVideoFrameCallback;
    let hold = true;
    const pending: Array<() => void> = [];
    HTMLVideoElement.prototype.requestVideoFrameCallback = function (callback) {
      return requestFrame.call(this, (time, frame) => {
        if (hold) pending.push(() => callback(time, frame));
        else callback(time, frame);
      });
    };
    Object.assign(window, { releaseEditorialFrame() { hold = false; pending.splice(0).forEach(callback => callback()); } });
  });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/buscar");
  const art = page.locator('[data-editorial-motion="research"]');
  const video = art.locator("video");
  await expect.poll(() => video.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
  await expect(video).toHaveCSS("opacity", "0");
  await expect(art.locator("img")).toHaveCSS("opacity", "1");
  await page.evaluate(() => (window as unknown as Window & { releaseEditorialFrame(): void }).releaseEditorialFrame());
  await expect(video).toHaveCSS("opacity", "1");
  await expect(art.locator("img")).toHaveCSS("opacity", "0");
});

test("Flow: navegar entre apartados detiene el vídeo anterior y conserva el motivo correcto", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/mis-causas");
  const oldVideo = await page.locator('[data-editorial-motion="casefiles"] video').elementHandle();
  expect(oldVideo).not.toBeNull();
  await expect.poll(() => oldVideo!.evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
  await page.locator('a[href="/buscar"]').first().click();
  await expect(page).toHaveURL(/\/buscar$/);
  await expect.poll(() => oldVideo!.evaluate(element => (element as HTMLVideoElement).paused)).toBeTruthy();
  const research = page.locator('[data-editorial-motion="research"]');
  await expect(research.locator("img")).toHaveAttribute("src", /investigacion-motion-flow-v1-poster/);
  await expect.poll(() => research.locator("video").evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
  await page.goBack();
  const cases = page.locator('[data-editorial-motion="casefiles"]');
  await expect(cases.locator("img")).toHaveAttribute("src", /expedientes-flow-v2-poster/);
  await expect.poll(() => cases.locator("video").evaluate(element => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(.1);
});
