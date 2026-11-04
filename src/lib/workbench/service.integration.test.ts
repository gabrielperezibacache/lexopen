/** New disposable PostgreSQL + fictitious sources only; local recipe fixture is not Docker evidence. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { storeEvidenceSnapshot } from "@/lib/evidence/service";
import { sha256 } from "@/lib/evidence/fragments";
import { putObject } from "@/lib/storage";
import { readCaseWriting } from "@/lib/writings/service";
import { exportCaseWriting } from "@/lib/writings/export";
import { createWorkbenchRun, readWorkbenchRun, listWorkbenchRuns, cancelWorkbenchRun, importWorkbenchWriting, readWorkbenchArtifact } from "./service";
import { executeWorkbenchRun } from "./worker";
import { workbenchSourceCatalog } from "./sources";
import { assertPlainDocx, type RecipeInput, type RuntimeArtifact } from "./runtime";
import type { WorkbenchDestination } from "./policy";

const status = (code: number) => (error: unknown) => Number((error as { status?: number }).status) === code;
const config = { enabled: true, imageId: "sha256:" + "a".repeat(64), host: "unix:///var/run/docker.sock", executable: "fixture-not-docker" };
const destination: WorkbenchDestination = { mode: "source_packet", provider: "local_recipe", model: "none", endpoint: "Fictitious local recipe", endpointHash: sha256("none"), remote: false, permitted: true, key: sha256("fictitious destination") };
const setup = { config, capability: async () => ({ available: true, reason: "Fictitious fixture capability; not a Docker test", version: "fixture", formats: ["markdown", "docx"], isolation: "fixture" }), destination: async () => destination };
async function renderFixture(input: RecipeInput): Promise<RuntimeArtifact[]> {
  const root = await mkdtemp(path.join(tmpdir(), "lexopen-workbench-recipe-fixture-"));
  try {
    await writeFile(path.join(root, "input.json"), JSON.stringify(input));
    const python = "import importlib.util,json,pathlib,sys;spec=importlib.util.spec_from_file_location('recipe',sys.argv[1]);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module);module.build(json.loads(pathlib.Path(sys.argv[2]).read_text()),pathlib.Path(sys.argv[3]))";
    const result = spawnSync("python3", ["-I", "-B", "-c", python, path.resolve("scripts/workbench/recipe.py"), path.join(root, "input.json"), root], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const artifacts = [];
    for (const name of ["borrador.md", "borrador.docx"]) { const data = await readFile(path.join(root, name)); artifacts.push({ name, data, sha256: sha256(data), mimeType: name.endsWith(".docx") ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "text/markdown; charset=utf-8" }); }
    assertPlainDocx(artifacts[1].data); return artifacts;
  } finally { await rm(root, { recursive: true, force: true }); }
}
async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  assert.equal(url, new URL(process.env.DATABASE_URL!).toString());
  if ([process.env.S3_BUCKET, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) throw Error("Requires isolated fictitious local storage");
  const root = await mkdtemp(path.join(tmpdir(), "lexopen-workbench-source-fixture-")), previous = process.env.STORAGE_PATH; process.env.STORAGE_PATH = root;
  const db = new PrismaClient({ datasources: { db: { url } } }), tag = randomUUID(), users: string[] = [], cases: string[] = [];
  const realFetch = globalThis.fetch; let network = 0, rendered = 0;
  globalThis.fetch = (async () => { network++; throw Error("Unexpected network access in fixture test"); }) as typeof fetch;
  try {
    const owner = await db.user.create({ data: { name: "Profesional ficticio", email: `${tag}-owner@workbench.invalid`, role: "abogado", password: "not-a-login" } }); users.push(owner.id);
    const colleague = await db.user.create({ data: { name: "Colega ficticio", email: `${tag}-colleague@workbench.invalid`, role: "abogado", password: "not-a-login" } }); users.push(colleague.id);
    const admin = await db.user.create({ data: { name: "Administrador ficticio", email: `${tag}-admin@workbench.invalid`, role: "admin", password: "not-a-login" } }); users.push(admin.id);
    const cause = await db.causa.create({ data: { titulo: "Causa ficticia de pruebas", tribunal: "Tribunal ficticio", materia: "civil", acceso: "equipo", abogadoId: owner.id } }); cases.push(cause.id);
    const other = await db.causa.create({ data: { titulo: "Otra causa ficticia", tribunal: "Tribunal ficticio", materia: "civil", acceso: "equipo", abogadoId: owner.id } }); cases.push(other.id);
    await db.causaMiembro.create({ data: { causaId: cause.id, userId: colleague.id, rol: "colaborador" } });
    const text = "El comprobante ficticio registra el pago de cien pesos el 2 de noviembre de 2026. Es un dato de prueba, sin personas reales.", bytes = Buffer.from(text), key = `workbench-test/${tag}/source`;
    await putObject({ key, body: bytes, contentType: "text/plain" });
    const document = await db.documento.create({ data: { nombre: "Comprobante ficticio", tipo: "evidencia", causaId: cause.id, autorId: owner.id, contenido: text, extractedMarkdown: text, storageKey: key, mimeType: "text/plain", extractionStatus: "completed" } });
    await db.$transaction(tx => storeEvidenceSnapshot(tx, { documentoId: document.id, name: document.nombre, bytes, text, storageKey: key, status: "completed" }));
    const catalog = await workbenchSourceCatalog(cause.id, owner, undefined, db); assert.equal(catalog.sources.length, 1);
    const selected = catalog.sources[0], source = { fragmentId: selected.fragmentId, versionId: selected.versionId, quote: selected.quote };
    const input = { requestId: randomUUID(), objective: "Ordenar los antecedentes ficticios de pago", mode: "source_packet" as const, destinationKey: destination.key, allowRemote: false, sources: [source] };
    const pair = await Promise.all([createWorkbenchRun(cause.id, input, owner, db, setup), createWorkbenchRun(cause.id, input, owner, db, setup)]);
    assert.equal(pair[0].run.id, pair[1].run.id); const id = pair[0].run.id;
    await assert.rejects(createWorkbenchRun(cause.id, { ...input, objective: "Otro objetivo ficticio" }, owner, db, setup), status(409));
    await assert.rejects(createWorkbenchRun(other.id, { ...input, requestId: randomUUID() }, owner, db, setup), status(404));
    await assert.rejects(createWorkbenchRun(cause.id, { ...input, requestId: randomUUID(), sources: [{ ...source, versionId: "incorrect-version" }] }, owner, db, setup), status(409));
    await assert.rejects(createWorkbenchRun(cause.id, { ...input, requestId: randomUUID(), sources: [] }, owner, db, setup), error => (error as Error).name === "ZodError");
    await assert.rejects(readWorkbenchRun(cause.id, id, colleague, db), status(404)); await assert.rejects(readWorkbenchRun(cause.id, id, admin, db), status(404));
    const options = { config, destination: async () => destination, render: async (value: RecipeInput) => { rendered++; return renderFixture(value); } };
    const done = await executeWorkbenchRun(cause.id, id, owner, db, options);
    assert.equal(done.status, "awaiting_review"); assert.equal(done.artifacts.length, 2); assert.match(done.body, /sin inferencias|No contiene análisis/);
    assert.equal((await executeWorkbenchRun(cause.id, id, owner, db, options)).status, "awaiting_review"); assert.equal(rendered, 1);
    const docx = done.artifacts.find(artifact => artifact.name.endsWith(".docx"))!;
    assertPlainDocx((await readWorkbenchArtifact(cause.id, id, docx.id, owner, db)).data);
    const imports = await Promise.all([importWorkbenchWriting(cause.id, id, owner, db), importWorkbenchWriting(cause.id, id, owner, db)]);
    assert.equal(imports[0].draftId, imports[1].draftId); assert.equal(await db.workbenchImportReceipt.count({ where: { runId: id } }), 1);
    const writing = await readCaseWriting(cause.id, imports[0].draftId, owner, db); assert.equal(writing.references.length, 1); assert.equal(writing.references[0].source.kind, "document");
    assert.match((await exportCaseWriting(cause.id, writing.id, "markdown", owner, db)).content, /Pasaje del expediente/);
    await db.workbenchRun.update({ where: { id }, data: { body: "Resultado alterado fuera del flujo" } });
    await assert.rejects(readWorkbenchRun(cause.id, id, owner, db), status(409)); await assert.rejects(importWorkbenchWriting(cause.id, id, owner, db), status(409));
    await db.workbenchRun.update({ where: { id }, data: { body: done.body } });
    const cancelled = await createWorkbenchRun(cause.id, { ...input, requestId: randomUUID() }, owner, db, setup);
    await cancelWorkbenchRun(cause.id, cancelled.run.id, owner, db); assert.equal((await executeWorkbenchRun(cause.id, cancelled.run.id, owner, db, options)).status, "cancelled"); assert.equal(rendered, 1);
    await assert.rejects(importWorkbenchWriting(cause.id, cancelled.run.id, owner, db), status(409));
    const stale = await createWorkbenchRun(cause.id, { ...input, requestId: randomUUID() }, owner, db, setup);
    await db.workbenchRun.update({ where: { id: stale.run.id }, data: { status: "running", leaseToken: "expired-fixture", leaseExpiresAt: new Date(Date.now() - 1_000) } });
    await assert.rejects(executeWorkbenchRun(cause.id, stale.run.id, owner, db, options), status(409));
    assert.equal((await db.workbenchRun.findUniqueOrThrow({ where: { id: stale.run.id } })).status, "interrupted");
    const remote = { ...destination, mode: "assisted_draft" as const, provider: "fixture_remote", remote: true, key: sha256("remote fixture") }, remoteSetup = { ...setup, destination: async () => remote };
    await assert.rejects(createWorkbenchRun(cause.id, { ...input, requestId: randomUUID(), mode: "assisted_draft", destinationKey: remote.key }, owner, db, remoteSetup), status(403));
    const live = await createWorkbenchRun(cause.id, { ...input, requestId: randomUUID(), mode: "assisted_draft", destinationKey: remote.key, allowRemote: true }, owner, db, remoteSetup);
    let drafting!: () => void; const entered = new Promise<void>(resolve => { drafting = resolve; }); let stopped = false;
    const execution = executeWorkbenchRun(cause.id, live.run.id, owner, db, { ...options, destination: async () => remote, generate: async ({ signal }) => { drafting(); return new Promise((_resolve, reject) => { signal.addEventListener("abort", () => { stopped = true; reject(Error("cancelled fake LLM")); }, { once: true }); }); } });
    await entered; await cancelWorkbenchRun(cause.id, live.run.id, owner, db); assert.equal((await execution).status, "cancelled"); assert.equal(stopped, true); assert.equal(rendered, 1);
    const revoked = await createWorkbenchRun(cause.id, { ...input, requestId: randomUUID() }, owner, db, setup);
    await db.documento.update({ where: { id: document.id }, data: { confidencial: true } }); await db.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "doc.confidential.read" } });
    await assert.rejects(importWorkbenchWriting(cause.id, id, owner, db), status(404));
    assert.equal((await listWorkbenchRuns(cause.id, owner, db)).runs.every(run => !run.available), true);
    await assert.rejects(executeWorkbenchRun(cause.id, revoked.run.id, owner, db, options), status(404));
    assert.equal((await db.workbenchRun.findUniqueOrThrow({ where: { id: revoked.run.id } })).status, "blocked");
    assert.equal(rendered, 1); assert.equal(network, 0);
    await db.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "" } });
    const snapshot = await db.workbenchInputSnapshot.findFirstOrThrow({ where: { runId: id } }); await db.workbenchInputSnapshot.update({ where: { id: snapshot.id }, data: { sourceJson: snapshot.sourceJson + " " } });
    await assert.rejects(readWorkbenchRun(cause.id, id, owner, db), status(409));
    console.log("Workbench fixture integration passed: source scope/version/hash, private ownership, remote consent, real OOXML fixture, durable dedupe/import, cancellation and revoked-source gates. Docker not exercised.");
  } finally {
    globalThis.fetch = realFetch;
    await db.workbenchRun.deleteMany({ where: { causaId: { in: cases } } });
    await db.caseWritingDraft.deleteMany({ where: { causaId: { in: cases } } });
    await db.documento.deleteMany({ where: { causaId: { in: cases } } });
    await db.causaMiembro.deleteMany({ where: { causaId: { in: cases } } });
    await db.activity.deleteMany({ where: { userId: { in: users } } }); await db.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await db.causa.deleteMany({ where: { id: { in: cases } } }); await db.user.deleteMany({ where: { id: { in: users } } });
    await db.$disconnect(); process.env.STORAGE_PATH = previous; await rm(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
