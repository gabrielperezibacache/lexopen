import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { evaluateLocalModels, scoreResponse, localOrigin, markdownReport } from "./local-models.mjs";
const corpus = JSON.parse(await readFile(new URL("../../fixtures/evaluation/local-models.v1.json", import.meta.url)));
const answers = [
  { names: ["Elisa Prado", "Tomás Valle"], dates: ["2026-11-03", "2026-11-04"] },
  { text: "Elisa Prado entregó el informe el 2026-11-03. Está pendiente de revisión y no se ha presentado ante un tribunal." },
  { answer: "2026-11-18", citations: [{ sourceId: "F1", quote: "La reunión se celebrará el 2026-11-18." }] },
  { text: "Elisa Prado, entregue el informe el 2026-11-20. El monto registrado es 120000 pesos." },
  { answer: null, citations: [] },
];
test("literal references reject invented dates, entities and unsupported citations", () => {
  corpus.cases.forEach((example, i) => assert.equal(scoreResponse(example, JSON.stringify(answers[i])).score, 1));
  assert.equal(scoreResponse(corpus.cases[0], JSON.stringify({ ...answers[0], names: [...answers[0].names, "Persona inventada"] })).names.extra, 1);
  assert.equal(scoreResponse(corpus.cases[2], JSON.stringify({ ...answers[2], citations: [{ sourceId: "F2", quote: answers[2].citations[0].quote }] })).unsupportedAnswer, true);
  assert.equal(scoreResponse(corpus.cases[1], JSON.stringify({ text: answers[1].text + " Vence el 2026-11-30." })).score, 0);
  assert.equal(scoreResponse(corpus.cases[4], JSON.stringify({ answer: "2026-11-30", citations: [] })).unsupportedAnswer, true);
  assert.equal(scoreResponse(corpus.cases[1], "not JSON").validJson, false);
  for (const url of ["https://remote.invalid", "http://127.0.0.1@remote.invalid", "http://localhost:11434", "http://127.0.0.1/other", "http://127.0.0.1?token=secret"]) assert.throws(() => localOrigin(url));
});
async function fixture(handler) {
  const seen = [], server = createServer(async (req, res) => {
    const buffers = []; for await (const buffer of req) buffers.push(buffer);
    const body = buffers.length ? JSON.parse(Buffer.concat(buffers).toString()) : null;
    seen.push({ url: req.url, body });
    const result = handler(req.url, body, res);
    if (!res.headersSent) { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(result)); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return { seen, origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}
test("installed-only evaluation records metadata, measured latency and telemetry without downloads", async () => {
  let n = 0;
  const f = await fixture((route, body) => {
    if (route === "/api/status") return { cloud: { disabled: true } };
    if (route === "/api/tags") return { models: [{ name: "fixture:installed", digest: "sha256:fictitious", size: 100, details: { quantization_level: "Q4_FIXTURE" } }] };
    if (route === "/api/ps") return { models: [{ name: "fixture:installed", size: 80, size_vram: 20 }] };
    assert.equal(route, "/api/chat"); assert.equal(body.model, "fixture:installed"); assert.equal(body.stream, false);
    assert.deepEqual(body.options, { temperature: 0, seed: 42, num_ctx: 2048, num_predict: 512 });
    return { done: true, message: { content: JSON.stringify(answers[n++]) }, eval_count: 10, eval_duration: 1000000000, load_duration: 1000000 };
  });
  try {
    const report = await evaluateLocalModels({ models: ["fixture:installed", "fixture:missing"], baseUrl: f.origin });
    assert.equal(report.status, "incomplete"); assert.equal(report.models[1].status, "not-installed");
    assert.equal(report.models[0].quantization, "Q4_FIXTURE"); assert.equal(report.models[0].digest, "sha256:fictitious");
    assert.equal(report.models[0].tasks.length, 5); assert(report.models[0].tasks.every(t => t.metrics.score === 1 && t.wallMs > 0 && t.tokensPerSecond === 10 && t.memory.ollamaReportedVramBytes === 20));
    assert.equal(f.seen.filter(r => r.url === "/api/chat").length, 5);
    assert(f.seen.every(r => ["/api/status", "/api/tags", "/api/chat", "/api/ps"].includes(r.url)));
    assert(report.hardware.totalMemoryBytes > 0); assert.match(report.corpusSha256, /^[a-f0-9]{64}$/);
    assert.match(markdownReport(report), /not-installed/); assert.match(markdownReport(report), /no hay clasificación universal/);
  } finally { await f.close(); }
});
test("partial generation and absent hardware measurements are explicit", async () => {
  const f = await fixture(route => route === "/api/status" ? { cloud: { disabled: true } } : route === "/api/tags" ? { models: [{ name: "fixture:partial" }] } : route === "/api/ps" ? {} : { done: false, message: { content: "{}" } });
  try { const report = await evaluateLocalModels({ models: ["fixture:partial"], baseUrl: f.origin, tasks: ["extract"] }); assert.equal(report.status, "incomplete"); assert.equal(report.models[0].tasks[0].status, "failed"); assert.equal(report.models[0].quantization, null); }
  finally { await f.close(); }
  const noTelemetry = await fixture(route => route === "/api/status" ? { cloud: { disabled: true } } : route === "/api/tags" ? { models: [{ name: "fixture:installed" }] } : route === "/api/ps" ? {} : { done: true, message: { content: JSON.stringify(answers[0]) } });
  try { const r = await evaluateLocalModels({ models: ["fixture:installed"], baseUrl: noTelemetry.origin, tasks: ["extract"] }); assert.equal(r.models[0].tasks[0].memory.available, false); assert.equal(r.models[0].tasks[0].tokensPerSecond, null); }
  finally { await noTelemetry.close(); }
});
test("redirected catalogs never cause remote generation", async () => {
  const f = await fixture((_route, _body, res) => { res.writeHead(302, { Location: "https://example.invalid" }); res.end(); });
  try { const r = await evaluateLocalModels({ models: ["fixture:installed"], baseUrl: f.origin, tasks: ["extract"] }); assert.equal(r.status, "unavailable"); assert.equal(f.seen.length, 1); }
  finally { await f.close(); }
});

 test("cloud-enabled daemons and installed remote aliases never generate", async () => {
  const cloud = await fixture(() => ({ cloud: { disabled: false } }));
  try { const r = await evaluateLocalModels({ models: ["fixture:installed"], baseUrl: cloud.origin }); assert.equal(r.status, "unavailable"); assert.deepEqual(cloud.seen.map(r => r.url), ["/api/status"]); }
  finally { await cloud.close(); }
  const alias = await fixture(route => route === "/api/status" ? { cloud: { disabled: true } } : { models: [{ name: "fixture:remote", remote_host: "https://example.invalid", remote_model: "other" }] });
  try { const r = await evaluateLocalModels({ models: ["fixture:remote"], baseUrl: alias.origin }); assert.equal(r.models[0].status, "non-local"); assert.equal(alias.seen.some(r => r.url === "/api/chat"), false); }
  finally { await alias.close(); }
});
 test("mode is checked again before generation and mismatched engines are rejected", async () => {
  let reads = 0;
  const changed = await fixture(route => route === "/api/status" ? { cloud: { disabled: reads++ === 0 } } : { models: [{ name: "fixture:installed" }] });
  try { const r = await evaluateLocalModels({ models: ["fixture:installed"], baseUrl: changed.origin, tasks: ["extract"] }); assert.equal(r.status, "incomplete"); assert.equal(changed.seen.some(r => r.url === "/api/chat"), false); }
  finally { await changed.close(); }
  const wrong = await fixture(route => route === "/api/status" ? { cloud: { disabled: true } } : route === "/api/tags" ? { models: [{ name: "fixture:installed" }] } : { model: "another:model", done: true, message: { content: JSON.stringify(answers[0]) } });
  try { const r = await evaluateLocalModels({ models: ["fixture:installed"], baseUrl: wrong.origin, tasks: ["extract"] }); assert.equal(r.status, "incomplete"); assert.match(r.models[0].tasks[0].error, /otro modelo/); }
  finally { await wrong.close(); }
});
