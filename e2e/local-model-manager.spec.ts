import { expect, test } from "@playwright/test";
import { LOCAL_MODELS } from "../src/lib/integrations/local-model-profiles";
import { localModelRecommendation, normalizeLocalModelHardware } from "../src/lib/integrations/local-model-hardware";
import { loginAs } from "./helpers";

test("IA local compara memoria sin agrupar por función y exige una acción para activar", async ({ page }, info) => {
  test.setTimeout(60_000);
  const gib = 1024 ** 3;
  const mutations: string[] = [];
  let checkFailed = false;
  const status = {
    runtime: "ready", message: "", selected: null,
    models: LOCAL_MODELS.map(model => ({ id: model.id, state: "ready" })),
    hardware: { scope: "host", platform: "linux", arch: "x64", cpuName: "CPU de prueba", cpuCores: 4, totalMemoryBytes: 8 * gib, availableMemoryBytes: 5 * gib, diskFreeBytes: 30 * gib, gpu: "unknown" },
    recommendation: { candidateId: "qwen-small", reason: "Estimación por memoria y consumo moderado.", memoryBudgetBytes: 3 * gib, estimate: true },
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
  const manager = page.getByRole("region", { name: "Modelos de IA locales", exact: true });
  await expect(manager.getByText("CPU de prueba · 4 núcleos", { exact: true })).toBeVisible({ timeout: 15_000 });
  const selection = manager.getByRole("combobox", { name: "Modelo local", exact: true });
  await expect(selection).toHaveValue("qwen-small");
  expect(mutations).toEqual([]);
  await expect(manager.getByRole("combobox", { name: "Uso principal de la IA local" })).toHaveCount(0);
  const comparison = manager.getByRole("region", { name: "Comparación de modelos por memoria" });
  await expect(manager.getByRole("combobox", { name: "Tipo de memoria" })).toHaveValue("auto");
  await expect(manager.getByRole("combobox", { name: "Capacidad del equipo" })).toHaveValue("auto");
  await expect(comparison.getByRole("row")).toHaveCount(5);
  await manager.getByRole("combobox", { name: "Capacidad del equipo" }).selectOption("");
  await expect(comparison.getByRole("row")).toHaveCount(LOCAL_MODELS.length + 1);
  await manager.getByRole("combobox", { name: "Capacidad del equipo" }).selectOption("8");
  await expect(comparison.getByRole("button", { name: "Elegir Qwen3.5 2B", exact: true })).toBeVisible();
  await expect(comparison.getByRole("button", { name: "Elegir Qwen3.5 4B", exact: true })).toHaveCount(0);
  await manager.getByRole("combobox", { name: "Tipo de memoria" }).selectOption("vram");
  await comparison.getByRole("button", { name: "Elegir Qwen3.5 4B", exact: true }).click();
  await expect(selection).toHaveValue("qwen35-4b");
  expect(mutations).toEqual([]);
  await selection.selectOption("gemma-small");
  await expect(selection).toHaveValue("gemma-small");
  await manager.getByText("Modelos ya instalados · 2", { exact: true }).click();
  await expect(manager.getByText("modelo-propio:latest", { exact: true })).toBeVisible();
  await expect(manager.getByRole("button", { name: "Seleccionar", exact: true })).toHaveCount(1);
  expect(mutations).toEqual([]);
  await manager.getByRole("button", { name: "Probar y usar en el estudio", exact: true }).click();
  await expect(manager.getByText("Modelo probado y activado para la IA del estudio.", { exact: true })).toBeVisible();
  expect(mutations).toEqual(["activate"]);
  await manager.getByRole("combobox", { name: "Tipo de memoria" }).selectOption("unified");
  await manager.getByRole("combobox", { name: "Capacidad del equipo" }).selectOption("24");
  await expect(comparison.getByRole("button", { name: "Elegir gpt-oss 20B", exact: true })).toBeVisible();
  await expect(comparison.getByRole("button", { name: "Elegir gpt-oss 120B", exact: true })).toHaveCount(0);
  // Manual memory filters never replace the selected study connection.
  await expect(selection).toHaveValue("gemma-small");
  expect(mutations).toEqual(["activate"]);
  await manager.getByRole("combobox", { name: "Capacidad del equipo" }).selectOption("8");
  for (const [width, height] of [[360, 800], [1280, 920]] as const) {
    await page.setViewportSize({ width, height });
    await manager.scrollIntoViewIfNeeded();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await manager.screenshot({ path: info.outputPath(`modelos-locales-${width}.png`) });
  }
  checkFailed = true;
  await manager.getByRole("button", { name: "Detectar equipo y modelos", exact: true }).click();
  await expect(manager.getByText("No se pudo comprobar la IA local. Vuelve a intentarlo.", { exact: true })).toBeVisible();
  await expect(manager.getByText("CPU de prueba · 4 núcleos", { exact: true })).toHaveCount(0);
  await expect(manager.getByRole("button", { name: "Probar el modelo", exact: true })).toHaveCount(0);
  await expect(comparison.getByRole("button", { name: "Elegir Qwen3.5 2B", exact: true })).toBeVisible();
  expect(mutations).toEqual(["activate"]);
});

test("detecta RAM, memoria unificada y VRAM y recomienda sin ninguna mutación", async ({ page }, info) => {
  test.setTimeout(60_000);
  const gib = 1024 ** 3;
  const mutations: string[] = [];
  const base = { cpuName: "CPU de prueba", cpuCores: 8, totalMemoryBytes: 32 * gib, freeMemoryBytes: 19 * gib, availableMemoryBytes: 19 * gib, diskFreeBytes: null };
  const scenarios = [
    { hardware: normalizeLocalModelHardware({ ...base, platform: "linux", totalMemoryBytes: 8 * gib, freeMemoryBytes: 6 * gib, availableMemoryBytes: 6 * gib }), expected: "Qwen3.5 2B" },
    { hardware: normalizeLocalModelHardware({ ...base, platform: "darwin", cpuName: "Apple de prueba", totalMemoryBytes: 36 * gib, freeMemoryBytes: gib, availableMemoryBytes: gib, systemAvailableMemoryBytes: 30 * gib, availableMemorySource: "memory-pressure", gpus: [{ name: "Apple M4 de prueba", vendor: "apple", memoryKind: "unified", totalMemoryBytes: null, availableMemoryBytes: null, source: "system-profiler" }] }), expected: "Qwen3.8 27B" },
    { hardware: normalizeLocalModelHardware({ ...base, platform: "win32", gpus: [{ name: "NVIDIA de prueba", vendor: "nvidia", memoryKind: "dedicated", totalMemoryBytes: 24 * gib, availableMemoryBytes: 23 * gib, source: "nvidia-smi" }] }), expected: "Qwen3.8 27B" },
  ];
  let scenario = scenarios[0];
  await page.route("**/api/integrations/llm", route => route.fulfill({ json: {
    enabled: true, config: { preset: "ollama", apiUrl: "http://127.0.0.1:11434/v1", model: "qwen3:1.7b-q4_K_M", localProfile: "qwen-small", requireApproval: true, allowDemo: false }, presets: {},
  } }));
  await page.route("**/api/integrations/llm/local", route => {
    if (route.request().method() !== "GET") mutations.push(route.request().method());
    return route.fulfill({ json: { runtime: "unavailable", message: "Ollama no está abierto.", models: [], installed: [], installedCount: 0, hardware: scenario.hardware, recommendation: localModelRecommendation(scenario.hardware) } });
  });
  await loginAs(page, "socio@estudio.cl");
  await page.goto("/configuracion#llm-settings");
  const manager = page.getByRole("region", { name: "Modelos de IA locales", exact: true });
  for (const [index, next] of scenarios.entries()) {
    scenario = next;
    if (index) await manager.getByRole("button", { name: "Detectar equipo y modelos", exact: true }).click();
    await expect(manager.getByText(`Recomendación para documentos: ${next.expected}`, { exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(manager.getByRole("combobox", { name: "Tipo de memoria" })).toHaveValue("auto");
    await expect(manager.getByRole("combobox", { name: "Capacidad del equipo" })).toHaveValue("auto");
    await expect(manager.getByRole("combobox", { name: "Modelo local", exact: true })).toHaveValue("qwen-small");
    expect(mutations).toEqual([]);
    if (index === 1) {
      await expect(manager.getByText("Memoria unificada total", { exact: true })).toBeVisible();
      await expect(manager.getByText("CPU y GPU utilizan la misma memoria unificada indicada arriba.", { exact: true })).toBeVisible();
    }
    if (index === 2) await expect(manager.getByText("VRAM total: 24 GiB · VRAM libre: 23 GiB", { exact: true })).toBeVisible();
  }
  for (const [width, height] of [[360, 800], [1280, 920]] as const) {
    await page.setViewportSize({ width, height });
    await manager.scrollIntoViewIfNeeded();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1);
    await manager.screenshot({ path: info.outputPath(`deteccion-automatica-${width}.png`) });
  }
  await manager.getByRole("combobox", { name: "Tipo de memoria" }).selectOption("ram");
  await manager.getByRole("combobox", { name: "Capacidad del equipo" }).selectOption("8");
  await expect(manager.getByText("Recomendación para documentos: Qwen3.8 27B", { exact: true })).toBeVisible();
  expect(mutations).toEqual([]);
});

test("el catálogo se consulta sin Ollama y nunca instala al filtrar", async ({ page }) => {
  const mutations: string[] = [];
  await page.route("**/api/integrations/llm", route => route.fulfill({ json: {
    enabled: false, config: { preset: "custom", apiUrl: "https://example.invalid/v1", model: "fixture", requireApproval: true, allowDemo: false }, presets: {},
  } }));
  await page.route("**/api/integrations/llm/local", route => {
    if (route.request().method() !== "GET") mutations.push(route.request().method());
    return route.fulfill({ json: { runtime: "unavailable", message: "Abre Ollama en el equipo que aloja LexOpen y vuelve a comprobar.", models: [], installed: [], installedCount: 0 } });
  });
  await loginAs(page, "socio@estudio.cl");
  await page.goto("/configuracion#llm-settings");
  const manager = page.getByRole("region", { name: "Modelos de IA locales", exact: true });
  await expect(manager.getByRole("link", { name: "Obtener Ollama", exact: true })).toBeVisible();
  await manager.getByRole("combobox", { name: "Tipo de memoria" }).selectOption("unified");
  await manager.getByRole("combobox", { name: "Capacidad del equipo" }).selectOption("128");
  await manager.getByRole("button", { name: "Elegir gpt-oss 120B", exact: true }).click();
  await expect(manager.getByRole("combobox", { name: "Modelo local", exact: true })).toHaveValue("gpt-oss-120b");
  await expect(manager.getByRole("button", { name: /^Descargar/ })).toHaveCount(0);
  expect(mutations).toEqual([]);
});
