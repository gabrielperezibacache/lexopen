import { chromium, expect, test, type APIResponse, type Locator, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { rm } from "node:fs/promises";
import path from "node:path";
import { loginAs } from "./helpers";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import type { HearingLiveAudioView } from "../src/lib/audio/live-types";
import type { HearingLiveMutation } from "../src/lib/hearings/live-types";
import type { HearingPromotionResult } from "../src/lib/hearings/promotions-types";

const db = new PrismaClient({ datasources: { db: { url: assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL) } } });
if ([process.env.S3_BUCKET, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) throw new Error("Live transcription fixtures require local disposable storage");
const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3100", tag = randomUUID();
const email = `speech-owner-${tag}@example.test`, colleagueEmail = `speech-colleague-${tag}@example.test`;
const transcript = "Material ficticio: el compareciente manifestó que entregó el comprobante de pago el 12 de octubre de 2026. Esta salida simulada no acredita reconocimiento de voz.";
let ownerId = "", colleagueId = "", causaId = "", provider: Server, providerCalls = 0, rejectProvider = false;
let priorConfig: { enabled: boolean; configJson: string } | null = null;
const live = (workspaceId: string) => `/api/causas/${causaId}/hearings/${workspaceId}/live`;
async function json<T>(response: Pick<APIResponse, "status" | "text" | "json">, status = 200): Promise<T> {
  expect(response.status(), (await response.text()).slice(0, 1000)).toBe(status); return response.json();
}
async function createDesk(page: Page, title: string) {
  return json<{ id: string }>(await page.request.post(`/api/causas/${causaId}/hearings`, { data: { title } }), 201);
}
async function openLive(page: Page, workspaceId: string) {
  await page.goto(`/causas/${causaId}/audiencias?mesa=${workspaceId}`);
  await page.getByRole("button", { name: "En vivo", exact: true }).click();
  await expect(page.getByTestId("hearing-live-audio")).toBeVisible();
}
async function startCapture(panel: Locator, title: string) {
  await panel.getByRole("textbox", { name: "Nombre de la captura", exact: true }).fill(title);
  await panel.getByRole("checkbox", { name: "Confirmo que puedo captar este audio y enviarlo al servicio configurado", exact: true }).check();
  await panel.getByRole("button", { name: "Iniciar captura y transcripción", exact: true }).click();
  await expect(panel.getByRole("button", { name: "Detener captura", exact: true })).toBeEnabled();
}
async function screenshot(page: Page, element: Locator, file: string, mobile = false) {
  await element.evaluate((node, offset) => window.scrollTo({ top: Math.max(0, scrollY + node.getBoundingClientRect().top - offset), behavior: "instant" }), mobile ? 160 : 112);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.screenshot({ path: file, animations: "disabled" });
}
async function microphonePage() {
  // Native Chromium MediaRecorder and synthetic input device: no real microphone
  // and no claim to test recognition accuracy. The local HTTP fixture supplies text.
  const browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  const context = await browser.newContext({ baseURL, permissions: ["microphone"], locale: "es-CL", viewport: { width: 1440, height: 1100 }, reducedMotion: "reduce" });
  await context.addInitScript(() => {
    const media = navigator.mediaDevices;
    if (!media) return;
    const original = media.getUserMedia.bind(media);
    Object.defineProperty(window, "__lexopenSyntheticStreams", { value: [] });
    media.getUserMedia = async options => {
      const stream = await original(options);
      (window as unknown as { __lexopenSyntheticStreams: MediaStream[] }).__lexopenSyntheticStreams.push(stream);
      return stream;
    };
  });
  return { browser, page: await context.newPage() };
}
async function microphoneEnded(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const streams = (window as unknown as { __lexopenSyntheticStreams?: MediaStream[] }).__lexopenSyntheticStreams || [];
    return streams.length > 0 && streams.every(stream => stream.getTracks().every(track => track.readyState === "ended"));
  })).toBeTruthy();
}

