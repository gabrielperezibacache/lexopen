import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
const fixturePath = new URL("../../fixtures/evaluation/local-models.v1.json", import.meta.url);
const norm = value => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function localOrigin(value) {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || !["127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw Error("Use un origen literal de loopback, sin credenciales ni ruta");
  return url.origin;
}
function strings(value) { return Array.isArray(value) && value.every(x => typeof x === "string") ? value : null; }
function exactSet(actual, expected) {
  const wanted = new Set(expected.map(norm)), found = new Set(actual.map(norm));
  const matches = [...found].filter(x => wanted.has(x)).length;
  return { precision: found.size ? matches / found.size : 0, recall: matches / wanted.size, extra: [...found].filter(x => !wanted.has(x)).length };
}
export function scoreResponse(example, content) {
  let value; try { value = JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")); } catch { return { validJson: false, score: 0 }; }
  if (!value || typeof value !== "object" || Array.isArray(value)) return { validJson: false, score: 0 };
  const ref = example.reference;
  if (example.task === "extraction") {
    const names = strings(value.names), dates = strings(value.dates);
    if (!names || !dates) return { validJson: true, validShape: false, score: 0 };
    const n = exactSet(names, ref.names), d = exactSet(dates, ref.dates);
    return { validJson: true, names: n, dates: d, score: (n.precision + n.recall + d.precision + d.recall) / 4 };
  }
  if (example.task === "abstention") { const abstained = value.answer === null && Array.isArray(value.citations) && value.citations.length === 0; return { validJson: true, abstained, unsupportedAnswer: !abstained, score: Number(abstained) }; }
  if (example.task === "citation") {
    const citations = Array.isArray(value.citations) ? value.citations : [];
    const valid = citations.filter(c => c && c.sourceId === ref.sourceId && c.quote === ref.quote).length;
    const supported = citations.length > 0 && valid === citations.length && typeof value.answer === "string" && (value.answer === ref.answer || value.answer === ref.quote);
    return { validJson: true, referenceAccuracy: citations.length ? valid / citations.length : 0, unsupportedAnswer: !supported, score: Number(supported), requiresHumanReview: true };
  }
  if (typeof value.text !== "string" || !value.text.trim()) return { validJson: true, validShape: false, score: 0 };
  const text = norm(value.text), matched = ref.required.filter(variants => variants.some(v => text.includes(norm(v)))).length;
  const addedDates = [...new Set(value.text.match(/\b\d{4}-\d{2}-\d{2}\b/g) || [])].filter(d => !ref.allowedDates.includes(d));
  const tooLong = example.task === "summary" && value.text.trim().split(/\s+/).length > 60;
  return { validJson: true, literalCoverage: matched / ref.required.length, addedDates, tooLong, score: addedDates.length || tooLong ? 0 : matched / ref.required.length, requiresHumanReview: true };
}
async function request(origin, route, timeoutMs, body) {
  const response = await fetch(origin + route, { method: body ? "POST" : "GET", redirect: "error", signal: AbortSignal.timeout(timeoutMs), headers: body ? { "Content-Type": "application/json" } : {}, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw Error(`Ollama respondió HTTP ${response.status} en ${route}`);
  const reader = response.body.getReader(); let size = 0; const buffers = [];
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 2 * 1024 * 1024) throw Error("Respuesta local demasiado grande"); buffers.push(Buffer.from(value)); } }
  finally { await reader.cancel().catch(() => {}); }
  return JSON.parse(Buffer.concat(buffers).toString("utf8"));
}
const bytes = n => Number.isSafeInteger(n) && n >= 0 ? n : null;
export async function evaluateLocalModels({ models, baseUrl = "http://127.0.0.1:11434", tasks, timeoutMs = 60000 }) {
  const origin = localOrigin(baseUrl);
  if (!Array.isArray(models) || !models.length || models.length > 16 || models.some(x => typeof x !== "string" || !/^[\w./:-]{1,200}$/.test(x)) || new Set(models).size !== models.length) throw Error("Indique de 1 a 16 modelos instalados distintos");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000) throw Error("Timeout inválido");
  const raw = await readFile(fixturePath), corpus = JSON.parse(raw), selected = tasks ? corpus.cases.filter(c => tasks.includes(c.id)) : corpus.cases;
  if (!selected.length || tasks?.some(id => !corpus.cases.some(c => c.id === id))) throw Error("Tareas desconocidas");
  const report = { format: 1, evaluator: "lexopen-local-eval-1", corpus: corpus.version, corpusSha256: createHash("sha256").update(raw).digest("hex"), startedAt: new Date().toISOString(), origin, options: { temperature: 0, seed: 42, num_ctx: 2048, num_predict: 512 },
    hardware: { platform: os.platform(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0]?.model ?? null, logicalCpus: os.cpus().length, totalMemoryBytes: os.totalmem(), freeMemoryBeforeBytes: os.freemem() },
    limitations: [corpus.notice, "Puntuaciones literales y de citas; no evalúan íntegramente semántica ni corrección profesional.", "Memoria reportada por Ollama en una muestra posterior; no equivale al pico de RAM del proceso. Latencia incluye carga y HTTP; no hay precalentamiento ni ganador universal."], status: "completed", models: [] };
  async function requireLocalOnly() { const state = await request(origin, "/api/status", Math.min(timeoutMs, 10000)); if (state.cloud?.disabled !== true) throw Error("Ollama no confirma el modo exclusivamente local; desactive su nube y reinicie el motor"); }
  let tags;
  try { await requireLocalOnly(); tags = await request(origin, "/api/tags", Math.min(timeoutMs, 10000)); if (!Array.isArray(tags.models)) throw Error("Catálogo local inválido"); }
  catch (error) { return { ...report, status: "unavailable", error: error.message, completedAt: new Date().toISOString(), models: models.map(model => ({ model, status: "unavailable", tasks: [] })) }; }
  for (const model of models) {
    const installed = tags.models.find(m => m.name === model);
    if (!installed) { report.models.push({ model, status: "not-installed", tasks: [] }); report.status = "incomplete"; continue; }
    if (installed.remote_model || installed.remote_host) { report.models.push({ model, status: "non-local", tasks: [] }); report.status = "incomplete"; continue; }
    const result = { model, digest: typeof installed.digest === "string" ? installed.digest : null, quantization: typeof installed.details?.quantization_level === "string" ? installed.details.quantization_level : null, modelBytes: bytes(installed.size), status: "completed", tasks: [] };
    for (const example of selected) {
      const start = performance.now();
      try {
        await requireLocalOnly();
        const response = await request(origin, "/api/chat", timeoutMs, { model, stream: false, format: "json", options: report.options, messages: [{ role: "system", content: "Trabaja únicamente con el texto ficticio proporcionado. Devuelve el objeto JSON pedido, sin herramientas ni información externa." }, { role: "user", content: example.source + "\n\n" + example.instruction }] });
        if (response.remote_host || response.remote_model) throw Error("El motor informó ejecución remota");
        if (response.model && response.model !== model) throw Error("El motor respondió con otro modelo");
        if (response.done_reason !== undefined && response.done_reason !== "stop") throw Error("Generación interrumpida o limitada por tokens");
        if (typeof response.message?.content !== "string" || response.done !== true) throw Error("Generación incompleta o sin texto");
        const wallMs = performance.now() - start;
        let memory = { ollamaReportedBytes: null, ollamaReportedVramBytes: null, available: false };
        try { const ps = await request(origin, "/api/ps", Math.min(timeoutMs, 10000)); const loaded = ps.models?.find(m => m.name === model); if (loaded) memory = { ollamaReportedBytes: bytes(loaded.size), ollamaReportedVramBytes: bytes(loaded.size_vram), available: bytes(loaded.size) !== null }; } catch { /* Missing telemetry remains explicit. */ }
        const duration = Number.isFinite(response.eval_duration) && response.eval_duration > 0 ? response.eval_duration / 1e9 : null;
        result.tasks.push({ id: example.id, task: example.task, status: "completed", wallMs, generatedTokens: bytes(response.eval_count), tokensPerSecond: duration && bytes(response.eval_count) !== null ? response.eval_count / duration : null, loadMs: Number.isFinite(response.load_duration) && response.load_duration >= 0 ? response.load_duration / 1e6 : null, memory, response: response.message.content, metrics: scoreResponse(example, response.message.content) });
      } catch (error) { result.status = "incomplete"; report.status = "incomplete"; result.tasks.push({ id: example.id, task: example.task, status: "failed", wallMs: performance.now() - start, error: error.message }); }
    }
    result.measurementStatus = result.tasks.every(t => t.status === "completed" && t.memory?.available && t.tokensPerSecond !== null) ? "observed" : "partial";
    report.models.push(result);
  }
  return { ...report, completedAt: new Date().toISOString(), hardware: { ...report.hardware, freeMemoryAfterBytes: os.freemem() } };
}
const cell = value => String(value ?? "sin medición").replace(/[|\r\n]/g, " ");
export function markdownReport(report) {
  return `# Evaluación local ${cell(report.corpus)}\n\nEstado: ${cell(report.status)}. CPU: ${cell(report.hardware.cpu)} · ${cell(report.hardware.arch)}.\n\n| Modelo | Cuantización | Tarea | Estado | Latencia ms | tokens/s | Bytes Ollama | Puntuación literal |\n| --- | --- | --- | --- | ---: | ---: | ---: | ---: |\n` + report.models.flatMap(m => m.tasks.length ? m.tasks.map(t => `| ${cell(m.model)} | ${cell(m.quantization)} | ${cell(t.id)} | ${cell(t.status)} | ${cell(t.wallMs?.toFixed(1))} | ${cell(t.tokensPerSecond?.toFixed(2))} | ${cell(t.memory?.ollamaReportedBytes)} | ${cell(t.metrics?.score)} |`) : [`| ${cell(m.model)} | ${cell(m.quantization)} | — | ${cell(m.status)} | — | — | — | — |`]).join("\n") + "\n\n" + report.limitations.map(s => `- ${s}`).join("\n") + "\n\nEl JSON conserva respuestas y telemetría para revisión; no hay clasificación universal.\n";
}
export async function main(args) {
  const flags = {};
  for (let i = 0; i < args.length; i += 2) { if (!["--models", "--base-url", "--tasks", "--json", "--markdown", "--timeout-ms"].includes(args[i]) || !args[i + 1] || args[i + 1].startsWith("--") || args[i] in flags) throw Error("Uso: --models nombre:edición[,otro:edición] [--tasks extract,summary,citation,rewrite,unsupported] [--json archivo] [--markdown archivo]"); flags[args[i]] = args[i + 1]; }
  if (flags["--json"] && flags["--markdown"] && path.resolve(flags["--json"]) === path.resolve(flags["--markdown"])) throw Error("JSON y Markdown necesitan destinos distintos");
  const report = await evaluateLocalModels({ models: flags["--models"]?.split(","), baseUrl: flags["--base-url"], tasks: flags["--tasks"]?.split(","), timeoutMs: flags["--timeout-ms"] ? Number(flags["--timeout-ms"]) : undefined });
  for (const [flag, content] of [["--json", JSON.stringify(report, null, 2) + "\n"], ["--markdown", markdownReport(report)]]) if (flags[flag]) { await mkdir(path.dirname(path.resolve(flags[flag])), { recursive: true }); await writeFile(flags[flag], content); }
  if (!flags["--json"]) process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (report.status !== "completed") process.exitCode = 2;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 2; });
