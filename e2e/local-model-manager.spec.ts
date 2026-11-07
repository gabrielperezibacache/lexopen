import { expect, test } from "@playwright/test";
import { LOCAL_MODELS } from "../src/lib/integrations/local-model-profiles";
import { loginAs } from "./helpers";

test("IA local recomienda por uso, reconoce modelos y exige una acción para activar", async ({ page }, info) => {
  const gib = 1024 ** 3;
  const mutations: string[] = [];
  let checkFailed = false;
  const status = {
    runtime: "ready", message: "", selected: null,
    models: LOCAL_MODELS.map(model => ({ id: model.id, state: "ready" })),
    hardware: { scope: "host", platform: "linux", arch: "x64", cpuName: "CPU de prueba", cpuCores: 4, totalMemoryBytes: 8 * gib, availableMemoryBytes: 5 * gib, diskFreeBytes: 30 * gib, gpu: "unknown" },
    recommendations: [
      { purpose: "documents", candidateId: "qwen-small", reason: "Estimación para revisar pasajes con recursos disponibles.", memoryBudgetBytes: 3 * gib, estimate: true },
      { purpose: "writing", candidateId: "gemma-small", reason: "Estimación para ordenar notas y redactar textos breves.", memoryBudgetBytes: 3 * gib, estimate: true },
      { purpose: "browser", candidateId: null, reason: "La memoria disponible no permite recomendar apoyo local para el navegador.", memoryBudgetBytes: gib, estimate: true },
    ],
    installed: [
      { name: "qwen3:1.7b-q4_K_M", size: LOCAL_MODELS[0].bytes, catalogId: "qwen-small", state: "verified" },
      { name: "modelo-propio:latest", size: gib, state: "unmanaged" },
    ], installedCount: 2, installedLimited: false,
  };
  await page.route("**/api/integrations/llm", route => route.fulfill({ json: {
    enabled: true, config: { preset: "custom", apiUrl: "https://example.invalid/v1", model: "fixture", requireApproval: true, allowDemo: false }, presets: {},
  } }));
  await page.route("**/api/integrations/llm/local", async route => {
    if (route.request().method() === "GET") return route.fulfill({ status: checkFailed ? 503 : 200, json: checkFailed ? { error: "Fallo de prueba" } : status });
    const action = route.request().postDataJSON();
    mutations.push(action.action);
    if (action.action === "activate") return route.fulfill({ json: { ok: true, config: { preset: "ollama", apiUrl: "http://127.0.0.1:11434/v1", model: "gemma3:1b-it-q4_K_M", localProfile: "gemma-small", requireApproval: true, allowDemo: false } } });
    return route.fulfill({ json: { ok: true } });
  });
  await loginAs(page, "socio@estudio.cl");
  await page.goto("/configuracion#llm-settings");
  const manager = page.getByRole("region", { name: "Modelos de IA local", exact: true });
  await expect(manager.getByText("CPU de prueba · 4 núcleos", { exact: true })).toBeVisible();
  const selection = manager.getByRole("combobox", { name: "Modelo local", exact: true });
  await expect(selection).toHaveValue("qwen-small");
  expect(mutations).toEqual([]);
  await manager.getByRole("combobox", { name: "Uso principal de la IA local" }).selectOption("writing");
  await expect(selection).toHaveValue("gemma-small");
  await manager.getByText("Modelos ya instalados · 2", { exact: true }).click();
  await expect(manager.getByText("modelo-propio:latest", { exact: true })).toBeVisible();
  await expect(manager.getByRole("button", { name: "Seleccionar", exact: true })).toHaveCount(1);
  expect(mutations).toEqual([]);
  await manager.getByRole("button", { name: "Probar y usar en el estudio", exact: true }).click();
  await expect(manager.getByText("Modelo probado y activado para la IA del estudio.", { exact: true })).toBeVisible();
  expect(mutations).toEqual(["activate"]);
  await manager.getByRole("combobox", { name: "Uso principal de la IA local" }).selectOption("browser");
  await expect(manager.getByText("Sin recomendación para el estado actual del equipo", { exact: true })).toBeVisible();
  // Hardware and purpose changes never replace the selected study connection.
  await expect(selection).toHaveValue("gemma-small");
  expect(mutations).toEqual(["activate"]);
  for (const [width, height] of [[360, 800], [1280, 920]] as const) {
    await page.setViewportSize({ width, height });
    await manager.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await manager.screenshot({ path: info.outputPath(`modelos-locales-${width}.png`) });
  }
  checkFailed = true;
  await manager.getByRole("button", { name: "Detectar equipo y modelos", exact: true }).click();
  await expect(manager.getByText("No se pudo comprobar la IA local. Vuelve a intentarlo.", { exact: true })).toBeVisible();
  await expect(manager.getByText("CPU de prueba · 4 núcleos", { exact: true })).toHaveCount(0);
  await expect(manager.getByRole("button", { name: "Probar el modelo", exact: true })).toHaveCount(0);
  expect(mutations).toEqual(["activate"]);
});