test.beforeAll(async () => {
  const seed = await db.user.findUniqueOrThrow({ where: { email: "abogado@estudio.cl" }, select: { password: true } });
  ownerId = (await db.user.create({ data: { email, name: "Profesional ficticio de transcripción", role: "abogado", password: seed.password } })).id;
  colleagueId = (await db.user.create({ data: { email: colleagueEmail, name: "Colega ficticio de transcripción", role: "abogado", password: seed.password } })).id;
  causaId = (await db.causa.create({ data: { titulo: "Audiencia ficticia con transcripción por tramos", rit: "C-2026-AUDIO", tribunal: "Tribunal ficticio", materia: "civil", acceso: "equipo", abogadoId: ownerId } })).id;
  await db.causaMiembro.create({ data: { causaId, userId: colleagueId, rol: "colaborador" } });
  priorConfig = await db.integrationConfig.findUnique({ where: { provider: "transcription" }, select: { enabled: true, configJson: true } });
  provider = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/audio/transcriptions") { response.writeHead(404).end(); return; }
    let length = 0;
    for await (const part of request) { length += (part as Buffer).length; if (length > 5 * 1024 * 1024) { response.writeHead(413).end(); return; } }
    providerCalls++;
    response.writeHead(rejectProvider ? 503 : 200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(rejectProvider ? { error: "Fallo simulado del transcriptor" } : { text: transcript }));
  });
  await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve));
  const address = provider.address(); if (!address || typeof address === "string") throw new Error("No fixture port");
  const configJson = JSON.stringify({ preset: "local", apiUrl: `http://127.0.0.1:${address.port}/v1`, model: "synthetic-browser-test", responseFormat: "json" });
  await db.integrationConfig.upsert({ where: { provider: "transcription" }, create: { provider: "transcription", enabled: true, configJson }, update: { enabled: true, configJson } });
});
test.afterAll(async () => {
  try {
    const recordings = causaId ? await db.caseAudio.findMany({ where: { causaId }, select: { storageKey: true } }) : [];
    if (causaId) {
      await db.caseWritingDraft.deleteMany({ where: { causaId } });
      await db.caseFact.deleteMany({ where: { causaId } });
      await db.caseAudio.deleteMany({ where: { causaId } });
      await db.hearingWorkspace.deleteMany({ where: { causaId } });
      await db.documento.deleteMany({ where: { causaId } });
      await db.causa.deleteMany({ where: { id: causaId } });
    }
    for (const actorId of [ownerId, colleagueId].filter(Boolean)) { await db.auditEvent.deleteMany({ where: { actorId } }); await db.user.deleteMany({ where: { id: actorId } }); }
    await Promise.all(recordings.map(row => rm(path.join(process.env.STORAGE_PATH || "storage", row.storageKey), { force: true })));
    if (priorConfig) await db.integrationConfig.upsert({ where: { provider: "transcription" }, create: { provider: "transcription", ...priorConfig }, update: priorConfig });
    else await db.integrationConfig.deleteMany({ where: { provider: "transcription" } });
  } finally { if (provider) await new Promise<void>(resolve => provider.close(() => resolve())); await db.$disconnect(); }
});

test("captura nativa por tramos: transcripción, pasaje, hecho propuesto, nota y escrito con citas", async ({ browserName }, info) => {
  test.setTimeout(180_000);
  expect(browserName).toBe("chromium");
  const { browser, page } = await microphonePage();
  try {
    await loginAs(page, email);
    const desk = await createDesk(page, "Transcripción y revisión ficticias");
    await openLive(page, desk.id);
    const audio = page.getByTestId("hearing-live-audio"), panel = page.getByTestId("hearing-live");
    expect(await page.evaluate(() => (window as unknown as { __lexopenSyntheticStreams: MediaStream[] }).__lexopenSyntheticStreams.length)).toBe(0);
    await startCapture(audio, "Declaración ficticia para revisión");
    for (const [name, viewport] of [["desktop", { width: 1440, height: 1100 }], ["mobile", { width: 360, height: 900 }]] as const) {
      await page.setViewportSize(viewport);
      await screenshot(page, audio, info.outputPath(`capture-active-${name}.png`), name === "mobile");
    }
    await page.setViewportSize({ width: 1440, height: 1100 });
    const first = audio.getByTestId("live-audio-clip").filter({ hasText: transcript }).first();
    await expect(first).toBeVisible({ timeout: 55_000 });
    await audio.getByRole("button", { name: "Detener captura", exact: true }).click();
    await microphoneEnded(page);
    const listening = first.locator("audio");
    await expect(listening).toBeVisible();
    await listening.evaluate(node => { const player = node as HTMLAudioElement; player.preload = "metadata"; player.load(); });
    await expect.poll(() => listening.evaluate(node => (node as HTMLAudioElement).readyState)).toBeGreaterThanOrEqual(1);
    expect(providerCalls).toBeGreaterThan(0);
    const listing = await json<HearingLiveAudioView>(await page.request.get(`${live(desk.id)}/audio`));
    expect(listing.sessions).toHaveLength(1);
    expect((await json<{ audios: unknown[] }>(await page.request.get(`/api/causas/${causaId}/audios`))).audios).toHaveLength(0);
    await first.getByRole("button", { name: "Usar pasaje en el registro", exact: true }).first().click();
    await panel.getByRole("textbox", { name: "Encabezado del registro", exact: true }).fill("Declaración sobre el comprobante");
    await panel.getByRole("textbox", { name: "Registro de audiencia", exact: true }).fill("Se anota la declaración sobre la entrega del comprobante; debe contrastarse con los demás antecedentes.");
    const saving = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === `${live(desk.id)}/entries`);
    await panel.getByRole("button", { name: "Guardar registro de audiencia", exact: true }).click();
    const saved = await json<HearingLiveMutation>(await saving, 201);
    expect(saved.note?.available && saved.note.citation?.quote).toContain("compareciente");
    const entry = panel.getByTestId("live-entry").filter({ hasText: "Declaración sobre el comprobante" });
    const results: HearingPromotionResult[] = [];
    for (const target of ["fact", "note", "writing"] as const) {
      await entry.getByRole("button", { name: "Crear hecho, nota o escrito", exact: true }).click();
      const promotion = page.getByTestId("hearing-live-promotion");
      await promotion.getByRole("combobox", { name: "Convertir en", exact: true }).selectOption(target);
      if (target !== "fact") await promotion.getByRole("textbox", { name: "Título de la propuesta", exact: true }).fill(`Propuesta ficticia ${target}`);
      await promotion.getByRole("textbox", { name: "Contenido de la propuesta", exact: true }).fill("El compareciente manifestó haber entregado el comprobante. Propuesta pendiente de revisión y contraste.");
      await promotion.getByRole("checkbox").check();
      if (target === "writing") {
        for (const [name, viewport] of [["desktop", { width: 1440, height: 1100 }], ["mobile", { width: 360, height: 900 }]] as const) {
          await page.setViewportSize(viewport);
          await screenshot(page, promotion, info.outputPath(`promotion-${name}.png`), name === "mobile");
        }
        await page.setViewportSize({ width: 1440, height: 1100 });
      }
      const converting = page.waitForResponse(response => response.request().method() === "POST" && new URL(response.url()).pathname === `${live(desk.id)}/promotions`);
      await promotion.getByRole("button", { name: "Confirmar conversión", exact: true }).click();
      const response = await converting, result = await json<HearingPromotionResult>(response, 201); results.push(result);
      const replay = await json<HearingPromotionResult>(await page.request.post(`${live(desk.id)}/promotions`, { data: response.request().postDataJSON() }), 201);
      expect(replay.id).toBe(result.id); expect(replay.reused).toBeTruthy();
      if (target !== "writing") await promotion.getByRole("button", { name: "Volver al registro", exact: true }).click();
    }
    const fact = await db.caseFact.findUniqueOrThrow({ where: { id: results[0].id }, include: { citations: true } });
    expect(fact.status).toBe("proposed"); expect(fact.citations).toHaveLength(1);
    const draft = await json<{ body: string; references: { source: { citations: { quote: string }[]; warnings: string[] } }[] }>(await page.request.get(`/api/causas/${causaId}/writings/${results[2].id}`));
    expect(draft.body).toContain("[^R1]"); expect(draft.references[0].source.citations[0].quote).toContain("compareciente");
    expect(draft.references[0].source.warnings.join(" ")).toContain("transcripción");
    for (const [name, viewport] of [["desktop", { width: 1440, height: 1100 }], ["mobile", { width: 360, height: 900 }]] as const) {
      await page.setViewportSize(viewport);
      await screenshot(page, audio, info.outputPath(`transcription-${name}.png`), name === "mobile");
      await screenshot(page, audio.locator(".hearing-live-audio-transcript"), info.outputPath(`transcription-clips-${name}.png`), name === "mobile");
    }
    await page.setViewportSize({ width: 1440, height: 1100 }); await page.evaluate(() => document.documentElement.classList.add("dark"));
    await screenshot(page, audio, info.outputPath("transcription-dark.png"));
    await page.getByTestId("hearing-live-promotion").getByRole("button", { name: "Volver al registro", exact: true }).click();
    await panel.getByText("Preparar el guion guardado", { exact: true }).click();
    await panel.getByRole("checkbox", { name: /Propuesta ficticia note/ }).check();
    await panel.getByTestId("live-cue").getByRole("button", { name: "Propuesta ficticia note", exact: true }).click();
    await panel.getByRole("button", { name: "Abrir respaldo en el lector", exact: true }).click();
    await expect(page.locator(".hearing-reading")).toContainText(transcript);
    await page.reload(); await page.getByRole("button", { name: "En vivo", exact: true }).click();
    await expect(audio.getByTestId("live-audio-clip").filter({ hasText: transcript }).first()).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __lexopenSyntheticStreams: MediaStream[] }).__lexopenSyntheticStreams.length)).toBe(0);
    const context = await browser.newContext({ baseURL, locale: "es-CL" }), colleague = await context.newPage();
    try {
      await loginAs(colleague, colleagueEmail);
      expect((await colleague.request.get(`${live(desk.id)}/audio`)).status()).toBe(404);
      const clip = await db.hearingLiveAudioClip.findFirstOrThrow({ where: { session: { workspaceId: desk.id }, status: "ready" } });
      expect((await colleague.request.get(`/api/causas/${causaId}/audios/${clip.audioId}/original`)).status()).toBe(404);
    } finally { await context.close(); }
  } finally { await browser.close(); }
});

test("protege enlaces y Atrás detiene la captura con recuperación del tramo sin envío automático", async () => {
  test.setTimeout(120_000);
  const { browser, page } = await microphonePage();
  try {
    await loginAs(page, email); const desk = await createDesk(page, "Retorno ficticio a captura pendiente");
    await page.goto(`/causas/${causaId}`);
    await page.getByRole("link", { name: "Abrir mesa de audiencia", exact: true }).click();
    await page.getByRole("button", { name: "En vivo", exact: true }).click();
    const audio = page.getByTestId("hearing-live-audio");
    await startCapture(audio, "Tramo ficticio aún sin enviar");
    // Produce native audio before leaving, without waiting for the 15 s upload.
    await page.waitForTimeout(1200);
    const calls = providerCalls;
    await page.getByRole("complementary").getByRole("link", { name: "Causas", exact: true }).click();
    await expect(audio.getByRole("alert")).toContainText("Detenga la captura");
    await expect(page).toHaveURL(new RegExp(`/causas/${causaId}/audiencias`));
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/causas/${causaId}$`));
    await microphoneEnded(page);
    await page.getByRole("link", { name: "Abrir mesa de audiencia", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/causas/${causaId}/audiencias`));
    await page.getByRole("button", { name: "En vivo", exact: true }).click();
    await expect(audio.getByText(/Se recuperó audio pendiente/)).toBeVisible();
    await expect(audio.getByRole("button", { name: "Descargar audio pendiente", exact: true })).toBeVisible();
    expect(providerCalls).toBe(calls);
    expect(await db.hearingLiveAudioClip.count({ where: { session: { workspaceId: desk.id } } })).toBe(0);
    await audio.getByRole("button", { name: "Guardar tramo pendiente", exact: true }).click();
    await expect(audio.getByTestId("live-audio-clip").filter({ hasText: transcript }).first()).toBeVisible({ timeout: 30_000 });
    expect(await page.evaluate(() => (window as unknown as { __lexopenSyntheticStreams: MediaStream[] }).__lexopenSyntheticStreams.length)).toBe(1);
  } finally { await browser.close(); }
});

test("fallo del transcriptor: conserva audio, detiene el micrófono y permite reintentar", async () => {
  test.setTimeout(120_000); rejectProvider = true;
  const { browser, page } = await microphonePage();
  try {
    await loginAs(page, email); const desk = await createDesk(page, "Recuperación ficticia de transcripción");
    await openLive(page, desk.id); const audio = page.getByTestId("hearing-live-audio");
    await startCapture(audio, "Captura ficticia con interrupción");
    const failed = audio.getByTestId("live-audio-clip").filter({ hasText: "Reintentar transcripción" }).first();
    await expect(failed).toBeVisible({ timeout: 55_000 });
    await microphoneEnded(page);
    const before = await db.caseAudio.count({ where: { causaId, liveSessionId: { not: null } } });
    rejectProvider = false;
    await failed.getByRole("button", { name: "Reintentar transcripción", exact: true }).click();
    await expect(audio.getByTestId("live-audio-clip").filter({ hasText: transcript }).first()).toBeVisible();
    expect(await db.caseAudio.count({ where: { causaId, liveSessionId: { not: null } } })).toBe(before);
  } finally { rejectProvider = false; await browser.close(); }
});
